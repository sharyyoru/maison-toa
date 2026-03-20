# Supabase Migrations

## Required Migrations for Intake Form

Run these SQL scripts in your Supabase SQL Editor in order:

### 1. Create patient_health_background table
**File:** `001_create_patient_health_background.sql`

This table is **REQUIRED** for the intake form to save health/lifestyle data.

### 2. Ensure patient_insurances table
**File:** `002_ensure_patient_insurances.sql`

This ensures the insurance table exists with correct structure.

## How to Run

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of each migration file
4. Click **Run** to execute

## Troubleshooting

If you see errors like:
- "Could not find the table 'public.patient_health_background' in the schema cache"
- Health background data not saving

This means the migration hasn't been run. Execute the SQL scripts above.
