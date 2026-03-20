# Demo Mode Documentation

## Overview

The aesthetic clinic CRM now includes a comprehensive **Demo Mode** that allows potential clients, stakeholders, or team members to explore the full functionality of the system without accessing or modifying real patient data.

### Demo Credentials

- **Email**: `demo@aliice.space`
- **Password**: `demotest`

## Key Features

### 🔒 Complete Data Isolation

- Demo users can only see demo data
- Real users never see demo data
- Database-level isolation via Row Level Security (RLS)
- All CRUD operations respect demo boundaries

### 📊 Full Functionality

Demo mode includes complete working examples of:

- **Patients**: 5 sample patients with realistic profiles
- **Appointments**: Multiple appointments in various states (scheduled, confirmed, completed)
- **Deals**: Sample deals in different pipeline stages
- **Tasks**: Active and completed tasks
- **Emails**: Sample email communications
- **Documents**: Generated documents and reports
- **Providers**: Demo doctors and specialists
- **Workflows**: Sample automation workflows
- **Email Templates**: Pre-configured templates

### 🎯 100% Feature Parity

The demo mode supports ALL app features:

- ✅ View and edit patients
- ✅ Schedule and manage appointments
- ✅ Create and track deals
- ✅ Send emails and messages
- ✅ Generate documents
- ✅ Create and assign tasks
- ✅ Configure workflows
- ✅ View analytics and reports
- ✅ Manage services and categories

## Architecture

### Database Layer

**Tables with Demo Support** (20+ tables):
- `patients`, `appointments`, `deals`, `tasks`, `emails`
- `whatsapp_messages`, `documents`, `patient_notes`
- `consultations`, `workflows`, `email_templates`
- `providers`, `deal_stages`, `chat_conversations`
- And more...

**Key Database Features**:
1. **`is_demo` column**: Added to all relevant tables
2. **RLS Policies**: Automatically filter data based on user's demo status
3. **Indexes**: Optimized queries with `is_demo` indexes
4. **Functions**: `is_current_user_demo()` helper function

### Application Layer

**Core Files**:

```
src/lib/demoMode.ts          # Demo status detection & caching
src/lib/supabaseDemo.ts      # Demo-aware database helpers
migrations/
  20241217_demo_mode_support.sql     # Add is_demo columns
  20241217_demo_rls_policies.sql     # RLS policies
  20241217_demo_user_and_data.sql    # Seed data
```

**How It Works**:

1. User logs in with demo credentials
2. System checks `users.is_demo` flag
3. Result is cached for 5 minutes
4. All database queries automatically filtered by RLS
5. New records inherit the user's demo status

## Setup Instructions

### Quick Setup (5 minutes)

1. **Create demo user in Supabase Auth**:
   - Go to Authentication → Users → Add user
   - Email: `demo@aliice.space`
   - Password: `demotest`
   - Auto-confirm: ✓

2. **Run migrations** in Supabase SQL Editor:
   ```sql
   \i migrations/20241217_demo_mode_support.sql
   \i migrations/20241217_demo_rls_policies.sql
   ```

3. **Mark user as demo**:
   ```sql
   UPDATE users 
   SET is_demo = true 
   WHERE email = 'demo@aliice.space';
   ```

4. **Seed demo data**:
   ```sql
   \i migrations/20241217_demo_user_and_data.sql
   ```

For detailed setup instructions, see [`scripts/setup-demo-user.md`](scripts/setup-demo-user.md).

## Usage

### For Demonstrations

1. Log in with demo credentials
2. Showcase any feature without risk
3. Create, edit, delete data freely
4. All changes stay in demo environment

### For Testing

1. Test new features in isolated environment
2. Verify permissions and data access
3. Validate workflows without affecting real data

### For Training

1. Train new staff with realistic data
2. Let them practice without consequences
3. Reset demo data as needed

## Security & Privacy

### Data Isolation Guarantees

✅ **Database Level**: RLS policies enforce separation  
✅ **Application Level**: Cached demo status prevents leaks  
✅ **User Level**: Demo users can't access real data  
✅ **Record Level**: Every record tagged with `is_demo`

### Verification

Test data isolation:

```sql
-- As demo user, should return only demo data
SELECT count(*) FROM patients WHERE is_demo = true;

-- As real user, should return 0
SELECT count(*) FROM patients WHERE is_demo = true;

-- Verify RLS is enforced
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'patients';
```

## Maintenance

### Adding Demo Data

Create new migration with `is_demo = true`:

```sql
INSERT INTO patients (first_name, last_name, email, is_demo)
VALUES ('Jane', 'Smith', 'jane@demo.com', true);
```

### Resetting Demo Data

```sql
-- Delete all demo data
DELETE FROM patients WHERE is_demo = true;
-- Re-run seed script
\i migrations/20241217_demo_user_and_data.sql
```

### Adding New Tables

When creating new tables:

1. Add `is_demo boolean not null default false`
2. Create index: `CREATE INDEX [table]_is_demo_idx ON [table](is_demo)`
3. Add RLS policy (see existing policies for pattern)
4. Add to `DEMO_TABLES` in `src/lib/supabaseDemo.ts`

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Can't log in | Verify user exists in Supabase Auth and is confirmed |
| No demo data visible | Run seed script: `\i migrations/20241217_demo_user_and_data.sql` |
| Seeing real data as demo | Verify `users.is_demo = true` and RLS policies are active |
| Demo data visible to real users | Verify real users have `is_demo = false` |

For detailed troubleshooting, see [`scripts/setup-demo-user.md`](scripts/setup-demo-user.md).

## Demo Data Summary

### Patients (5 total)
- Emma Thompson - Facial rejuvenation
- James Anderson - Hair restoration
- Sophia Martinez - Breast augmentation
- Oliver Davis - Rhinoplasty
- Isabella Wilson - Lip filler

### Providers (3 total)
- Dr. Sarah Williams (Plastic Surgery)
- Dr. Michael Chen (Dermatology)
- Dr. Emily Rodriguez (Cosmetic Surgery)

### Appointments (4 total)
- Mix of scheduled, confirmed, and completed
- Various dates and times
- Different providers and services

### Deals (4 total)
- Values ranging from $850 to $8,500
- Different pipeline stages
- Various services

### Tasks (4 total)
- Different statuses and priorities
- Assigned to various patients
- Mix of calls, emails, and todos

## Future Enhancements

Potential improvements:

- [ ] Automated demo data refresh (nightly)
- [ ] Demo mode indicator in UI
- [ ] Demo session analytics
- [ ] Bulk demo data generator
- [ ] Demo mode API for programmatic access

## Support

For issues or questions about demo mode:

1. Check troubleshooting guide
2. Review RLS policies in database
3. Verify migration execution
4. Check application logs

---

**Demo Mode Version**: 1.0  
**Last Updated**: December 17, 2024  
**Compatible With**: All app versions ≥ 0.1.0
