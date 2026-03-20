/**
 * Run Database Migrations via Supabase Management API
 */

const https = require('https');
const fs = require('fs');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mwtdhbllkzuryswrumrd.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Extract project ref from URL
const projectRef = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');

// Read SQL file
const sqlContent = fs.readFileSync('scripts/manual-migrations.sql', 'utf-8');

// Split into individual statements
const statements = sqlContent
  .split(';')
  .map(s => s.trim())
  .filter(s => s && !s.startsWith('--'));

async function executeSQL(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sql });
    
    const options = {
      hostname: `${projectRef}.supabase.co`,
      port: 443,
      path: '/rest/v1/rpc/exec_sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runMigrations() {
  console.log('='.repeat(60));
  console.log('Database Migration Script');
  console.log('='.repeat(60));
  console.log(`\nProject: ${projectRef}`);
  console.log(`Statements to execute: ${statements.length}\n`);

  // Since we can't execute raw SQL via the REST API,
  // we'll output instructions for manual execution
  console.log('IMPORTANT: The Supabase REST API does not support raw SQL execution.');
  console.log('Please run the following SQL in Supabase SQL Editor:\n');
  console.log('1. Go to: https://supabase.com/dashboard/project/' + projectRef + '/sql/new');
  console.log('2. Copy and paste the contents of: scripts/manual-migrations.sql');
  console.log('3. Click "Run" to execute the migrations\n');
  
  console.log('SQL File location: scripts/manual-migrations.sql');
  console.log('\n' + '='.repeat(60));
  console.log('SQL Preview (first 2000 characters):');
  console.log('='.repeat(60));
  console.log(sqlContent.substring(0, 2000) + '...\n');
}

runMigrations();
