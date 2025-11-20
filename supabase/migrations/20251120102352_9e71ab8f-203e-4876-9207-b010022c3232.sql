-- Enhance floor_plan_pins table with professional defect tracking features
-- Add new status options beyond just 'open' and 'resolved'
ALTER TABLE floor_plan_pins 
  DROP CONSTRAINT IF EXISTS floor_plan_pins_status_check,
  ADD CONSTRAINT floor_plan_pins_status_check 
  CHECK (status IN ('open', 'in_progress', 'finished', 'closed', 'resolved'));

-- Add new columns for comprehensive tracking
ALTER TABLE floor_plan_pins 
  ADD COLUMN IF NOT EXISTS package TEXT,
  ADD COLUMN IF NOT EXISTS stakeholders TEXT,
  ADD COLUMN IF NOT EXISTS detailed_description TEXT,
  ADD COLUMN IF NOT EXISTS edit_history JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_modified_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create a comments table for floor plan pins
CREATE TABLE IF NOT EXISTS floor_plan_pin_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id UUID NOT NULL REFERENCES floor_plan_pins(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT,
  comment TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on comments table
ALTER TABLE floor_plan_pin_comments ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage comments
CREATE POLICY "Authenticated users can view comments"
  ON floor_plan_pin_comments FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create comments"
  ON floor_plan_pin_comments FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own comments"
  ON floor_plan_pin_comments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
  ON floor_plan_pin_comments FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster comment queries
CREATE INDEX IF NOT EXISTS idx_floor_plan_pin_comments_pin_id 
  ON floor_plan_pin_comments(pin_id);

-- Add trigger to track edit history
CREATE OR REPLACE FUNCTION track_floor_plan_pin_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Add the change to edit history
  NEW.edit_history = COALESCE(NEW.edit_history, '[]'::jsonb) || 
    jsonb_build_object(
      'timestamp', NOW(),
      'user_id', NEW.last_modified_by,
      'changes', jsonb_build_object(
        'status', CASE WHEN OLD.status IS DISTINCT FROM NEW.status 
          THEN jsonb_build_object('from', OLD.status, 'to', NEW.status) 
          ELSE NULL END,
        'priority', CASE WHEN OLD.priority IS DISTINCT FROM NEW.priority 
          THEN jsonb_build_object('from', OLD.priority, 'to', NEW.priority) 
          ELSE NULL END,
        'assigned_contractor', CASE WHEN OLD.assigned_contractor IS DISTINCT FROM NEW.assigned_contractor 
          THEN jsonb_build_object('from', OLD.assigned_contractor, 'to', NEW.assigned_contractor) 
          ELSE NULL END
      )
    );
  
  NEW.last_modified_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for tracking changes
DROP TRIGGER IF EXISTS floor_plan_pin_changes_trigger ON floor_plan_pins;
CREATE TRIGGER floor_plan_pin_changes_trigger
  BEFORE UPDATE ON floor_plan_pins
  FOR EACH ROW
  EXECUTE FUNCTION track_floor_plan_pin_changes();