import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from '@/lib/navigation';
import { supabase } from '@/integrations/supabase/client';
import { clearAllCaches } from '@/lib/cacheUtils';
import { toast } from 'sonner';

const LAST_LOGOUT_KEY = 'wm_last_auto_logout_date';
const CHECK_INTERVAL_MS = 60000; // Check every minute

interface AutoLogoutSettings {
  auto_logout_enabled: boolean;
  auto_logout_time: string; // HH:MM:SS format
}

/**
 * SessionWatcher monitors the auto-logout settings and triggers
 * logout + cache clear at the configured time each day.
 */
export function SessionWatcher() {
  const navigate = useNavigate();
  const settingsRef = useRef<AutoLogoutSettings | null>(null);
  const warningShownRef = useRef(false);

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('auto_logout_enabled, auto_logout_time')
        .single();

      if (error) {
        console.error('[SessionWatcher] Failed to fetch settings:', error);
        return;
      }

      settingsRef.current = {
        auto_logout_enabled: data?.auto_logout_enabled ?? false,
        auto_logout_time: data?.auto_logout_time ?? '02:00:00',
      };
    } catch (error) {
      console.error('[SessionWatcher] Error fetching settings:', error);
    }
  }, []);

  const performLogout = useCallback(async () => {
    console.log('[SessionWatcher] Performing auto-logout...');
    
    // Mark today as logged out to prevent multiple triggers
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem(LAST_LOGOUT_KEY, today);
    
    // Clear all caches first
    await clearAllCaches();
    
    // Sign out from Supabase
    await supabase.auth.signOut();
    
    // Navigate to auth page
    navigate('/auth', { replace: true });
    
    toast.info('Your session has expired. Please log in again.', {
      duration: 5000,
    });
  }, [navigate]);

  const checkLogoutTime = useCallback(async () => {
    const settings = settingsRef.current;
    
    // Skip if feature is disabled or no settings loaded
    if (!settings?.auto_logout_enabled) {
      return;
    }

    // Check if user is authenticated
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return; // Not logged in, nothing to do
    }

    // Check if already logged out today
    const today = new Date().toISOString().split('T')[0];
    const lastLogoutDate = localStorage.getItem(LAST_LOGOUT_KEY);
    if (lastLogoutDate === today) {
      return; // Already triggered today
    }

    // Parse the configured logout time
    const [targetHour, targetMinute] = settings.auto_logout_time.split(':').map(Number);
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Check if we're within the logout window (within 1 minute of target time)
    const isLogoutTime = 
      currentHour === targetHour && 
      currentMinute === targetMinute;

    // Check if we should show a warning (30 seconds before)
    const isWarningTime = 
      currentHour === targetHour && 
      currentMinute === targetMinute - 1 &&
      now.getSeconds() >= 30;

    if (isWarningTime && !warningShownRef.current) {
      warningShownRef.current = true;
      toast.warning('Your session will expire in 30 seconds...', {
        duration: 25000,
      });
    }

    if (isLogoutTime) {
      warningShownRef.current = false;
      await performLogout();
    }
  }, [performLogout]);

  useEffect(() => {
    // Fetch settings immediately
    fetchSettings();

    // Set up interval to check logout time
    const intervalId = setInterval(() => {
      checkLogoutTime();
    }, CHECK_INTERVAL_MS);

    // Also check immediately after fetching settings
    const initialCheck = setTimeout(() => {
      checkLogoutTime();
    }, 2000);

    // Refresh settings periodically (every 5 minutes) in case admin changes them
    const settingsRefreshId = setInterval(() => {
      fetchSettings();
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(intervalId);
      clearInterval(settingsRefreshId);
      clearTimeout(initialCheck);
    };
  }, [fetchSettings, checkLogoutTime]);

  // This component renders nothing
  return null;
}
