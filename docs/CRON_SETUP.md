# Cron Job Setup: Scheduled Email Sender

This guide explains how to set up the cron job that sends scheduled reminder emails for appointments.

## Why This Is Needed

Mailgun only allows scheduling emails up to **24 hours in advance**. For appointments more than 2 days away, reminder emails are stored in the `scheduled_emails` database table and sent by this cron job when they become due.

---

## Option 1: Vercel Cron (Recommended)

### Step 1: Add Environment Variable

Add `CRON_SECRET` to your Vercel project environment variables:

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add a new variable:
   - **Name:** `CRON_SECRET`
   - **Value:** Generate a secure random string (e.g., `openssl rand -hex 32`)
   - **Environment:** Production, Preview, Development

### Step 2: Verify vercel.json

The `vercel.json` file in the project root should contain:

```json
{
  "crons": [
    {
      "path": "/api/cron/send-scheduled-emails",
      "schedule": "0 * * * *"
    }
  ]
}
```

This runs the cron job **every hour at minute 0**.

### Step 3: Deploy

Deploy your project to Vercel:

```bash
vercel --prod
```

### Step 4: Verify Cron Job

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Cron Jobs**
3. You should see the scheduled job listed
4. Check **Deployments** → **Functions** logs to see cron execution

---

## Option 2: External Cron Service (cron-job.org, EasyCron, etc.)

### Step 1: Add Environment Variable

Add `CRON_SECRET` to your hosting environment:

```bash
CRON_SECRET=your-secure-random-string-here
```

### Step 2: Configure External Service

1. Sign up for a cron service like [cron-job.org](https://cron-job.org) (free)
2. Create a new cron job with these settings:

   - **URL:** `https://your-domain.com/api/cron/send-scheduled-emails`
   - **Schedule:** Every hour (`0 * * * *`)
   - **Method:** GET
   - **Headers:**
     ```
     Authorization: Bearer YOUR_CRON_SECRET_VALUE
     ```

### Step 3: Test the Endpoint

```bash
curl -X GET "https://your-domain.com/api/cron/send-scheduled-emails" \
  -H "Authorization: Bearer YOUR_CRON_SECRET_VALUE"
```

Expected response:
```json
{
  "message": "Scheduled emails processed",
  "sent": 0,
  "failed": 0,
  "total": 0
}
```

---

## Option 3: Supabase Edge Functions (if using Supabase)

### Step 1: Create Edge Function

```bash
supabase functions new send-scheduled-emails
```

### Step 2: Add Function Code

In `supabase/functions/send-scheduled-emails/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const response = await fetch(
    `${Deno.env.get("SITE_URL")}/api/cron/send-scheduled-emails`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${Deno.env.get("CRON_SECRET")}`,
      },
    }
  );
  
  const data = await response.json();
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
});
```

### Step 3: Deploy and Schedule

```bash
supabase functions deploy send-scheduled-emails
```

Then use Supabase's pg_cron or external scheduler to call this function hourly.

---

## Database Table Required

Ensure the `scheduled_emails` table exists with these columns:

```sql
CREATE TABLE IF NOT EXISTS scheduled_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id),
  appointment_id UUID REFERENCES appointments(id),
  recipient_type TEXT NOT NULL, -- 'patient' or 'provider'
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_scheduled_emails_status_scheduled ON scheduled_emails(status, scheduled_for);
```

---

## Monitoring

### Check Pending Emails

```sql
SELECT count(*) as pending 
FROM scheduled_emails 
WHERE status = 'pending' 
AND scheduled_for <= now();
```

### Check Recent Sends

```sql
SELECT * 
FROM scheduled_emails 
WHERE status = 'sent' 
ORDER BY sent_at DESC 
LIMIT 20;
```

### Check Failures

```sql
SELECT * 
FROM scheduled_emails 
WHERE status = 'failed' 
ORDER BY created_at DESC 
LIMIT 20;
```

---

## Troubleshooting

### Cron not running
- Verify `vercel.json` is in the project root
- Check Vercel dashboard for cron job status
- Ensure the project is on a Pro plan (Vercel Hobby has limited cron)

### 401 Unauthorized
- Verify `CRON_SECRET` environment variable is set
- Ensure the Authorization header matches exactly

### Emails not sending
- Check Mailgun credentials (`MAILGUN_API_KEY`, `MAILGUN_DOMAIN`)
- Verify `scheduled_emails` table has pending records
- Check the cron logs for errors

### Emails stuck in pending
- Verify cron is actually running (check logs)
- Ensure `scheduled_for` timestamp has passed
- Check for database connection issues
