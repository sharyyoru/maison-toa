# Resend Email Setup Guide

This project uses **Resend** for sending transactional and marketing emails. Resend is a modern email API designed for developers with excellent deliverability and simple integration.

## Why Resend?

- **Simple REST API** - Easy to integrate and test
- **Built-in deliverability** - Handles SPF, DKIM, DMARC automatically
- **72-hour scheduled delivery** - Native support for delayed emails
- **Detailed analytics** - Track opens, clicks, bounces
- **Generous free tier** - 3,000 emails/month free

## Environment Variables

Add these to your `.env.local` file:

```bash
# Email service (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM_ADDRESS=info@mail.maisontoa.com
EMAIL_FROM_NAME=Maison Toa
EMAIL_REPLY_DOMAIN=mail.maisontoa.com
```

> **Note**: The verified domain in Resend is `mail.maisontoa.com` (subdomain). 
> Using a subdomain for sending is a best practice to protect the main domain's reputation.

## Domain Setup in Resend

1. Go to [Resend Dashboard](https://resend.com/domains)
2. Add your domain (e.g., `maisontoa.com`)
3. Add the DNS records Resend provides:
   - **SPF record** (TXT)
   - **DKIM record** (TXT)
   - **Return-Path** (CNAME or MX)
4. Verify the domain

## Email Features

### Transactional Emails
- Appointment confirmations
- Appointment reminders (24h before)
- Booking cancellation/reschedule notifications
- Patient form invitations

### Workflow Emails
- Deal stage change triggers
- Automated follow-up sequences
- Recurring email campaigns

### Marketing Emails
- Bulk campaigns with audience filtering
- Birthday campaigns
- Template-based personalization

## Scheduling Behavior

| Delay | Behavior |
|-------|----------|
| 0-72 hours | Uses Resend's native scheduling |
| >72 hours | Stored in `scheduled_emails` table, sent by cron job |

## API Endpoints Using Email

| Endpoint | Purpose |
|----------|---------|
| `/api/emails/send` | CRM email sending with attachments |
| `/api/appointments/create` | Appointment confirmation + reminders |
| `/api/appointments/send-confirmation` | Booking confirmations |
| `/api/public/book-appointment` | Public booking confirmations |
| `/api/cron/send-scheduled-emails` | Scheduled email delivery |
| `/api/marketing/campaigns/send` | Bulk marketing campaigns |
| `/api/workflows/deal-stage-changed` | Workflow automation |

## Testing

Send a test email via the workflow builder or use the API directly:

```bash
curl -X POST http://localhost:3000/api/emails/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "test@example.com",
    "subject": "Test Email",
    "html": "<h1>Hello World</h1>"
  }'
```

## Vercel Deployment

Add `RESEND_API_KEY` to your Vercel environment variables:

1. Go to Vercel project settings
2. Navigate to Environment Variables
3. Add `RESEND_API_KEY` with your API key
4. Redeploy the application

## Migrated from Mailgun

This project was migrated from Mailgun to Resend. Key changes:
- Centralized email logic in `src/lib/email.ts`
- Scheduling limit increased from 24h (Mailgun) to 72h (Resend)
- Simplified authentication (Bearer token vs Basic auth)
- Tags support for analytics tracking
