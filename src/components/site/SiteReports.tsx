import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SiteSummaryReport } from "@/components/SiteSummaryReport";
import { BulkInspectionReportGenerator } from "@/components/site/BulkInspectionReportGenerator";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { Site } from "@/types/site";
import { supabase } from "@/integrations/supabase/client";
import { downloadFile } from "@/lib/fileDownload";
import { storagePathFromUrl } from "@/lib/documents/paths";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
    FileText,
    Download,
    Eye, 
    Trash2, 
    Search, 
    FileBarChart,
    Calendar,
    Clock,
    RefreshCw,
    ClipboardList
} from "lucide-react";

interface SiteReportsProps {
    site: Site;
    readOnly?: boolean;
    autoOpenGenerate?: boolean;
}

interface SavedReport {
    id: string;
    file_name: string;
    file_url: string;
    category: string;
    created_at: string;
}

// Report category names that should be shown in this view
const REPORT_CATEGORIES = [
    'Site Summary Reports',
    'Inspection Reports',
    'Compliance Reports',
    'Floor Plan Reports',
    'Asset Verification Reports',
    'COC Validation Reports',
    'Site COC Reports'
];

export const SiteReports: React.FC<SiteReportsProps> = ({ site, readOnly = false }) => {
    const [reports, setReports] = useState<SavedReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [previewDocument, setPreviewDocument] = useState<{ url: string; name: string } | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);

    const fetchReports = async () => {
        try {
            setLoading(true);
            
            // Fetch site documents that match report categories
            const { data, error } = await supabase
                .from('site_documents')
                .select('id, file_name, file_url, category, created_at')
                .eq('site_id', site.id)
                .in('category', REPORT_CATEGORIES)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setReports(data || []);
        } catch (error) {
            console.error("Error fetching reports:", error);
            toast.error("Failed to load reports");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();
    }, [site.id]);

    const handleDeleteReport = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
        
        try {
            setDeleting(id);
            
            // Get the stored file reference to delete from storage.
            // storagePathFromUrl handles both legacy full URLs and bare-path rows.
            const report = reports.find(r => r.id === id);
            const path = report?.file_url ? storagePathFromUrl(report.file_url) : null;
            if (path) {
                await supabase.storage.from('documents').remove([path]);
            }
            
            const { error } = await supabase
                .from('site_documents')
                .delete()
                .eq('id', id);

            if (error) throw error;
            
            toast.success(`${name} deleted`);
            setReports(prev => prev.filter(r => r.id !== id));
        } catch (error) {
            console.error("Error deleting report:", error);
            toast.error("Failed to delete report");
        } finally {
            setDeleting(null);
        }
    };

    const filteredReports = useMemo(() => {
        if (!searchQuery) return reports;
        const query = searchQuery.toLowerCase();
        return reports.filter(r => 
            r.file_name.toLowerCase().includes(query) ||
            r.category.toLowerCase().includes(query)
        );
    }, [reports, searchQuery]);

    const getCategoryColor = (category: string): string => {
        if (category.includes('Summary')) return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
        if (category.includes('Inspection')) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
        if (category.includes('Compliance')) return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
        if (category.includes('Floor')) return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
        if (category.includes('Asset')) return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200';
        if (category.includes('COC')) return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
        return 'bg-muted text-muted-foreground';
    };

    return (
        <div className="space-y-6">
            {/* Generate Report Section - Only show in edit mode */}
            {!readOnly && (
              <Tabs defaultValue="site-summary" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-4">
                      <TabsTrigger value="site-summary" className="gap-2">
                          <FileBarChart className="h-4 w-4" />
                          Site Summary Report
                      </TabsTrigger>
                      <TabsTrigger value="bulk-inspections" className="gap-2">
                          <ClipboardList className="h-4 w-4" />
                          Bulk Inspection Reports
                      </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="site-summary">
                      <Card>
                          <CardHeader>
                              <CardTitle className="flex items-center gap-2">
                                  <FileBarChart className="h-5 w-5" />
                                  Generate Site Summary Report
                              </CardTitle>
                              <CardDescription>
                                  Create a comprehensive site report with all subsection data
                              </CardDescription>
                          </CardHeader>
                          <CardContent>
                              <SiteSummaryReport
                                  siteId={site.id}
                                  siteName={site.name}
                                  clientName={site.clients?.name || ''}
                                  onSaved={fetchReports}
                              />
                          </CardContent>
                      </Card>
                  </TabsContent>
                  
                  <TabsContent value="bulk-inspections">
                      <BulkInspectionReportGenerator
                          siteId={site.id}
                          siteName={site.name}
                          clientName={site.clients?.name}
                          siteLogoUrl={site.client_logo_url}
                          onComplete={fetchReports}
                      />
                  </TabsContent>
              </Tabs>
            )}

            {/* Saved Reports Card */}
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <FileText className="h-5 w-5" />
                                Saved Reports
                            </CardTitle>
                            <CardDescription>
                                {reports.length} report{reports.length !== 1 ? 's' : ''} available for review and download
                            </CardDescription>
                        </div>
                        {!readOnly && (
                          <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={fetchReports}
                              className="gap-2"
                          >
                              <RefreshCw className="h-4 w-4" />
                              Refresh
                          </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Search */}
                    {reports.length > 0 && (
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search reports..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    )}

                    {/* Reports List */}
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : filteredReports.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/20">
                            <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                            <p className="text-muted-foreground">
                                {searchQuery 
                                    ? `No reports match "${searchQuery}"`
                                    : "No reports generated yet"
                                }
                            </p>
                            <p className="text-sm text-muted-foreground mt-1">
                                Generate your first report using the button above
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredReports.map((report) => (
                                <div 
                                    key={report.id} 
                                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border group hover:bg-muted/50 transition-colors gap-3"
                                >
                                    <div className="flex items-start gap-3 min-w-0">
                                        <FileText className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                                        <div className="min-w-0 space-y-1">
                                            <p className="font-medium text-sm truncate">{report.file_name}</p>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Badge className={getCategoryColor(report.category)} variant="secondary">
                                                    {report.category.replace(' Reports', '')}
                                                </Badge>
                                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    {format(new Date(report.created_at), 'MMM d, yyyy')}
                                                </span>
                                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    {format(new Date(report.created_at), 'HH:mm')}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 justify-end">
                                        <Button 
                                            size="sm" 
                                            variant="ghost" 
                                            onClick={() => setPreviewDocument({ url: report.file_url, name: report.file_name })}
                                            className="gap-1"
                                        >
                                            <Eye className="h-4 w-4" />
                                            <span className="hidden sm:inline">Preview</span>
                                        </Button>
                                        <Button 
                                            size="sm" 
                                            variant="ghost"
                                            className="gap-1"
                                            onClick={() => downloadFile(report.file_url, report.file_name)}
                                        >
                                            <Download className="h-4 w-4" />
                                            <span className="hidden sm:inline">Download</span>
                                        </Button>
                                        {!readOnly && (
                                          <Button
                                              size="sm"
                                              variant="ghost"
                                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                              onClick={() => handleDeleteReport(report.id, report.file_name)}
                                              disabled={deleting === report.id}
                                          >
                                              {deleting === report.id ? (
                                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                              ) : (
                                                  <Trash2 className="h-4 w-4" />
                                              )}
                                          </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Preview Dialog */}
            <DocumentPreviewDialog
                open={previewDocument !== null}
                onOpenChange={(open) => !open && setPreviewDocument(null)}
                fileUrl={previewDocument?.url || ''}
                fileName={previewDocument?.name || ''}
            />
        </div>
    );
};
