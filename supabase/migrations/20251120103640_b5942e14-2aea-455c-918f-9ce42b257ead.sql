-- Enable realtime for floor_plan_pins table
ALTER TABLE floor_plan_pins REPLICA IDENTITY FULL;

-- The table is automatically added to the supabase_realtime publication
-- No need to manually add it as Supabase handles this automatically