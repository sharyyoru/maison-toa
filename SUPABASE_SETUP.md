# Supabase Setup Guide for Maison Toa

## Prerequisites
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed
- A Supabase project created at https://supabase.com

## Step 1: Login to Supabase CLI

```bash
supabase login
```

## Step 2: Link to Your Supabase Project

```bash
cd C:\Users\user\maison-toa
supabase link --project-ref YOUR_PROJECT_REF
```

Replace `YOUR_PROJECT_REF` with your actual project reference (found in Supabase Dashboard > Project Settings > General).

## Step 3: Push the Database Schema

```bash
supabase db push
```

This will apply the `supabase/schema.sql` to your remote database.

## Step 4: Run Migrations

```bash
supabase db push
```

Or run specific migrations:
```bash
supabase migration up
```

## Step 5: Create Admin Users

Run the following commands to create the two admin users:

```bash
# Create Wilson Admin
supabase auth admin create-user --email wilson@mutant.ae --password wilsontest --email-confirm

# Create Louise Goerig Admin  
supabase auth admin create-user --email louise.goerig@maisontoa.com --password louisetest --email-confirm
```

### Alternative: Create Users via SQL (after they sign up)

If the CLI commands don't work, run this SQL in the Supabase Dashboard SQL Editor after users sign up:

```sql
-- Update user roles to admin
UPDATE public.users 
SET role = 'admin' 
WHERE email IN ('wilson@mutant.ae', 'louise.goerig@maisontoa.com');
```

## Step 6: Seed Initial Data (Optional)

```bash
supabase db reset --linked
```

Or run the seed file manually in SQL Editor:
- Copy contents of `supabase/seed.sql`
- Paste in Supabase Dashboard > SQL Editor
- Click Run

## Step 7: Update Environment Variables

Copy `.env.example` to `.env.local` and fill in your Supabase credentials:

```bash
cp .env.example .env.local
```

Get your credentials from Supabase Dashboard > Project Settings > API:
- `NEXT_PUBLIC_SUPABASE_URL` - Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` - service_role key (keep secret!)

## Quick Command Summary

```bash
# Full setup sequence
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push

# Create admin users
supabase auth admin create-user --email wilson@mutant.ae --password wilsontest --email-confirm
supabase auth admin create-user --email louise.goerig@maisontoa.com --password louisetest --email-confirm
```

## Troubleshooting

### If migrations fail
Run the main schema first via SQL Editor:
1. Go to Supabase Dashboard > SQL Editor
2. Copy contents of `supabase/schema.sql`
3. Run it

### If user creation fails
Create users manually:
1. Go to Supabase Dashboard > Authentication > Users
2. Click "Add user" > "Create new user"
3. Enter email and password
4. Then run the SQL to set admin role
