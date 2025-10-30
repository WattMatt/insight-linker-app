import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle, ExternalLink } from "lucide-react";

interface Notification {
  id: string;
  issue_report_id: string;
  message: string;
  created_at: string;
  type: string;
}

export function NotificationListener() {
  const [currentNotification, setCurrentNotification] = useState<Notification | null>(null);
  const queryClient = useQueryClient();

  const { data: notifications } = useQuery({
    queryKey: ['unread-notifications'],
    queryFn: async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .eq('read', false)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching notifications:', error);
          return [];
        }
        return data as Notification[];
      } catch (error) {
        console.error('Error in notification query:', error);
        return [];
      }
    },
    refetchInterval: 30000, // Check every 30 seconds
    retry: false,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
    },
  });

  useEffect(() => {
    if (notifications && notifications.length > 0 && !currentNotification) {
      setCurrentNotification(notifications[0]);
    }
  }, [notifications, currentNotification]);

  const handleClose = () => {
    if (currentNotification) {
      markAsReadMutation.mutate(currentNotification.id);
      setCurrentNotification(null);
    }
  };

  const handleViewIssue = async () => {
    if (currentNotification) {
      markAsReadMutation.mutate(currentNotification.id);
      
      // Get issue details to construct the URL
      const { data: issue } = await supabase
        .from('issue_reports')
        .select('page_url')
        .eq('id', currentNotification.issue_report_id)
        .single();

      if (issue?.page_url) {
        window.location.href = issue.page_url;
      }
      
      setCurrentNotification(null);
    }
  };

  return (
    <Dialog open={!!currentNotification} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-6 w-6 text-green-500" />
            <DialogTitle>Issue Resolved!</DialogTitle>
          </div>
          <DialogDescription>
            {currentNotification?.message}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>
            Dismiss
          </Button>
          <Button onClick={handleViewIssue}>
            <ExternalLink className="mr-2 h-4 w-4" />
            View Resolved Issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
