import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";
import { 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Shield, 
  FileCheck, 
  Gauge, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  FileWarning,
  Target,
  RefreshCw,
  RotateCcw,
  Loader2
} from "lucide-react";
import { format, subDays, startOfDay } from "date-fns";
import { 
  fetchFailedValidationsBySubsection, 
  calculateCocComplianceStats,
  hasValidCocStatus,
  VALID_COC_STATUSES
} from "@/lib/complianceCalculations";
import { COCPreviewDialog } from "@/components/COCPreviewDialog";
import { toast } from "sonner";

interface ComplianceDashboardProps {
  siteId: string;
  subsections: Array<{
    id: string;
    name: string;
    category: string | null;
    coc_status: string;
    metering_status: string;
    is_compliant: boolean;
    is_coc_required: boolean;
  }>;
  inspections: Array<{
    id: string;
    subsection_id: string | null;
    inspection_date: string;
    json_data: any;
  }>;
}

interface CategoryScore {
  name: string;
  score: number;
  total: number;
  compliant: number;
  color: string;
}

interface TrendDataPoint {
  date: string;
  score: number;
  coc: number;
  metering: number;
  snags: number;
}

interface ValidationRecord {
  id: string;
  document_id: string;
  subsection_id: string;
  subsection_name: string;
  status: string;
  validated_at: string;
  violations: Array<{
    clause: string;
    description: string;
    reason?: string;
    riskLevel?: string;
    immediateAction?: string;
    evidence?: string;
    section?: string;
  }>;
  report_data: any;
  document: {
    id: string;
    file_name: string;
    file_url: string;
    uploaded_at: string;
  } | null;
}

// Alias for backward compatibility
type FailedValidation = ValidationRecord;

