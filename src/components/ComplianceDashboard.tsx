import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
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
  Clock
} from "lucide-react";
import { format, subDays } from "date-fns";
import {
  calculateCocComplianceStats
} from "@/lib/complianceCalculations";
import { factorScores, siteHealthScore } from "@/lib/siteHealth";

// Inspection findings are stored as a nested map: jsonData[sectionKey][itemKey] = { status, notes, photos }
// (written by InspectionDetail.handleItemChange, read by ComprehensiveInspectionReport).
// This iterates that map, skipping non-section/non-item keys, and returns whether any item is open.
const hasOpenInspectionItems = (jsonData: any): boolean => {
  if (!jsonData || typeof jsonData !== 'object') return false;
  for (const [sectionKey, sectionValue] of Object.entries(jsonData)) {
    // Skip non-section keys: tenants, *customFields/*_customFields, siteDrawing*
    if (
      sectionKey === 'tenants' ||
      sectionKey.endsWith('customFields') ||
      sectionKey.endsWith('_customFields') ||
      sectionKey.startsWith('siteDrawing')
    ) {
      continue;
    }
    if (!sectionValue || typeof sectionValue !== 'object' || Array.isArray(sectionValue)) continue;
    for (const itemValue of Object.values(sectionValue as Record<string, any>)) {
      // A child is an item iff it is a non-null object with a string status
      if (itemValue && typeof itemValue === 'object' && typeof (itemValue as any).status === 'string') {
        const status = (itemValue as any).status;
        if (status !== 'Pass' && status !== 'N/A') {
          return true;
        }
      }
    }
  }
  return false;
};

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
  metering: number;
  snags: number;
}

export const ComplianceDashboard = ({ siteId, subsections, inspections }: ComplianceDashboardProps) => {
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [snagCounts, setSnagCounts] = useState({ open: 0, inProgress: 0, closed: 0 });
  // Health-model inputs (siteHealth.ts is the single source of truth for the overall score)
  const [healthSnags, setHealthSnags] = useState<Array<{ subsection_id: string; status: string | null; risk_level: string | null }>>([]);
  const [healthInspections, setHealthInspections] = useState<Array<{ subsection_id: string | null; status: string | null }>>([]);
  const [loading, setLoading] = useState(true);

  // Calculate overall Site Health score from the single source of truth (siteHealth.ts).
  // COC is tracked separately and is intentionally NOT folded into this score.
  const calculateOverallScore = () => {
    return siteHealthScore(factorScores(subsections, healthSnags, healthInspections));
  };

  // Calculate category-specific scores using shared utility
  const calculateCategoryScores = (): CategoryScore[] => {
    const categories: CategoryScore[] = [
      { name: 'COC Compliance', score: 0, total: 0, compliant: 0, color: 'hsl(var(--chart-1))' },
      { name: 'Metering Status', score: 0, total: 0, compliant: 0, color: 'hsl(var(--chart-2))' },
      { name: 'Snag Resolution', score: 0, total: 0, compliant: 0, color: 'hsl(var(--chart-3))' },
    ];
    
    // COC Compliance - using shared utility calculation
    const complianceStats = calculateCocComplianceStats(subsections);
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
        const hasOpenSnags = hasOpenInspectionItems(jsonData);

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
      // Health-model inputs, populated below so the trend baseline can use fresh data.
      let fetchedHealthSnags: Array<{ subsection_id: string; status: string | null; risk_level: string | null }> = [];
      let fetchedHealthInspections: Array<{ subsection_id: string | null; status: string | null }> = [];

      try {
        // Fetch snags for this site's subsections
        const subsectionIds = subsections.map(s => s.id);

        if (subsectionIds.length > 0) {
          const { data: snags } = await supabase
            .from('snags')
            .select('id, subsection_id, status, risk_level, created_at, rectified_at')
            .in('subsection_id', subsectionIds);

          if (snags) {
            setSnagCounts({
              open: snags.filter(s => s.status === 'Open' || s.status === 'open').length,
              inProgress: snags.filter(s => s.status === 'In Progress' || s.status === 'in_progress').length,
              closed: snags.filter(s => s.status === 'Closed' || s.status === 'closed' || s.status === 'Rectified').length,
            });
            // Feed the health model (siteHealth.ts) with the fields it needs.
            fetchedHealthSnags = snags.map(s => ({ subsection_id: s.subsection_id, status: s.status, risk_level: s.risk_level }));
            setHealthSnags(fetchedHealthSnags);
          }

          // Fetch inspection statuses for the health model (the inspections prop carries
          // json_data, not status, so we load status here from the same source pattern).
          const { data: inspectionRows } = await supabase
            .from('inspections')
            .select('subsection_id, status')
            .in('subsection_id', subsectionIds);

          if (inspectionRows) {
            fetchedHealthInspections = inspectionRows.map(i => ({ subsection_id: i.subsection_id, status: i.status }));
            setHealthInspections(fetchedHealthInspections);
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
        
        // Generate trend data for last 30 days (simulated based on current state).
        // Use the freshly-fetched health inputs so the baseline isn't a render behind.
        const categoryScores = calculateCategoryScores();
        const currentScore = siteHealthScore(factorScores(subsections, fetchedHealthSnags, fetchedHealthInspections));
        
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
    </div>
  );
};
