import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Clock, Info } from 'lucide-react';

interface AutoLogoutSettingsData {
  id: string;
  auto_logout_enabled: boolean;
  auto_logout_time: string;
}

export function AutoLogoutSettings() {
  const [settings, setSettings] = useState<AutoLogoutSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [logoutTime, setLogoutTime] = useState('02:00');
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    fetchSettings();
    
    // Update current time display every minute
    const updateCurrentTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-ZA', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZoneName: 'short'
      }));
    };
    
    updateCurrentTime();
    const interval = setInterval(updateCurrentTime, 60000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('id, auto_logout_enabled, auto_logout_time')
        .single();

      if (error) throw error;

      setSettings(data);
      setEnabled(data?.auto_logout_enabled ?? false);
      
      // Convert time from HH:MM:SS to HH:MM for input
      const timeValue = data?.auto_logout_time ?? '02:00:00';
      setLogoutTime(timeValue.substring(0, 5));
    } catch (error) {
      console.error('Error fetching auto-logout settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings?.id) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('settings')
        .update({
          auto_logout_enabled: enabled,
          auto_logout_time: `${logoutTime}:00`, // Convert HH:MM to HH:MM:SS
        })
        .eq('id', settings.id);

      if (error) throw error;

      toast.success('Auto-logout settings saved');
      fetchSettings();
    } catch (error: any) {
      console.error('Error saving auto-logout settings:', error);
      toast.error(error.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (checked: boolean) => {
    setEnabled(checked);
    
    if (!settings?.id) return;
    
    try {
      const { error } = await supabase
        .from('settings')
        .update({ auto_logout_enabled: checked })
        .eq('id', settings.id);

      if (error) throw error;

      toast.success(checked ? 'Auto-logout enabled' : 'Auto-logout disabled');
    } catch (error: any) {
      console.error('Error toggling auto-logout:', error);
      toast.error(error.message || 'Failed to update setting');
      setEnabled(!checked); // Revert on error
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Automatic Session Expiry
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-muted rounded w-1/3" />
            <div className="h-10 bg-muted rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Automatic Session Expiry
        </CardTitle>
        <CardDescription>
          Automatically log out all users at a scheduled time each day and clear their local cache.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="auto-logout-toggle">Enable daily automatic logout</Label>
            <p className="text-sm text-muted-foreground">
              Users will be logged out and their cache cleared at the set time
            </p>
          </div>
          <Switch
            id="auto-logout-toggle"
            checked={enabled}
            onCheckedChange={handleToggle}
          />
        </div>

        {enabled && (
          <>
            <div className="space-y-3">
              <Label htmlFor="logout-time">Logout Time</Label>
              <div className="flex gap-2">
                <Input
                  id="logout-time"
                  type="time"
                  value={logoutTime}
                  onChange={(e) => setLogoutTime(e.target.value)}
                  className="w-40"
                />
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Update Time'}
                </Button>
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
              <Info className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  All users will be logged out at this time daily. Their local cache 
                  (offline data, stored files) will be cleared to ensure fresh data on next login.
                </p>
                <p className="font-medium">
                  Current time: {currentTime}
                </p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