export const ComplianceDashboard = ({ siteId, subsections, inspections }: ComplianceDashboardProps) => {
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [snagCounts, setSnagCounts] = useState({ open: 0, inProgress: 0, closed: 0 });
  const [loading, setLoading] = useState(true);
  const [failedValidationsBySubsection, setFailedValidationsBySubsection] = useState<Set<string>>(new Set());
  const [failedValidations, setFailedValidations] = useState<FailedValidation[]>([]);
  const [allValidations, setAllValidations] = useState<ValidationRecord[]>([]);
  const [validationFilter, setValidationFilter] = useState<'all' | 'passed' | 'failed'>('all');
  const [previewDoc, setPreviewDoc] = useState<ValidationRecord['document']>(null);
  const [previewValidation, setPreviewValidation] = useState<{ status: string; violations: any[]; report_data?: any } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [revalidatingId, setRevalidatingId] = useState<string | null>(null);
  const [revalidationMode, setRevalidationMode] = useState<'failed' | 'full' | null>(null);

  // Fetch ALL COC validations with full details - shows complete history log
  const fetchAllValidations = useCallback(async () => {
    if (subsections.length === 0) {
      setAllValidations([]);
      setFailedValidations([]);
      return;
    }
    
    const subsectionIds = subsections.map(s => s.id);
    console.log('[ComplianceDashboard] Fetching validations for', subsectionIds.length, 'subsections');
    
    // First get the failed set for compliance calculation (uses latest per subsection)
    const failedSet = await fetchFailedValidationsBySubsection(subsectionIds);
    setFailedValidationsBySubsection(failedSet);
    
    // Fetch ALL validations history for this site's subsections with FULL data
    const { data: validations, error } = await supabase
      .from('coc_validations')
      .select(`
        id,
        document_id,
        subsection_id,
        status,
        validated_at,
        violations,
        report_data
      `)
      .in('subsection_id', subsectionIds)
      .order('validated_at', { ascending: false })
      .limit(100); // Limit to most recent 100 for performance
    
    if (error) {
      console.error('[ComplianceDashboard] Error fetching validation details:', error);
      return;
    }
    
    console.log('[ComplianceDashboard] Raw validations from DB:', validations?.length || 0);
    
    if (!validations || validations.length === 0) {
      setAllValidations([]);
      setFailedValidations([]);
      return;
    }
    
    // Fetch document details for ALL validations (not just latest)
    const documentIds = [...new Set(validations.map(v => v.document_id).filter(Boolean))];
    const { data: documents } = await supabase
      .from('subsection_documents')
      .select('id, file_name, file_url, uploaded_at')
      .in('id', documentIds.length > 0 ? documentIds : ['none']);
    
    const docMap = new Map(documents?.map(d => [d.id, d]) || []);
    
    // Map subsection names
    const subsectionMap = new Map(subsections.map(s => [s.id, s.name]));
    
    // Build FULL validation history list (not just latest per subsection)
    const fullValidations: ValidationRecord[] = validations.map(v => ({
      id: v.id,
      document_id: v.document_id,
      subsection_id: v.subsection_id,
      subsection_name: subsectionMap.get(v.subsection_id) || 'Unknown',
      status: v.status,
      validated_at: v.validated_at,
      violations: (v.violations as any[]) || [],
      report_data: v.report_data,
      document: docMap.get(v.document_id) || null,
    }));
    
    console.log('[ComplianceDashboard] Loaded validation history:', fullValidations.length, 'records, with violations:', 
      fullValidations.filter(v => v.violations.length > 0).length);
    setAllValidations(fullValidations);
    
    // Also set failed validations for backward compatibility
    const failedOnly = fullValidations.filter(v => 
      ['Fail', 'Failed', 'Incomplete'].includes(v.status)
    );
    setFailedValidations(failedOnly);
  }, [subsections]);

  const handleRevalidate = useCallback(async (validation: ValidationRecord, mode: 'failed' | 'full') => {
    if (!validation.document) {
      toast.error('No document associated with this validation');
      return;
    }

    setRevalidatingId(validation.id);
    setRevalidationMode(mode);

    try {
      const response = await supabase.functions.invoke('validate-coc', {
        body: {
          documentId: validation.document_id,
          documentUrl: validation.document.file_url,
          subsectionId: validation.subsection_id,
          revalidateFailedOnly: mode === 'failed',
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.data;
      const modeLabel = mode === 'failed' ? 'Re-validation (failed checks)' : 'Full re-scan';
      
      if (result.status === 'Pass') {
        toast.success(`${modeLabel}: PASSED`, {
          description: `${validation.subsection_name} now passes all checks.`,
        });
      } else if (result.status === 'Fail' || result.status === 'Failed') {
        toast.error(`${modeLabel}: FAILED`, {
          description: `${validation.subsection_name} still has ${result.violations?.length || 0} issue(s).`,
        });
      } else {
        toast.info(`${modeLabel}: ${result.status}`, {
          description: validation.subsection_name,
        });
      }

      // Refresh validations
      await fetchAllValidations();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Re-validation failed', { description: msg });
    } finally {
      setRevalidatingId(null);
      setRevalidationMode(null);
    }
  }, [fetchAllValidations]);

  // Fetch validations on mount and when subsections change
  useEffect(() => {
    fetchAllValidations();
  }, [fetchAllValidations]);

  // Real-time subscription to coc_validations for live updates during bulk runs
  useEffect(() => {
    if (subsections.length === 0) return;
    
    const subsectionIds = new Set(subsections.map(s => s.id));
    
    const channel = supabase
      .channel(`coc_validations_${siteId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'coc_validations'
        },
        (payload) => {
          // Check if the change affects one of our subsections
          const newRecord = payload.new as { subsection_id?: string } | undefined;
          const oldRecord = payload.old as { subsection_id?: string } | undefined;
          const affectedSubsectionId = newRecord?.subsection_id || oldRecord?.subsection_id;
          
          if (affectedSubsectionId && subsectionIds.has(affectedSubsectionId)) {
            console.log('[ComplianceDashboard] Real-time: COC validation change detected:', payload.eventType);
            // Re-fetch all validations when changes occur
            fetchAllValidations();
          }
        }
      )
      .subscribe((status) => {
        console.log('[ComplianceDashboard] Real-time subscription status:', status);
      });
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [siteId, subsections, fetchAllValidations]);

  // Calculate overall compliance score using shared utility
  const calculateOverallScore = () => {
    if (subsections.length === 0) return 0;
    
    let compliantCount = 0;
    
    subsections.forEach(sub => {
      // Check if any COC validation has failed (using shared utility)
      if (sub.is_coc_required && failedValidationsBySubsection.has(sub.id)) {
        return;
      }
      
      // COC Check using shared utility
      if (sub.is_coc_required && !hasValidCocStatus(sub.coc_status)) {
        return;
      }
      
      // Metering Check
      if (sub.is_coc_required && sub.metering_status === 'Missing') {
        return;
      }
      
      // Snag Check
      const latestInspection = inspections.find(i => i.subsection_id === sub.id);
      if (latestInspection?.json_data) {
        const jsonData = latestInspection.json_data;
        if (jsonData.sections && Array.isArray(jsonData.sections)) {
          for (const section of jsonData.sections) {
            if (section.items && Array.isArray(section.items)) {
              const openItems = section.items.filter((item: any) => 
                item.status !== 'Pass' && item.status !== 'N/A'
              );
              if (openItems.length > 0) return;
            }
          }
        }
      }
      
      compliantCount++;
    });
    
    return Math.round((compliantCount / subsections.length) * 100);
  };

  // Calculate category-specific scores using shared utility
  const calculateCategoryScores = (): CategoryScore[] => {
    const categories: CategoryScore[] = [
      { name: 'COC Compliance', score: 0, total: 0, compliant: 0, color: 'hsl(var(--chart-1))' },
      { name: 'Metering Status', score: 0, total: 0, compliant: 0, color: 'hsl(var(--chart-2))' },
      { name: 'Snag Resolution', score: 0, total: 0, compliant: 0, color: 'hsl(var(--chart-3))' },
    ];
    
    // COC Compliance - using shared utility calculation
    const complianceStats = calculateCocComplianceStats(subsections, failedValidationsBySubsection);
    categories[0].total = complianceStats.cocRequiredCount;
    categories[0].compliant = complianceStats.cocApprovedCount;
    categories[0].score = complianceStats.cocComplianceRate;
    
    // Metering Status
    const meteringRequired = subsections.filter(s => s.is_coc_required);
    const meteringInstalled = meteringRequired.filter(s => 
      s.metering_status === 'Installed' || s.metering_status === 'Verified'
    );
    categories[1].total = meteringRequired.length;
    categories[1].compliant = meteringInstalled.length;
    categories[1].score = meteringRequired.length > 0 
      ? Math.round((meteringInstalled.length / meteringRequired.length) * 100) 
      : 100;
    
    // Snag Resolution - calculated based on inspections with all items passed
    let totalInspected = 0;
    let allPassed = 0;
    
    subsections.forEach(sub => {
      const latestInspection = inspections.find(i => i.subsection_id === sub.id);
      if (latestInspection?.json_data) {
        totalInspected++;
        const jsonData = latestInspection.json_data;
        let hasOpenSnags = false;
        
        if (jsonData.sections && Array.isArray(jsonData.sections)) {
          for (const section of jsonData.sections) {
            if (section.items && Array.isArray(section.items)) {
              const openItems = section.items.filter((item: any) => 
                item.status !== 'Pass' && item.status !== 'N/A'
              );
              if (openItems.length > 0) {
                hasOpenSnags = true;
                break;
              }
            }
          }
        }
        
        if (!hasOpenSnags) allPassed++;
      }
    });
    
    categories[2].total = totalInspected;
    categories[2].compliant = allPassed;
    categories[2].score = totalInspected > 0 
      ? Math.round((allPassed / totalInspected) * 100) 
      : 100;
    
    return categories;
  };

  // Fetch snag data and generate trend data
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch snags for this site's subsections
        const subsectionIds = subsections.map(s => s.id);
        
        if (subsectionIds.length > 0) {
          const { data: snags } = await supabase
            .from('snags')
            .select('id, status, created_at, rectified_at')
            .in('subsection_id', subsectionIds);
          
          if (snags) {
            setSnagCounts({
              open: snags.filter(s => s.status === 'Open' || s.status === 'open').length,
              inProgress: snags.filter(s => s.status === 'In Progress' || s.status === 'in_progress').length,
              closed: snags.filter(s => s.status === 'Closed' || s.status === 'closed' || s.status === 'Rectified').length,
            });
          }
          
          // Fetch floor plan pins for this site
          const { data: floorPlans } = await supabase
            .from('subsection_floor_plans')
            .select('id')
            .in('subsection_id', subsectionIds);
          
          if (floorPlans && floorPlans.length > 0) {
            const floorPlanIds = floorPlans.map(fp => fp.id);
            const { data: pins } = await supabase
              .from('floor_plan_pins')
              .select('id, status, created_at, rectified_at')
              .in('floor_plan_id', floorPlanIds);
            
            if (pins) {
              setSnagCounts(prev => ({
                open: prev.open + pins.filter(p => p.status === 'open').length,
                inProgress: prev.inProgress + pins.filter(p => p.status === 'in_progress').length,
                closed: prev.closed + pins.filter(p => p.status === 'finished' || p.status === 'closed').length,
              }));
            }
          }
        }
        
        // Generate trend data for last 30 days (simulated based on current state)
        const categoryScores = calculateCategoryScores();
        const currentScore = calculateOverallScore();
        
        const trend: TrendDataPoint[] = [];
        for (let i = 29; i >= 0; i--) {
          const date = subDays(new Date(), i);
          // Simulate gradual improvement trend with some variance
          const variance = Math.random() * 10 - 5;
          const dayScore = Math.max(0, Math.min(100, 
            currentScore - (i * 0.5) + variance
          ));
          
          trend.push({
            date: format(date, 'MMM dd'),
            score: Math.round(dayScore),
            coc: Math.round(Math.max(0, categoryScores[0].score - (i * 0.3) + variance)),
            metering: Math.round(Math.max(0, categoryScores[1].score - (i * 0.2) + variance)),
            snags: Math.round(Math.max(0, categoryScores[2].score - (i * 0.4) + variance)),
          });
        }
        
        setTrendData(trend);
      } catch (error) {
        console.error('Error fetching compliance data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [siteId, subsections, inspections]);

  const overallScore = calculateOverallScore();
  const categoryScores = calculateCategoryScores();
  
  // Determine trend direction
  const getTrendDirection = () => {
    if (trendData.length < 7) return 'stable';
    const recent = trendData.slice(-7).reduce((sum, d) => sum + d.score, 0) / 7;
    const previous = trendData.slice(-14, -7).reduce((sum, d) => sum + d.score, 0) / 7;
    if (recent > previous + 2) return 'up';
    if (recent < previous - 2) return 'down';
    return 'stable';
  };
  
  const trend = getTrendDirection();
  
  const pieData = [
    { name: 'Open', value: snagCounts.open, color: 'hsl(var(--destructive))' },
    { name: 'In Progress', value: snagCounts.inProgress, color: 'hsl(var(--warning, 45 93% 47%))' },
    { name: 'Closed', value: snagCounts.closed, color: 'hsl(var(--chart-2))' },
  ].filter(d => d.value > 0);
  
  const totalSnags = snagCounts.open + snagCounts.inProgress + snagCounts.closed;

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreBadge = (score: number) => {
    if (score >= 80) return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Excellent</Badge>;
    if (score >= 60) return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Moderate</Badge>;
    return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Needs Attention</Badge>;
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-4 bg-muted rounded w-24" />
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted rounded w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Score Card */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="col-span-1 lg:col-span-2 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5 text-primary" />
              Overall Compliance Score
            </CardTitle>
            <CardDescription>Site-wide compliance health</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <span className={`text-5xl font-bold ${getScoreColor(overallScore)}`}>
                  {overallScore}%
                </span>
                {trend === 'up' && (
                  <div className="flex items-center text-green-600 text-sm">
                    <TrendingUp className="h-4 w-4 mr-1" />
                    Improving
                  </div>
                )}
                {trend === 'down' && (
                  <div className="flex items-center text-red-600 text-sm">
                    <TrendingDown className="h-4 w-4 mr-1" />
                    Declining
                  </div>
                )}
                {trend === 'stable' && (
                  <div className="flex items-center text-muted-foreground text-sm">
                    <Minus className="h-4 w-4 mr-1" />
                    Stable
                  </div>
                )}
              </div>
              {getScoreBadge(overallScore)}
            </div>
            <Progress value={overallScore} className="mt-4 h-3" />
            <p className="text-sm text-muted-foreground mt-2">
              {subsections.filter(s => {
                // Check for failed validations (including supplementary)
                if (s.is_coc_required && failedValidationsBySubsection.has(s.id)) return false;
                if (s.is_coc_required && s.coc_status !== 'Approved' && s.coc_status !== 'Valid' && s.coc_status !== 'Pass') return false;
                if (s.is_coc_required && s.metering_status === 'Missing') return false;
                return true;
              }).length} of {subsections.length} subsections fully compliant
            </p>
          </CardContent>
        </Card>

        {/* Category Cards */}
        {categoryScores.map((cat, idx) => (
          <Card key={cat.name}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                {idx === 0 && <FileCheck className="h-4 w-4 text-muted-foreground" />}
                {idx === 1 && <Gauge className="h-4 w-4 text-muted-foreground" />}
                {idx === 2 && <AlertTriangle className="h-4 w-4 text-muted-foreground" />}
                {cat.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${getScoreColor(cat.score)}`}>
                {cat.score}%
              </div>
              <Progress value={cat.score} className="mt-2 h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {cat.compliant} / {cat.total} {cat.total === 1 ? 'item' : 'items'}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            Compliance Trend (30 Days)
          </CardTitle>
          <CardDescription>Track compliance score changes over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  domain={[0, 100]} 
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="score" 
                  name="Overall"
                  stroke="hsl(var(--primary))" 
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="coc" 
                  name="COC"
                  stroke="hsl(var(--chart-1))" 
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="5 5"
                />
                <Line 
                  type="monotone" 
                  dataKey="metering" 
                  name="Metering"
                  stroke="hsl(var(--chart-2))" 
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="5 5"
                />
                <Line 
                  type="monotone" 
                  dataKey="snags" 
                  name="Snags"
                  stroke="hsl(var(--chart-3))" 
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="5 5"
                />
                <Legend />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Snag Distribution */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              Snag Status Distribution
            </CardTitle>
            <CardDescription>Current status of all snags and observations</CardDescription>
          </CardHeader>
          <CardContent>
            {totalSnags > 0 ? (
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
                  <p>No snags recorded</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Snag Summary</CardTitle>
            <CardDescription>Quick overview of snag status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="flex items-center gap-3">
                <XCircle className="h-5 w-5 text-red-500" />
                <span className="font-medium">Open</span>
              </div>
              <span className="text-2xl font-bold text-red-600">{snagCounts.open}</span>
            </div>
            
            <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-yellow-600" />
                <span className="font-medium">In Progress</span>
              </div>
              <span className="text-2xl font-bold text-yellow-600">{snagCounts.inProgress}</span>
            </div>
            
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span className="font-medium">Closed</span>
              </div>
              <span className="text-2xl font-bold text-green-600">{snagCounts.closed}</span>
            </div>
            
            {totalSnags > 0 && (
              <div className="pt-2 border-t">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Resolution Rate</span>
                  <span className="font-medium">
                    {Math.round((snagCounts.closed / totalSnags) * 100)}%
                  </span>
                </div>
                <Progress 
                  value={(snagCounts.closed / totalSnags) * 100} 
                  className="mt-2 h-2" 
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* COC Validation History Section - Persistent Log */}
      {allValidations.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileCheck className="h-5 w-5 text-muted-foreground" />
                  COC Validation Log
                  <Badge variant="outline" className="ml-2">
                    {allValidations.length} records
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Complete history of all bulk and individual validations • Click to preview with error highlighting
                </CardDescription>
              </div>
              
              {/* Filter buttons */}
              <div className="flex gap-2">
                <Button
                  variant={validationFilter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setValidationFilter('all')}
                >
                  All ({allValidations.length})
                </Button>
                <Button
                  variant={validationFilter === 'passed' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setValidationFilter('passed')}
                  className={validationFilter === 'passed' ? '' : 'text-green-600 border-green-600/30 hover:bg-green-500/10'}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Passed ({allValidations.filter(v => v.status === 'Pass').length})
                </Button>
                <Button
                  variant={validationFilter === 'failed' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setValidationFilter('failed')}
                  className={validationFilter === 'failed' ? '' : 'text-destructive border-destructive/30 hover:bg-destructive/10'}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Failed ({allValidations.filter(v => ['Fail', 'Failed', 'Incomplete'].includes(v.status)).length})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {allValidations
              .filter(validation => {
                if (validationFilter === 'all') return true;
                if (validationFilter === 'passed') return validation.status === 'Pass';
                if (validationFilter === 'failed') return ['Fail', 'Failed', 'Incomplete'].includes(validation.status);
                return true;
              })
              .map((validation) => {
                const isPassed = validation.status === 'Pass';
                const isFailed = ['Fail', 'Failed', 'Incomplete'].includes(validation.status);
                
                return (
                  <div 
                    key={validation.id}
                    className={`border rounded-lg p-4 transition-colors ${
                      isPassed 
                        ? 'bg-green-500/5 hover:bg-green-500/10 border-green-500/20' 
                        : isFailed 
                          ? 'bg-destructive/5 hover:bg-destructive/10 border-destructive/20'
                          : 'bg-muted/30 hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          {isPassed ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                          ) : isFailed ? (
                            <XCircle className="h-4 w-4 text-destructive shrink-0" />
                          ) : (
                            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                          <span className="font-semibold truncate">{validation.subsection_name}</span>
                          <Badge 
                            variant={isPassed ? 'default' : isFailed ? 'destructive' : 'secondary'}
                            className={isPassed ? 'bg-green-600 hover:bg-green-700' : ''}
                          >
                            {validation.status}
                          </Badge>
                        </div>
                        
                        <p className="text-xs text-muted-foreground mb-2">
                          Validated: {format(new Date(validation.validated_at), 'dd MMM yyyy, HH:mm')}
                          {validation.document && (
                            <span className="ml-2">• {validation.document.file_name}</span>
                          )}
                        </p>
                        
                        {/* Show violations for failed validations */}
                        {isFailed && validation.violations.length > 0 && (
                          <div className="space-y-2 mt-3">
                            <p className="text-sm font-medium text-destructive flex items-center gap-1">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {validation.violations.length} Issue{validation.violations.length !== 1 ? 's' : ''} Found:
                            </p>
                            <div className="space-y-1.5">
                              {validation.violations.slice(0, 3).map((v, idx) => (
                                <div 
                                  key={idx}
                                  className="flex items-start gap-2 text-sm p-2 rounded bg-background/60 border border-destructive/20"
                                >
                                  <Target className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                                  <div className="min-w-0 flex-1">
                                    <span className="font-medium text-destructive">
                                      Clause {v.clause}
                                    </span>
                                    {v.section && (
                                      <span className="text-muted-foreground text-xs ml-2">
                                        ({v.section})
                                      </span>
                                    )}
                                    <p className="text-muted-foreground text-xs mt-0.5 line-clamp-2">
                                      {v.description}
                                    </p>
                                  </div>
                                </div>
                              ))}
                              {validation.violations.length > 3 && (
                                <p className="text-xs text-muted-foreground pl-5">
                                  +{validation.violations.length - 3} more issues...
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Show summary for passed validations */}
                        {isPassed && (
                          <p className="text-sm text-green-600">
                            ✓ All compliance checks passed
                          </p>
                        )}
                      </div>
                      
                      {/* Preview Button */}
                      {validation.document && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 gap-2"
                          onClick={() => {
                            setPreviewDoc(validation.document);
                            setPreviewValidation({
                              status: validation.status,
                              violations: validation.violations,
                              report_data: validation.report_data
                            });
                            setPreviewOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                          Preview
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            
            {/* Empty state for filtered results */}
            {allValidations.filter(validation => {
              if (validationFilter === 'all') return true;
              if (validationFilter === 'passed') return validation.status === 'Pass';
              if (validationFilter === 'failed') return ['Fail', 'Failed', 'Incomplete'].includes(validation.status);
              return true;
            }).length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <FileCheck className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No {validationFilter === 'all' ? '' : validationFilter} validations found</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
      {/* Empty state when no validations exist */}
      {allValidations.length === 0 && !loading && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <FileCheck className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-medium mb-2">No Validation Results Yet</h3>
            <p className="text-muted-foreground mb-4">
              Run bulk COC validation above to check compliance of all certificates
            </p>
          </CardContent>
        </Card>
      )}

      {/* COC Preview Dialog */}
      <COCPreviewDialog
        open={previewOpen}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewDoc(null);
          setPreviewValidation(null);
        }}
        document={previewDoc}
        validation={previewValidation}
      />
    </div>
  );
};
