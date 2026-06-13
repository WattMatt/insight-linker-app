-- Remove the in-app issue-reporting + suggestions + fix-verification feature entirely.
-- All UI surfaces (Help button, submission dialogs, FeedbackManagement tab, verification
-- listener/dialog, dashboard widget, issue-resolution NotificationListener) and the
-- verify-fix edge function are removed in the same change. These three tables are exclusive
-- to that feature; notifications.issue_report_id FK to issue_reports is dropped by CASCADE.
DROP TABLE IF EXISTS public.notifications  CASCADE;
DROP TABLE IF EXISTS public.issue_reports  CASCADE;
DROP TABLE IF EXISTS public.suggestions    CASCADE;

NOTIFY pgrst, 'reload schema';
