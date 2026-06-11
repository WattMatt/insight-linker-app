import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";

export function VerificationDashboardWidget() {
  const { data: pendingCount } = useQuery({
    queryKey: ['pending-verifications-count'],
    queryFn: async () => {
      const [issuesResult, suggestionsResult] = await Promise.all([
        supabase
          .from('issue_reports')
          .select('id', { count: 'exact', head: true })
          .eq('needs_user_verification', true)
          .eq('verification_status', 'pending'),
        supabase
          .from('suggestions')
          .select('id', { count: 'exact', head: true })
          .eq('needs_user_verification', true)
          .eq('verification_status', 'pending')
      ]);
      
      return (issuesResult.count || 0) + (suggestionsResult.count || 0);
    },
    refetchInterval: 30000,
  });

  const { data: recentFeedback } = useQuery({
    queryKey: ['recent-verification-feedback'],
    queryFn: async () => {
      const [issues, suggestions] = await Promise.all([
        supabase
          .from('issue_reports')
          .select('id, description, verification_status, verified_at, rejection_reason, user_name')
          .in('verification_status', ['verified', 'rejected'])
          .not('verified_at', 'is', null)
          .order('verified_at', { ascending: false })
          .limit(3),
        supabase
          .from('suggestions')
          .select('id, title, verification_status, verified_at, rejection_reason, user_name')
          .in('verification_status', ['verified', 'rejected'])
          .not('verified_at', 'is', null)
          .order('verified_at', { ascending: false })
          .limit(3)
      ]);

      const combined = [
        ...(issues.data || []).map(i => ({ ...i, type: 'issue' as const, title: i.description })),
        ...(suggestions.data || []).map(s => ({ ...s, type: 'suggestion' as const }))
      ].sort((a, b) => new Date(b.verified_at!).getTime() - new Date(a.verified_at!).getTime()).slice(0, 5);

      return combined;
    },
    refetchInterval: 60000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          User Verification Feedback
        </CardTitle>
        <CardDescription>
          Track how users respond to implemented fixes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Pending Verifications</span>
          </div>
          <Badge variant={pendingCount ? 'destructive' : 'secondary'} className="text-lg px-3 py-1">
            {pendingCount || 0}
          </Badge>
        </div>

        <div>
          <h4 className="text-sm font-medium mb-3">Recent Feedback</h4>
          <div className="space-y-2">
            {recentFeedback && recentFeedback.length > 0 ? (
              recentFeedback.map((item) => (
                <div key={item.id} className="flex items-start gap-3 p-3 border rounded-lg">
                  {item.verification_status === 'verified' ? (
                    <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">
                        {item.type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {item.user_name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(item.verified_at!), 'MMM d')}
                      </span>
                    </div>
                    <p className="text-sm truncate">{item.title}</p>
                    {item.verification_status === 'rejected' && item.rejection_reason && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        Reason: {item.rejection_reason}
                      </p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No recent feedback yet
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
