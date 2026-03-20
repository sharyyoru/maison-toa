# Demo Mode Setup Instructions

This document explains how to set up the demo mode for the aesthetic clinic CRM.

## Overview

The demo mode allows users to log in with demo credentials and experience the full functionality of the app with sample data, completely isolated from real production data.

**Demo Credentials:**
- Email: `demo@aliice.space`
- Password: `demotest`

## Database Setup

### Step 1: Run Migration Scripts

Run the following migration scripts in order in your Supabase SQL editor:

1. `migrations/20241217_demo_mode_support.sql` - Adds `is_demo` flags to all tables
2. `migrations/20241217_demo_rls_policies.sql` - Sets up Row Level Security policies for data isolation
3. `migrations/20241217_demo_user_and_data.sql` - Seeds demo data

### Step 2: Create Demo User in Supabase Auth

You need to create the demo user in Supabase Auth:

#### Option A: Using Supabase Dashboard
1. Go to Authentication > Users in your Supabase dashboard
2. Click "Add user" > "Create new user"
3. Enter:
   - Email: `demo@aliice.space`
   - Password: `demotest`
   - Auto Confirm User: Yes
4. Click "Create user"

#### Option B: Using SQL
Run this in Supabase SQL editor (replace with actual password hash):

```sql
-- Note: This requires admin access and the actual implementation depends on your Supabase setup
-- It's recommended to use the dashboard method above
```

### Step 3: Mark User as Demo

After creating the auth user, mark them as a demo user:

```sql
-- Update the users table to mark this user as demo
UPDATE users 
SET is_demo = true, 
    role = 'staff',
    full_name = 'Demo User',
    email = 'demo@aliice.space'
WHERE email = 'demo@aliice.space';
```

If the user doesn't exist in the users table yet, insert them:

```sql
-- Get the auth user ID first
SELECT id FROM auth.users WHERE email = 'demo@aliice.space';

-- Then insert into users table (replace YOUR_USER_ID with the actual ID from above)
INSERT INTO users (id, role, full_name, email, is_demo)
VALUES ('YOUR_USER_ID', 'staff', 'Demo User', 'demo@aliice.space', true)
ON CONFLICT (id) DO UPDATE 
SET is_demo = true;
```

## How It Works

### Data Isolation

The system uses Row Level Security (RLS) policies to automatically filter data based on the user's demo status:

- Demo users only see data where `is_demo = true`
- Regular users only see data where `is_demo = false`
- All new records created by demo users automatically have `is_demo = true`

### Technical Implementation

1. **Database Level**: RLS policies ensure data isolation at the database level
2. **Application Level**: The `is_demo` flag is automatically added to all new records
3. **Cached Status**: User's demo status is cached for 5 minutes to reduce database queries

### Key Files

- `src/lib/demoMode.ts` - Demo mode detection utilities
- `src/lib/supabaseDemo.ts` - Helper functions for demo-aware database operations
- `migrations/20241217_*.sql` - Database migration files

## Testing

1. Log out of the application
2. Log in with demo credentials:
   - Email: `demo@aliice.space`
   - Password: `demotest`
3. Verify you can see demo patients, appointments, deals, etc.
4. Create new records and verify they are isolated from real data
5. Log out and log in with a regular account
6. Verify you cannot see any demo data

## Maintenance

### Adding New Demo Data

To add more demo data, create SQL scripts similar to `20241217_demo_user_and_data.sql` with `is_demo = true` for all records.

### Adding New Tables

When adding new tables that should support demo mode:

1. Add `is_demo boolean not null default false` column
2. Create an index: `create index [table]_is_demo_idx on [table](is_demo);`
3. Add RLS policy following the pattern in `20241217_demo_rls_policies.sql`
4. Add the table name to `DEMO_TABLES` array in `src/lib/supabaseDemo.ts`

## Troubleshooting

### Demo user can't log in
- Verify the user exists in Supabase Auth
- Check that the password is correct
- Verify the user's email is confirmed

### Demo user sees no data
- Check that demo data was seeded properly: `SELECT count(*) FROM patients WHERE is_demo = true;`
- Verify RLS policies are enabled: `SELECT tablename, policyname FROM pg_policies WHERE tablename = 'patients';`
- Check that the user is marked as demo: `SELECT is_demo FROM users WHERE email = 'demo@aliice.space';`

### Demo user sees real data or vice versa
- Verify RLS policies are working: Check the policy definitions in the database
- Clear the demo status cache by logging out and back in
- Verify the `is_current_user_demo()` function is working correctly
