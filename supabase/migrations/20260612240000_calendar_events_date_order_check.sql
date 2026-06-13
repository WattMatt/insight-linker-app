-- C3: prevent inverted date ranges on calendar_events. An end_date before start_date
-- crashes the year grid (date-fns isWithinInterval throws RangeError on an inverted
-- interval, evaluated per day cell). Enforce at the data layer to back up the UI guard.
ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_end_after_start
  CHECK (end_date IS NULL OR end_date >= start_date);

NOTIFY pgrst, 'reload schema';
