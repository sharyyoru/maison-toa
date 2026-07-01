# Appointment Email and Reminder Changes

## Summary

This change updates the Appointments page email behavior for manually created, modified, and deleted appointments.

The main goal is to make patient emails explicit: users choose when to send appointment emails, while the 24-hour reminder workflow stays synchronized with the appointment date and time.

## Files Changed

- `src/app/appointments/page.tsx`
- `src/app/api/appointments/create-multi/route.ts`
- `src/app/api/appointments/send-confirmation/route.ts`

## Create Appointment Changes

The create appointment modal now includes a checkbox below `Repeat appointment`:

- Label: `Send email notification`
- Default state: unchecked

When unchecked:

- The appointment is created.
- No appointment confirmation email is sent.
- No 24-hour reminder email is scheduled from the manual Appointments page flow.

When checked:

- The appointment confirmation email is sent.
- A 24-hour reminder email is scheduled in `scheduled_emails` when the reminder time is still in the future.
- If the appointment is less than 24 hours away, no 24-hour reminder is scheduled because the reminder time would already be in the past.

## Personalized Confirmation Message

When `Send email notification` is checked during appointment creation, a `Personalized message` textarea appears.

That message is included only in the appointment confirmation email:

- Immediately after the introductory paragraph.
- Before the appointment details table.
- Using the same paragraph styling as the surrounding email text.
- No box, title, or special formatting is added.

The personalized message is not included in the 24-hour reminder email.

## Create-Multi API Reminder Scheduling

`/api/appointments/create-multi` now accepts:

```json
{
  "sendEmailNotification": true
}
```

When this flag is true and the patient has an email address, the API creates pending rows in `scheduled_emails` for patient reminders.

Each reminder row includes:

- `patient_id`
- `appointment_id`
- `recipient_type: "patient"`
- `recipient_email`
- localized subject
- generated reminder email body
- `scheduled_for` set to 24 hours before appointment start
- `status: "pending"`

The response now includes:

```json
{
  "remindersScheduled": 1
}
```

## Appointment Modification Email

Appointment date/time changes now prompt the user after the change is saved.

The popup title is:

```text
Appointment modified
```

It asks whether to send an appointment modification email and includes:

- `Send email notification` checkbox, unchecked by default.
- `Personalized message` textarea, visible only when the checkbox is checked.
- `Skip` button.
- `Continue` button.

When unchecked:

- No modification email is sent.
- Existing pending 24-hour reminder behavior still continues.

When checked:

- A modified appointment email is sent immediately.
- The personalized message is included immediately after the intro paragraph and before appointment details.
- The 24-hour reminder remains active if a valid future reminder time exists.

## Modification Paths Covered

The modification popup is now shown for all appointment time-change paths on the Appointments page:

- Editing date/time in the appointment edit modal.
- Dragging and dropping an appointment to a new time or doctor column.
- Resizing an appointment by dragging the bottom handle to change the end time.

The popup is only shown when the appointment has a patient email address.

## Modified Email Template

`/api/appointments/send-confirmation` now supports:

```json
{
  "emailType": "modification"
}
```

Supported email types:

- `confirmation`
- `modification`
- `cancellation`

For modification emails:

- The subject changes to appointment-modified wording.
- The intro paragraph changes to explain that the appointment was modified.
- Patient form creation is skipped.
- The same branded email layout and appointment details table are reused.

## Appointment Cancellation Email

Deleting an appointment now opens an email-choice popup after the delete confirmation.

The popup title is:

```text
Appointment cancelled
```

It includes:

- `Send appointment cancelled email` checkbox, unchecked by default.
- `Personalized message` textarea, visible only when the checkbox is checked.
- `Do not send email` button.
- `Send and delete` button.

When `Do not send email` is selected:

- No cancellation email is sent.
- The appointment is deleted.
- Any scheduled reminder emails for that appointment are deleted from `scheduled_emails`.

When `Send appointment cancelled email` is selected:

- A cancellation email is sent immediately.
- The personalized message is included immediately after the intro paragraph and before appointment details.
- The appointment is deleted.
- Any scheduled reminder emails for that appointment are deleted from `scheduled_emails`.

For cancellation emails:

- The subject changes to appointment-cancelled wording.
- The intro paragraph changes to explain that the appointment was cancelled.
- Patient form creation is skipped.
- The same branded email layout and appointment details table are reused.

## Reminder Behavior on Appointment Changes

When an appointment time changes, the app checks for an existing pending patient reminder in `scheduled_emails`.

If one exists:

- It is moved to 24 hours before the new appointment start time.

If the new reminder time is already in the past:

- The pending reminder is deleted.

If no pending reminder exists:

- No new reminder is created during modification.

The modification email checkbox does not control reminders. It only controls whether the immediate modification email is sent.

When an appointment is deleted:

- All scheduled emails tied to that appointment are deleted before the appointment record is removed.
- This happens whether or not the cancellation email is sent.

## Validation

Validated with:

```bash
npx eslint src\app\appointments\page.tsx src\app\api\appointments\send-confirmation\route.ts
npm run build
```

Results:

- Targeted ESLint passed with existing warnings in `src/app/appointments/page.tsx`.
- Production build passed.

Note: one build run initially failed due to stale `.next` cache page-data errors for unrelated API routes. Clearing `.next` inside the repo and rerunning `npm run build` passed.
