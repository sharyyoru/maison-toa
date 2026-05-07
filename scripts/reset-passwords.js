/**
 * Reset passwords for all auth users except louise and wilson
 * Uses Supabase's auth admin API or direct DB update with bcrypt
 */
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mwtdhbllkzuryswrumrd.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY env var required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Generate secure random password
function generatePassword(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

async function getUsers() {
  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  if (error) throw error;
  return users;
}

async function resetPassword(userId, newPassword) {
  const { data, error } = await supabase.auth.admin.updateUserById(userId, {
    password: newPassword
  });
  if (error) throw error;
  return data;
}

async function main() {
  const excludeEmails = ['louise.goerig@maisontoa.com', 'wilson@mutant.ae'];
  
  console.log('Fetching users...');
  const users = await getUsers();
  
  const targetUsers = users.filter(u => 
    u.email && !excludeEmails.includes(u.email.toLowerCase())
  );
  
  console.log(`Found ${targetUsers.length} users to reset (excluding louise and wilson)\n`);
  
  const results = [];
  
  for (const user of targetUsers) {
    const newPassword = generatePassword(16);
    try {
      await resetPassword(user.id, newPassword);
      results.push({
        email: user.email,
        password: newPassword,
        status: 'success'
      });
      console.log(`✓ ${user.email}`);
    } catch (err) {
      results.push({
        email: user.email,
        password: 'ERROR',
        status: `failed: ${err.message}`
      });
      console.log(`✗ ${user.email}: ${err.message}`);
    }
  }
  
  // Generate markdown output
  const md = `# Password Reset Report

Generated: ${new Date().toISOString()}

## Users with New Passwords

| Email | New Password | Status |
|-------|-------------|--------|
${results.map(r => `| ${r.email} | ${r.password} | ${r.status} |`).join('\n')}

## Excluded Users (Not Reset)

- louise.goerig@maisontoa.com
- wilson@mutant.ae

---
**IMPORTANT**: Share passwords securely. This file contains sensitive information.
`;
  
  console.log('\n--- MARKDOWN OUTPUT ---\n');
  console.log(md);
  
  // Also write to file
  const fs = require('fs');
  const filename = `/tmp/password-reset-report-${Date.now()}.md`;
  fs.writeFileSync(filename, md);
  console.log(`\nSaved to: ${filename}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
