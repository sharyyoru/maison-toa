# WhatsApp Template Usage Examples

## After Template Approval

Once your templates are approved by WhatsApp (24-48 hours), you'll receive a `ContentSid` for each template.

### Store Your ContentSids

Add to `.env.local`:
```env
# WhatsApp Templates
WHATSAPP_TEMPLATE_OPT_IN=HXxxxxxxxxxxxxxxxxxxxxx
WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRM=HXxxxxxxxxxxxxxxxxxxxxx
WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER=HXxxxxxxxxxxxxxxxxxxxxx
WHATSAPP_TEMPLATE_FOLLOWUP=HXxxxxxxxxxxxxxxxxxxxxx
```

---

## Template Usage in Code

### 1. Sending Opt-In Template (First Contact)

```typescript
// When creating a new patient or first WhatsApp contact
const response = await fetch("/api/whatsapp/send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    patientId: patient.id,
    toNumber: patient.phone, // e.g., "+41791234567"
    templateSid: process.env.WHATSAPP_TEMPLATE_OPT_IN,
    // No variables needed for opt-in template
  })
});
```

### 2. Appointment Confirmation Template

```typescript
// After booking an appointment
const response = await fetch("/api/whatsapp/send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    patientId: patient.id,
    toNumber: patient.phone,
    templateSid: process.env.WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRM,
    templateVariables: {
      "1": "John Doe",
      "2": "January 20, 2026",
      "3": "10:00 AM",
      "4": "Aesthetics Clinic, Rue de Rhône 65, Geneva"
    }
  })
});
```

### 3. Appointment Reminder Template (24h before)

```typescript
// Scheduled job or triggered 24h before appointment
const response = await fetch("/api/whatsapp/send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    patientId: patient.id,
    toNumber: patient.phone,
    templateSid: process.env.WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER,
    templateVariables: {
      "1": "John Doe",
      "2": "10:00 AM",
      "3": "Rue de Rhône 65, 1204 Geneva"
    }
  })
});
```

### 4. Post-Procedure Follow-Up Template

```typescript
// 1-2 days after procedure
const response = await fetch("/api/whatsapp/send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    patientId: patient.id,
    toNumber: patient.phone,
    templateSid: process.env.WHATSAPP_TEMPLATE_FOLLOWUP,
    templateVariables: {
      "1": "John Doe",
      "2": "Botox treatment"
    }
  })
});
```

### 5. After Patient Replies - Free-Form Messaging

```typescript
// Once patient replies to ANY template, 24-hour window opens
// You can now send ANY message without a template
const response = await fetch("/api/whatsapp/send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    patientId: patient.id,
    toNumber: patient.phone,
    message: "Thank you for confirming! We look forward to seeing you. Feel free to ask any questions."
    // No templateSid needed - free-form message
  })
});
```

---

## Complete Workflow Example

```typescript
// STEP 1: New patient - send opt-in (first contact)
await sendOptInTemplate(patient);

// STEP 2: Patient clicks "Yes" button
// → Webhook receives message
// → 24-hour window OPENS

// STEP 3: Send free-form confirmation within 24 hours
await fetch("/api/whatsapp/send", {
  body: JSON.stringify({
    patientId: patient.id,
    toNumber: patient.phone,
    message: "Great! You'll now receive appointment reminders via WhatsApp."
  })
});

// STEP 4: Book appointment - send confirmation template
await sendAppointmentConfirmationTemplate(patient, appointmentDetails);

// STEP 5: Patient replies "Thanks!"
// → Another 24-hour window opens

// STEP 6: Have conversation freely
await fetch("/api/whatsapp/send", {
  body: JSON.stringify({
    patientId: patient.id,
    toNumber: patient.phone,
    message: "If you need to reschedule, just let us know anytime!"
  })
});

// STEP 7: 24 hours before appointment - send reminder template
await sendAppointmentReminderTemplate(patient, appointmentDetails);

// STEP 8: After procedure - send follow-up template
await sendFollowUpTemplate(patient, procedureDetails);
```

---

## UI Integration

### Update WhatsApp Conversation Component

Add template selector to the UI:

```typescript
// src/components/WhatsAppConversation.tsx

const [useTemplate, setUseTemplate] = useState(false);
const [selectedTemplate, setSelectedTemplate] = useState<string>("");

// Add to the UI:
<div className="flex items-center gap-2 mb-2">
  <label className="flex items-center gap-2 text-xs">
    <input
      type="checkbox"
      checked={useTemplate}
      onChange={(e) => setUseTemplate(e.target.checked)}
    />
    Use Template
  </label>
  
  {useTemplate && (
    <select
      value={selectedTemplate}
      onChange={(e) => setSelectedTemplate(e.target.value)}
      className="text-xs rounded px-2 py-1 border"
    >
      <option value="">Select template...</option>
      <option value="appointment_confirm">Appointment Confirmation</option>
      <option value="appointment_reminder">Appointment Reminder</option>
      <option value="followup">Post-Procedure Follow-Up</option>
    </select>
  )}
</div>
```

---

## Common Scenarios

### Scenario 1: Patient Never Messaged Before
✅ Must use template (opt-in first, then other templates)
❌ Cannot send free-form message

### Scenario 2: Patient Replied Within Last 24 Hours
✅ Can send any free-form message
✅ Can also use templates

### Scenario 3: Patient Last Replied 3 Days Ago
✅ Must use template to restart conversation
❌ Cannot send free-form message

---

## Testing Your Templates

### Test Flow:
1. Deploy your app with templates configured
2. Send opt-in template to YOUR personal phone
3. Reply "Yes"
4. Try sending free-form message within 24 hours → Should work ✅
5. Wait 25 hours
6. Try sending free-form message → Should fail ❌
7. Send appointment template → Should work ✅
8. Reply to template
9. Send free-form message → Should work ✅

---

## Troubleshooting

### Template Rejected by WhatsApp
- Body text too promotional → Make it informational
- Missing opt-out option → Add "Reply STOP to unsubscribe"
- Unclear purpose → Be specific about what messages they'll receive

### Message Fails with "Template Required"
- Patient hasn't messaged in 24 hours
- Use a template to restart conversation window

### Template Variables Not Populating
- Check variable numbering ({{1}}, {{2}}, etc.)
- Ensure variable order matches template definition
- Variables must be strings

---

## Best Practices

1. **Always start with opt-in template** for new patients
2. **Use templates for scheduling** (appointments, reminders)
3. **Switch to free-form for conversations** (within 24h window)
4. **Create template variations** for different procedures
5. **Track template performance** in Twilio console
6. **Keep templates short** (under 1024 characters)
7. **Include call-to-action** in every template
8. **Add opt-out instructions** ("Reply STOP to unsubscribe")
