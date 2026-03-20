# Demo Setup for stenorio@roteglobal.com.ec

This guide explains how to set up the demo environment for the `stenorio@roteglobal.com.ec` account with 100 patients and comprehensive demo data.

## Prerequisites

1. The user `stenorio@roteglobal.com.ec` must already exist in Supabase Auth
2. The demo mode migrations must be applied (`20241217_demo_mode_support.sql`, `20241217_demo_rls_policies.sql`)

## Step 1: Mark User as Demo

Run this SQL in Supabase SQL Editor:

```sql
-- Mark stenorio@roteglobal.com.ec as a demo user
UPDATE users 
SET is_demo = true 
WHERE email = 'stenorio@roteglobal.com.ec';

-- Verify
SELECT id, email, is_demo, role FROM users WHERE email = 'stenorio@roteglobal.com.ec';
```

## Step 2: Seed Comprehensive Demo Data

Run the comprehensive demo data migration:

```sql
\i migrations/20250210_comprehensive_demo_data.sql
```

Or copy and paste the contents of `migrations/20250210_comprehensive_demo_data.sql` into the Supabase SQL Editor.

## Step 3: Verify Demo Data

Run these verification queries:

```sql
SELECT 'patients' as table_name, count(*) as demo_records FROM patients WHERE is_demo = true
UNION ALL SELECT 'appointments', count(*) FROM appointments WHERE is_demo = true
UNION ALL SELECT 'consultations', count(*) FROM consultations WHERE is_demo = true
UNION ALL SELECT 'deals', count(*) FROM deals WHERE is_demo = true
UNION ALL SELECT 'tasks', count(*) FROM tasks WHERE is_demo = true
UNION ALL SELECT 'emails', count(*) FROM emails WHERE is_demo = true
UNION ALL SELECT 'patient_notes', count(*) FROM patient_notes WHERE is_demo = true
UNION ALL SELECT 'documents', count(*) FROM documents WHERE is_demo = true
UNION ALL SELECT 'providers', count(*) FROM providers WHERE is_demo = true
UNION ALL SELECT 'deal_stages', count(*) FROM deal_stages WHERE is_demo = true;
```

### Expected Results:

| Table | Expected Count |
|-------|----------------|
| patients | 100 |
| appointments | ~200 |
| consultations | ~180 (100 consults + 80 invoices) |
| deals | 70 |
| tasks | 100 |
| emails | 80 |
| patient_notes | 100 |
| documents | 50 |
| providers | 5 |
| deal_stages | 6 |

## Data Overview

### Patients (100)
- Diverse names with Spanish/Latin American theme
- Mix of genders (60% female, 40% male)
- Ages ranging from 25-65
- Various professions and lifecycle stages
- Distribution across Quito, Guayaquil, and Cuenca

### Appointments (~200)
- Past completed appointments
- Upcoming scheduled appointments
- Mix of consultation types
- Distributed across 5 demo providers

### Consultations & Invoices (~180)
- Medical consultation records with clinical notes
- Invoice records with realistic amounts ($250 - $15,000)
- 75% of invoices marked as paid
- Various payment methods (Cash, Online, Bank Transfer)

### Deals (70)
- Pipeline deals in various stages
- Values from $1,500 to $35,000
- Common aesthetic procedures

### Tasks (100)
- Mix of todo, call, and email tasks
- Various priorities and statuses
- Assigned to different dates

## Cleanup (If Needed)

To remove all demo data:

```sql
-- WARNING: This will delete ALL demo data
DELETE FROM emails WHERE is_demo = true;
DELETE FROM documents WHERE is_demo = true;
DELETE FROM patient_notes WHERE is_demo = true;
DELETE FROM tasks WHERE is_demo = true;
DELETE FROM deals WHERE is_demo = true;
DELETE FROM consultations WHERE is_demo = true;
DELETE FROM appointments WHERE is_demo = true;
DELETE FROM patients WHERE is_demo = true;
DELETE FROM providers WHERE is_demo = true;
DELETE FROM deal_stages WHERE is_demo = true;
```

## Troubleshooting

### Demo user sees no data
1. Verify the user is marked as demo: `SELECT is_demo FROM users WHERE email = 'stenorio@roteglobal.com.ec';`
2. Check RLS policies are active
3. Clear browser cache and re-login

### Data not appearing
1. Verify demo data exists: `SELECT count(*) FROM patients WHERE is_demo = true;`
2. Check for SQL errors in the migration output
3. Ensure all migrations ran in correct order

### Mixed demo/real data
1. Check that RLS policies are properly configured
2. Verify `is_current_user_demo()` function exists and works
