import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, Lightbulb, CheckSquare, FlaskConical, AlertTriangle, ThumbsUp } from "lucide-react";
import IssueReports from "./IssueReports";
import Suggestions from "./Suggestions";
import VerificationManagement from "./VerificationManagement";

export default function FeedbackManagement() {
  // Fetch verification stats
  const { data: stats } = useQuery({
    queryKey: ['fix-verification-stats'],
    queryFn: async () => {
      const [issuesResult, suggestionsResult] = await Promise.all([
        supabase.from('issue_reports').select('status, fix_confidence_score, fix_test_run_at'),
        supabase.from('suggestions').select('status, fix_confidence_score, fix_test_run_at')
      ]);

      const issues = issuesResult.data || [];
      const suggestions = suggestionsResult.data || [];

      // Resolved items
      const resolvedIssues = issues.filter(i => i.status === 'resolved');
      const implementedSuggestions = suggestions.filter(s => s.status === 'implemented');
      
      // Tested items (have a test run)
      const testedIssues = resolvedIssues.filter(i => i.fix_test_run_at);
      const testedSuggestions = implementedSuggestions.filter(s => s.fix_test_run_at);
      
      // Untested resolutions
      const untestedIssues = resolvedIssues.filter(i => !i.fix_test_run_at);
      const untestedSuggestions = implementedSuggestions.filter(s => !s.fix_test_run_at);

      // All tested items with scores
      const allTestedWithScores = [
        ...issues.filter(i => i.fix_confidence_score !== null),
        ...suggestions.filter(s => s.fix_confidence_score !== null)
      ];

      const avgConfidence = allTestedWithScores.length > 0
        ? Math.round(allTestedWithScores.reduce((sum, item) => sum + (item.fix_confidence_score || 0), 0) / allTestedWithScores.length)
        : 0;

      return {
        totalTested: testedIssues.length + testedSuggestions.length,
        totalResolved: resolvedIssues.length + implementedSuggestions.length,
        untestedCount: untestedIssues.length + untestedSuggestions.length,
        avgConfidence,
        testedIssuesCount: testedIssues.length,
        testedSuggestionsCount: testedSuggestions.length,
      };
    },
    refetchInterval: 30000,
  });

  const getConfidenceColor = (score: number) => {
    if (score >= 70) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Feedback Management</h1>
        <p className="text-muted-foreground">
          Manage user-reported issues and feature suggestions
        </p>
      </div>

      {/* Verification Stats Card */}
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">AI Fix Verification Stats</CardTitle>
            </div>
            {stats?.untestedCount ? (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {stats.untestedCount} Untested
              </Badge>
            ) : (
              <Badge variant="default" className="flex items-center gap-1">
                <ThumbsUp className="h-3 w-3" />
                All Tested
              </Badge>
            )}
          </div>
          <CardDescription>
            Track AI verification of fixes before they're marked as resolved
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Total Tested</p>
              <p className="text-2xl font-bold">{stats?.totalTested || 0}</p>
              <p className="text-xs text-muted-foreground">
                of {stats?.totalResolved || 0} resolved
              </p>
            </div>
            
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Avg Confidence</p>
              <div className="flex items-baseline gap-2">
                <p className={`text-2xl font-bold ${getConfidenceColor(stats?.avgConfidence || 0)}`}>
                  {stats?.avgConfidence || 0}%
                </p>
              </div>
              <Progress 
                value={stats?.avgConfidence || 0} 
                className="h-1.5"
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Issues Tested</p>
              <p className="text-2xl font-bold text-blue-600">{stats?.testedIssuesCount || 0}</p>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Suggestions Tested</p>
              <p className="text-2xl font-bold text-purple-600">{stats?.testedSuggestionsCount || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="issues" className="space-y-6">
        <TabsList className="grid w-full max-w-2xl grid-cols-3">
          <TabsTrigger value="issues" className="gap-2">
            <AlertCircle className="h-4 w-4" />
            Issue Reports
          </TabsTrigger>
          <TabsTrigger value="suggestions" className="gap-2">
            <Lightbulb className="h-4 w-4" />
            Suggestions
          </TabsTrigger>
          <TabsTrigger value="verifications" className="gap-2">
            <CheckSquare className="h-4 w-4" />
            Verifications
          </TabsTrigger>
        </TabsList>

        <TabsContent value="issues" className="space-y-6">
          <IssueReports />
        </TabsContent>

        <TabsContent value="suggestions" className="space-y-6">
          <Suggestions />
        </TabsContent>

        <TabsContent value="verifications" className="space-y-6">
          <VerificationManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}
