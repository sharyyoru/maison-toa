# Email Migration Guide

## Overview

Migrate `email_logs` from old Alice system to the new `emails` table.

## Step 1: Export from Old Database

### Option A: MySQL (if old Alice uses MySQL)
```sql
SELECT 
  id, subject, body, from_email, to_email, 
  direction, type, status, activity_log_id, 
  message_id, created_at, updated_at
FROM email_logs
INTO OUTFILE '/tmp/email_logs.json'
-- OR use a tool like DBeaver/TablePlus to export as JSON
```

### Option B: PostgreSQL
```sql
COPY (
  SELECT json_agg(row_to_json(e)) 
  FROM email_logs e
) TO '/tmp/email_logs.json';
```

### Option C: Use a Database Client
1. Open DBeaver, TablePlus, or similar
2. Run: `SELECT * FROM email_logs`
3. Export results as JSON
4. Save as `scripts/old-email-logs.json`

## Step 2: Place the Export File

Save the exported JSON file to:
```
aesthetic-clinic/scripts/old-email-logs.json
```

The JSON should be an array like:
```json
[
  {
    "id": 1,
    "subject": "Your Appointment is Confirmed",
    "body": "<!DOCTYPE html>...",
    "from_email": "aliiceform@aliice.space",
    "to_email": "ralf@mutant.ae",
    "direction": "outbound",
    "type": "general",
    "status": "sent",
    "activity_log_id": 1,
    "message_id": null,
    "created_at": "2025-05-26 22:08:46",
    "updated_at": "2025-05-26 22:08:46"
  },
  ...
]
```

## Step 3: Run the Migration

```bash
cd aesthetic-clinic

# Install ts-node if not already installed
npm install -D ts-node

# Run the migration script
npx ts-node scripts/migrate-email-logs.ts
```

## What the Script Does

1. **Loads** all email_logs from the JSON file
2. **Fetches** all patients from the new database
3. **Matches** emails to patients by email address:
   - For outbound emails: matches `to_email` → `patients.email`
   - For inbound emails: matches `from_email` → `patients.email`
4. **Inserts** emails into the new `emails` table in batches
5. **Reports** success/failure counts

## Field Mapping

| Old Field | New Field | Notes |
|-----------|-----------|-------|
| `subject` | `subject` | Direct copy |
| `body` | `body` | HTML preserved |
| `from_email` | `from_address` | Direct copy |
| `to_email` | `to_address` | Direct copy |
| `direction` | `direction` | Direct copy |
| `status` | `status` | Mapped to enum |
| `created_at` | `created_at` | Direct copy |
| `created_at` | `sent_at` | Used for sent emails |
| (matched) | `patient_id` | Matched by email |
| (none) | `deal_id` | NULL |
| `type` | — | Not migrated* |

*The `type` field is not in the new schema. If you want to preserve it, we can add a `legacy_type` column.

## Handling Edge Cases

### Emails with no patient match
These are imported with `patient_id = NULL`. You can:
1. Leave them as-is (they'll appear in Email Reports but not in patient timelines)
2. Manually link them later via SQL
3. Run a second pass to match by name in email body

### Duplicate emails
The script doesn't check for duplicates. Run it only once, or clear the `emails` table first:
```sql
-- ⚠️ DANGER: This deletes all emails!
TRUNCATE TABLE emails CASCADE;
```

## Verification

After migration, verify the counts:
```sql
SELECT 
  direction,
  status,
  COUNT(*) as count,
  COUNT(patient_id) as with_patient
FROM emails
GROUP BY direction, status;
```
