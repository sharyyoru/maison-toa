# WhatsApp Integration Setup Guide

## ✅ Current Status
- **Provider**: Twilio WhatsApp API
- **Outbound Messages**: ✅ Working (with limitations)
- **Inbound Messages**: ✅ Webhook created - needs configuration
- **Environment Variables**: ✅ Configured correctly

## 🔧 Twilio Webhook Configuration (REQUIRED)

### Step 1: Deploy Your Application
Make sure your changes are deployed to production (Vercel).

### Step 2: Configure Twilio Webhook
1. Go to [Twilio Console](https://console.twilio.com/)
2. Navigate to: **Messaging → Services → WhatsApp senders**
3. Click on your WhatsApp number: `+17855723862`
4. Scroll to **Webhook Configuration**
5. Set **"WHEN A MESSAGE COMES IN"** webhook to:
   ```
   https://aestheticclinic.vercel.app/api/whatsapp/webhook
   ```
6. Method: **HTTP POST**
7. Click **Save**

### Step 3: Test Receiving Messages
1. Send a WhatsApp message to: `+17855723862`
2. Check your patient's WhatsApp tab in the CRM
3. The message should appear automatically

---

## ⚠️ WhatsApp Business API Limitations

### Session-Based Messaging Rules
**This applies to ALL providers (Twilio, Meta, 360Dialog, etc.)**

| Scenario | Can Send? | Requirements |
|----------|-----------|--------------|
| **First message to patient** | ❌ NO (without template) | Must use approved template |
| **Patient messages you first** | ✅ YES | 24-hour free messaging window opens |
| **Reply within 24 hours** | ✅ YES | Send any free-form message |
| **After 24 hours** | ❌ NO (without template) | Must use approved template again |

### What This Means
- If a patient messages you on WhatsApp → You have 24 hours to reply freely
- If you want to initiate a conversation → You must use an approved template
- After 24 hours of no reply → Back to requiring templates

---

## 📋 Creating WhatsApp Message Templates

### In Twilio Console:
1. Go to **Messaging → Content Editor**
2. Click **Create new template**
3. Example template:
   ```
   Hello {{1}},

   Your appointment at Aesthetic Clinic is scheduled for {{2}}.

   Please confirm by replying to this message.

   Thank you!
   ```
4. Submit for WhatsApp approval (takes 1-2 business days)

### Using Templates in Code:
```typescript
// In your WhatsApp conversation component
await fetch("/api/whatsapp/send", {
  method: "POST",
  body: JSON.stringify({
    patientId: "...",
    toNumber: "+41791234567",
    templateSid: "HX...", // Approved template SID
    templateVariables: {
      "1": "John Doe",
      "2": "January 20, 2026 at 10:00 AM"
    }
  })
});
```

---

## 🔄 Alternative Providers (If Twilio Doesn't Work)

### Option 1: 360Dialog (Recommended)
**Best for Swiss/EU clinics**
- Official WhatsApp BSP (Business Solution Provider)
- Same 24-hour rule, but better template approval times
- €49/month + per-message costs
- Setup: https://www.360dialog.com/

### Option 2: MessageBird
**Good alternative**
- Strong in Europe
- Similar pricing to Twilio
- Better template management UI
- Setup: https://messagebird.com/

### Option 3: WhatsApp Cloud API (Direct from Meta)
**Cheapest but complex**
- Free for first 1,000 conversations/month
- Requires Meta Business Account (not blocked)
- More complex setup
- Best for high volume

### Option 4: WATI (Non-technical option)
**Easiest but most expensive**
- No coding required
- Visual workflow builder
- $49-299/month
- Good for small teams
- Setup: https://www.wati.io/

---

## 🚀 Quick Test

### Test Sending (Current Setup):
1. Go to patient page
2. Click CRM tab → WhatsApp
3. Type a message and send
4. **It will work IF patient messaged you within last 24 hours**
5. **It will fail IF you're initiating first contact** (need template)

### Test Receiving (After webhook config):
1. Send a WhatsApp message to: `+17855723862`
2. Text should say: "Test from [Your Phone]"
3. Check the patient's WhatsApp tab
4. Message should appear within seconds

---

## 💡 Recommendations

### For Your Use Case (Medical Clinic):
**Best approach: Use templates for common scenarios**

1. **Appointment Confirmation Template**
   ```
   Hello {{patient_name}}, your appointment is confirmed for {{date}} at {{time}}.
   Reply to confirm or reschedule.
   ```

2. **Appointment Reminder Template** (24h before)
   ```
   Reminder: Your appointment at Aesthetic Clinic is tomorrow at {{time}}.
   See you soon!
   ```

3. **Follow-up Template** (after procedure)
   ```
   Hi {{patient_name}}, how are you feeling after your {{procedure}}?
   Please reply if you have any concerns.
   ```

Once patient replies to any template → 24-hour free messaging window opens → Have conversation freely

---

## 🔴 If Twilio Limitations Are Too Restrictive

**Consider switching to:**

1. **360Dialog** - Same rules, better experience
2. **WhatsApp Cloud API** - Cheapest for high volume
3. **SMS fallback** - Use Twilio SMS for immediate messages, WhatsApp for follow-ups

---

## Environment Variables Reference

```env
# Current (Twilio)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_FROM=+1234567890

# For 360Dialog (if switching)
# THREESIXTY_API_KEY=your_key_here
# THREESIXTY_CLIENT_ID=your_client_id

# For Meta Cloud API (if switching)
# META_WHATSAPP_PHONE_ID=your_phone_id
# META_WHATSAPP_TOKEN=your_token
# META_WHATSAPP_BUSINESS_ACCOUNT_ID=your_account_id
```

---

## Next Steps

1. ✅ Deploy the webhook handler (done)
2. 🔧 Configure Twilio webhook URL (you need to do this)
3. 📝 Create 2-3 message templates in Twilio
4. ✅ Test end-to-end messaging
5. 📊 Monitor usage and decide if templates are workable

If templates are too limiting → Consider 360Dialog or Meta Cloud API.
