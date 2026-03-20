# Automation Workflow Console Logging Guide

## Overview
This guide explains how to monitor automation workflows in the browser console, specifically for the "Operation Set" stage task creation automation.

## Workflow Trigger Points

### 1. Deal Stage Changed (Patient Deal → Operation Set)
**Location**: `src/app/api/workflows/deal-stage-changed/route.ts`

**Triggered from**:
- `src/app/deals/page.tsx` (lines 398-410) - When dragging deals between stages
- `src/app/patients/[id]/PatientActivityCard.tsx` (lines 1475-1487) - When updating deal stage from patient page

### 2. Console Logs to Monitor

When a deal is moved to "Operation Set" stage, the following console logs will appear:

#### A. Workflow Matching
```
Running X actions for workflow [workflow-id]
```
- Shows how many actions will be executed for the matched workflow

#### B. Action Processing
```
Processing action: create_task {"title":"...","assign_to":"...","due_days":...}
```
- Shows the action type and configuration being processed

#### C. Task Creation Details
```
Task config.title: "Follow up with {{patient.first_name}} {{patient.last_name}}"
Template context patient: {id: "...", first_name: "...", last_name: "...", email: "...", phone: "..."}
Rendered task name: "Follow up with John Doe"
```
- Shows the template rendering process for task names

#### D. Success Confirmation
```
Created task: Follow up with John Doe
```
- Confirms the task was successfully created

#### E. Error Logs (if any)
```
Failed to create task: [error details]
Failed to load workflows: [error details]
Workflow [workflow-id] has no actions to run
```

## How to Test the Automation

### Step 1: Open Browser Console
1. Open your application in the browser
2. Press `F12` or `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)
3. Navigate to the **Console** tab

### Step 2: Navigate to Deals Page
Go to `/deals` or open a patient's activity card

### Step 3: Move a Deal to "Operation Set"
Drag a patient deal card to the "Operation Set" stage column

### Step 4: Monitor Console Output
You should see logs similar to:
```
Running 1 actions for workflow abc-123-def
Processing action: create_task {"title":"Schedule operation for {{patient.first_name}}","assign_to":"user-id","due_days":3}
Task config.title: "Schedule operation for {{patient.first_name}}"
Template context patient: {id: "patient-123", first_name: "Jane", last_name: "Smith", email: "jane@example.com", phone: "+1234567890"}
Rendered task name: "Schedule operation for Jane"
Created task: Schedule operation for Jane
```

## Workflow Configuration

### Database Tables
- **workflows**: Stores workflow definitions
  - `trigger_type`: "deal_stage_changed"
  - `active`: true
  - `config`: Contains trigger conditions (to_stage_id, from_stage_id, pipeline)

- **workflow_enrollments**: Tracks workflow executions
  - Links workflow_id, patient_id, deal_id
  - Stores trigger_data and status

- **workflow_enrollment_steps**: Logs each action execution
  - Records step_type, step_action, status
  - Stores execution results and errors

### Action Types Supported
1. **create_task**: Creates a new task
   - Config: `title`, `assign_to`, `due_days`
   - Template variables: `{{patient.first_name}}`, `{{patient.last_name}}`, `{{deal.title}}`, etc.

2. **send_email**: Sends an email
   - Config: `subject`, `body_template`, `recipient`, `send_mode`
   - Supports immediate, delayed, and recurring emails

## Template Variables Available

### Patient Context
- `{{patient.id}}`
- `{{patient.first_name}}`
- `{{patient.last_name}}`
- `{{patient.email}}`
- `{{patient.phone}}`

### Deal Context
- `{{deal.id}}`
- `{{deal.title}}`
- `{{deal.pipeline}}`
- `{{deal.notes}}`

### Stage Context
- `{{from_stage.name}}`
- `{{from_stage.type}}`
- `{{to_stage.name}}`
- `{{to_stage.type}}`

## Troubleshooting

### No Console Logs Appearing
1. Check if the workflow is active in the database
2. Verify the `to_stage_id` matches "Operation Set" stage ID
3. Ensure the deal's pipeline matches the workflow's pipeline filter (if set)
4. Check browser console filter settings (should show "All levels")

### Task Not Created
1. Look for error logs: "Failed to create task:"
2. Check if `assign_to` user ID exists in users table
3. Verify task template syntax is correct
4. Check database permissions for tasks table

### Workflow Not Matching
1. Verify stage IDs match exactly
2. Check if `trigger_on_creation` is set correctly
3. Ensure pipeline filter matches (or is null for all pipelines)

## API Endpoint

**POST** `/api/workflows/deal-stage-changed`

**Payload**:
```json
{
  "dealId": "uuid",
  "patientId": "uuid",
  "fromStageId": "uuid or null",
  "toStageId": "uuid",
  "pipeline": "string or null"
}
```

**Response**:
```json
{
  "ok": true,
  "workflows": 1,
  "actionsRun": 1
}
```

## Recent Changes (Commit: 020173a)
- Fixed ESLint import paths for ES modules
- Updated TypeScript target from ES2017 to ES2018
- Removed invalid `reactCompiler` option from Next.js config
- All build errors resolved for Vercel deployment
