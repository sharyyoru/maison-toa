# Demo User Setup Script

## Automatic Setup (Recommended)

### Step 1: Create Auth User via Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **Users**
3. Click **Add user** → **Create new user**
4. Fill in the form:
   - **Email**: `demo@aliice.space`
   - **Password**: `demotest`
   - **Auto Confirm User**: ✓ (checked)
5. Click **Create user**

### Step 2: Run Database Migrations

Execute these SQL scripts in your Supabase SQL Editor in this exact order:

```sql
-- 1. Add demo mode support to database
\i migrations/20241217_demo_mode_support.sql

-- 2. Set up Row Level Security policies
\i migrations/20241217_demo_rls_policies.sql

-- 3. Mark the demo user and seed demo data
-- First, get the auth user ID
SELECT id, email FROM auth.users WHERE email = 'demo@aliice.space';

-- Then insert/update the users table (replace YOUR_AUTH_USER_ID with the actual ID)
INSERT INTO users (id, role, full_name, email, is_demo, created_at)
VALUES ('YOUR_AUTH_USER_ID', 'staff', 'Demo User', 'demo@aliice.space', true, now())
ON CONFLICT (id) DO UPDATE 
SET is_demo = true, 
    role = 'staff',
    full_name = 'Demo User',
    email = 'demo@aliice.space';

-- Finally, seed the demo data
\i migrations/20241217_demo_user_and_data.sql
```

### Step 3: Verify Setup

Run these verification queries:

```sql
-- Verify demo user is marked correctly
SELECT id, email, is_demo, role FROM users WHERE email = 'demo@aliice.space';

-- Verify demo data exists
SELECT 'patients' as table_name, count(*) as demo_records FROM patients WHERE is_demo = true
UNION ALL
SELECT 'appointments', count(*) FROM appointments WHERE is_demo = true
UNION ALL
SELECT 'deals', count(*) FROM deals WHERE is_demo = true
UNION ALL
SELECT 'tasks', count(*) FROM tasks WHERE is_demo = true
UNION ALL
SELECT 'providers', count(*) FROM providers WHERE is_demo = true
UNION ALL
SELECT 'deal_stages', count(*) FROM deal_stages WHERE is_demo = true;

-- Verify RLS policies are active
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename IN ('patients', 'appointments', 'deals')
ORDER BY tablename;
```

Expected results:
- Demo user should have `is_demo = true`
- Demo data counts should be > 0
- RLS policies should be listed for each table

## Manual SQL Setup (Alternative)

If you prefer to do everything via SQL:

```sql
-- Step 1: Create auth user (this requires service role key)
-- Note: It's safer to use the Supabase dashboard for this step

-- Step 2: After creating auth user, run all migrations
\i migrations/20241217_demo_mode_support.sql
\i migrations/20241217_demo_rls_policies.sql

-- Step 3: Link and mark user as demo
INSERT INTO users (id, role, full_name, email, is_demo)
SELECT id, 'staff', 'Demo User', email, true
FROM auth.users 
WHERE email = 'demo@aliice.space'
ON CONFLICT (id) DO UPDATE 
SET is_demo = true;

-- Step 4: Seed demo data
\i migrations/20241217_demo_user_and_data.sql
```

## Testing the Demo Mode

1. **Log out** if currently logged in
2. Navigate to `/login`
3. Enter credentials:
   - Email: `demo@aliice.space`
   - Password: `demotest`
4. **Verify demo mode is active**:
   - You should see 5 demo patients
   - You should see demo appointments
   - All data should be clearly demo/sample data
5. **Test data isolation**:
   - Create a new patient in demo mode
   - Log out and log in with a real account
   - The patient you created should NOT be visible
6. **Test from real account**:
   - Log in with a real account
   - Create a new patient
   - Log out and log in as demo user
   - The patient should NOT be visible in demo mode

## Troubleshooting

### Issue: Demo user can't log in
**Solution**: 
- Verify user exists in auth.users: `SELECT * FROM auth.users WHERE email = 'demo@aliice.space'`
- Check email is confirmed
- Try resetting the password in Supabase dashboard

### Issue: Demo user sees no data
**Solution**:
```sql
-- Check if demo data exists
SELECT count(*) FROM patients WHERE is_demo = true;

-- If count is 0, run the seed script again
\i migrations/20241217_demo_user_and_data.sql
```

### Issue: Demo user sees real data
**Solution**:
```sql
-- Verify user is marked as demo
SELECT is_demo FROM users WHERE email = 'demo@aliice.space';

-- If false, update it
UPDATE users SET is_demo = true WHERE email = 'demo@aliice.space';

-- Verify RLS policies are enabled
SELECT tablename, rowsecurity FROM pg_tables 
WHERE tablename IN ('patients', 'appointments', 'deals');

-- If rowsecurity is false, run the RLS migration again
\i migrations/20241217_demo_rls_policies.sql
```

### Issue: Real users see demo data
**Solution**:
```sql
-- Verify real users are NOT marked as demo
SELECT email, is_demo FROM users WHERE is_demo = false;

-- If any real users have is_demo = true, fix them
UPDATE users SET is_demo = false WHERE email != 'demo@aliice.space' AND is_demo = true;
```

## Maintenance

### Adding More Demo Data

Create a new migration file with demo data:

```sql
-- migrations/20241218_more_demo_data.sql
INSERT INTO patients (id, first_name, last_name, email, is_demo, created_at)
VALUES 
  (gen_random_uuid(), 'John', 'Doe', 'john.doe@demo.com', true, now());
-- Add more demo records...
```

### Resetting Demo Data

To completely reset demo data:

```sql
-- WARNING: This deletes all demo data
DELETE FROM patients WHERE is_demo = true;
DELETE FROM appointments WHERE is_demo = true;
DELETE FROM deals WHERE is_demo = true;
DELETE FROM tasks WHERE is_demo = true;
DELETE FROM emails WHERE is_demo = true;
DELETE FROM documents WHERE is_demo = true;
DELETE FROM patient_notes WHERE is_demo = true;
DELETE FROM providers WHERE is_demo = true;
DELETE FROM deal_stages WHERE is_demo = true;

-- Then re-run the seed script
\i migrations/20241217_demo_user_and_data.sql
```
