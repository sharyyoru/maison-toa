-- Create workflow_enrollments table to track patients enrolled in workflows
CREATE TABLE IF NOT EXISTS workflow_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'active', -- active, completed, cancelled
  trigger_data JSONB, -- Store the trigger context data
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create workflow_enrollment_steps table to track individual step executions
CREATE TABLE IF NOT EXISTS workflow_enrollment_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES workflow_enrollments(id) ON DELETE CASCADE,
  step_type TEXT NOT NULL, -- action, condition, delay
  step_action TEXT, -- send_email, create_task, etc.
  step_config JSONB, -- The step configuration
  status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, failed, skipped
  executed_at TIMESTAMP WITH TIME ZONE,
  result JSONB, -- Result data (email_id, task_id, etc.)
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_workflow_enrollments_workflow_id ON workflow_enrollments(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_enrollments_patient_id ON workflow_enrollments(patient_id);
CREATE INDEX IF NOT EXISTS idx_workflow_enrollments_status ON workflow_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_workflow_enrollment_steps_enrollment_id ON workflow_enrollment_steps(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_workflow_enrollment_steps_status ON workflow_enrollment_steps(status);

-- Add RLS policies
ALTER TABLE workflow_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_enrollment_steps ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read enrollments
CREATE POLICY "Allow authenticated users to read workflow_enrollments"
  ON workflow_enrollments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert workflow_enrollments"
  ON workflow_enrollments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update workflow_enrollments"
  ON workflow_enrollments FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to read workflow_enrollment_steps"
  ON workflow_enrollment_steps FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert workflow_enrollment_steps"
  ON workflow_enrollment_steps FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update workflow_enrollment_steps"
  ON workflow_enrollment_steps FOR UPDATE
  TO authenticated
  USING (true);

-- Allow service role full access
CREATE POLICY "Allow service role full access to workflow_enrollments"
  ON workflow_enrollments FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Allow service role full access to workflow_enrollment_steps"
  ON workflow_enrollment_steps FOR ALL
  TO service_role
  USING (true);
