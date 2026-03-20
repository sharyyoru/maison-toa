const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://mwtdhbllkzuryswrumrd.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13dGRoYmxsa3p1cnlzd3J1bXJkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk4NDYwNCwiZXhwIjoyMDg5NTYwNjA0fQ.oEugq48zPZRf8UDysgeKvXMVClq_i-JaGPXjDkTIJaQ';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function pushSchema() {
  try {
    // Read the schema file
    const schemaPath = path.join(__dirname, 'supabase', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Split into individual statements (basic split on semicolon followed by newline)
    const statements = schema
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`Found ${statements.length} SQL statements to execute`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (!stmt || stmt.length < 5) continue;
      
      try {
        // Use rpc to execute raw SQL via a function, or use REST API
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ sql: stmt + ';' })
        });
        
        if (response.ok) {
          successCount++;
        } else {
          const error = await response.text();
          if (!error.includes('already exists') && !error.includes('duplicate')) {
            console.log(`Statement ${i + 1} error: ${error.substring(0, 100)}`);
            errorCount++;
          } else {
            successCount++; // Already exists is fine
          }
        }
      } catch (err) {
        console.log(`Statement ${i + 1} failed: ${err.message}`);
        errorCount++;
      }
    }
    
    console.log(`\nCompleted: ${successCount} successful, ${errorCount} errors`);
  } catch (err) {
    console.error('Error:', err);
  }
}

pushSchema();
