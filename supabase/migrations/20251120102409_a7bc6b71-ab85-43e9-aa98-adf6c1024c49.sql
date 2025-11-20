-- Fix security warning: Set search_path for the function
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
$$ LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public;