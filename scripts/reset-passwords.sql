-- Reset passwords for all auth users except louise and wilson
-- Generates random passwords and outputs them for reporting

DO $$
DECLARE
  user_record RECORD;
  new_password TEXT;
  password_hash TEXT;
  results TEXT := '';
BEGIN
  results := results || E'\n# Password Reset Report\n\n';
  results := results || 'Generated: ' || NOW()::TEXT || E'\n\n';
  results := results || '## Users with New Passwords\n\n';
  results := results || '| Email | New Password |\n';
  results := results || '|-------|-------------|\n';
  
  FOR user_record IN 
    SELECT id, email 
    FROM auth.users 
    WHERE email IS NOT NULL 
      AND email NOT IN ('louise.goerig@maisontoa.com', 'wilson@mutant.ae')
    ORDER BY email
  LOOP
    -- Generate random password (16 chars: letters, numbers, symbols)
    new_password := encode(gen_random_bytes(12), 'base64');
    -- Remove problematic chars, limit length
    new_password := regexp_replace(new_password, '[+/=]', '', 'g');
    new_password := substring(new_password, 1, 16);
    -- Ensure complexity by appending symbols
    new_password := new_password || '@2024!';
    
    -- Create bcrypt hash
    password_hash := crypt(new_password, gen_salt('bf', 10));
    
    -- Update password
    UPDATE auth.users 
    SET encrypted_password = password_hash,
        updated_at = NOW()
    WHERE id = user_record.id;
    
    results := results || '| ' || user_record.email || ' | ' || new_password || ' |\n';
    
    RAISE NOTICE 'Reset password for: %', user_record.email;
  END LOOP;
  
  results := results || E'\n## Excluded Users (Not Reset)\n\n';
  results := results || '- louise.goerig@maisontoa.com\n';
  results := results || '- wilson@mutant.ae\n';
  results := results || E'\n---\n';
  results := results || '**IMPORTANT**: Share passwords securely. This file contains sensitive information.\n';
  
  RAISE NOTICE '%', results;
END $$;
