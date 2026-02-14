-- Mark all existing users as onboarding completed so they aren't blocked
UPDATE public.profiles SET onboarding_completed = true WHERE onboarding_completed = false OR onboarding_completed IS NULL;