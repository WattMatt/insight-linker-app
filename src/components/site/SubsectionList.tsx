import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Trash2, Shield, ClipboardCheck, AlertCircle, ChevronDown, ChevronRight, Layers, AlertTriangle } from "lucide-react";
import { Subsection } from "@/types/site";
import { useNavigate } from "@/lib/navigation";
import { getCategoryIcon, getCategoryColor } from "@/lib/subsectionCategories";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { SubsectionFilters, SubsectionFiltersState } from "./SubsectionFilters";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";

// A snag is closed/terminal if its status (case-insensitive) is rectified or closed.
const TERMINAL_SNAG_STATUSES = ['rectified', 'closed'];
const isSnagOpen = (status: string | null | undefined): boolean =>
    !TERMINAL_SNAG_STATUSES.includes((status || '').toLowerCase());

interface Snag {
    id: string;
    subsection_id: string;
    status: string;
}

interface SubsectionListProps {
    subsections: Subsection[];
    onDelete: (id: string, name: string) => void;
    clientId: string;
    siteId: string;
    snags?: Snag[];
}

export function SubsectionList({ subsections, onDelete, clientId, siteId, snags = [] }: SubsectionListProps) {
    const navigate = useNavigate();
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    // Track which subsections have failed COC validations (including supplementary)
    const [failedValidationsBySubsection, setFailedValidationsBySubsection] = useState<Record<string, boolean>>({});

    const [filters, setFilters] = useState<SubsectionFiltersState>({
        search: "",
        cocStatus: [],
        compliance: [],
        snags: [],
        metering: [],
        category: [],
        groupBy: "none",
        viewMode: "table",
    });

    // Fetch COC validations to check for any failed supplementary validations
    useEffect(() => {
        const fetchCocValidations = async () => {
            if (subsections.length === 0) return;
            
            const subsectionIds = subsections.map(s => s.id);
            const { data, error } = await supabase
                .from('coc_validations')
                .select('subsection_id, status')
                .in('subsection_id', subsectionIds);
            
            if (error) {
                console.error("Error fetching COC validations:", error);
                return;
            }
            
            // Group by subsection and check if any have failed
            const failedMap: Record<string, boolean> = {};
            data?.forEach(validation => {
                if (validation.status === 'Fail' || validation.status === 'Failed') {
                    failedMap[validation.subsection_id] = true;
                }
            });
            setFailedValidationsBySubsection(failedMap);
        };
        
        fetchCocValidations();
    }, [subsections]);

    // Get snag counts per subsection
    const snagCountBySubsection = useMemo(() => {
        const counts: Record<string, number> = {};
        snags.forEach(snag => {
            if (isSnagOpen(snag.status)) {
                counts[snag.subsection_id] = (counts[snag.subsection_id] || 0) + 1;
            }
        });
        return counts;
    }, [snags]);

    // Get unique categories
    const categories = useMemo(() => {
        const cats = new Set(subsections.map(s => s.category || "General"));
        return Array.from(cats).sort();
    }, [subsections]);

    // Filter subsections
    const filteredSubsections = useMemo(() => {
        return subsections.filter(sub => {
            // Search filter
            if (filters.search) {
                const searchLower = filters.search.toLowerCase();
                const matchesName = sub.name.toLowerCase().includes(searchLower);
                const matchesTenant = sub.tenant_name?.toLowerCase().includes(searchLower);
                const matchesMeter = sub.meter_serial_number?.toLowerCase().includes(searchLower);
                if (!matchesName && !matchesTenant && !matchesMeter) return false;
            }

            // COC Status filter
            if (filters.cocStatus.length > 0) {
                const status = sub.coc_status || "Missing";
                if (!filters.cocStatus.includes(status)) return false;
            }

            // Compliance filter
            if (filters.compliance.length > 0) {
                const isCompliant = sub.is_compliant;
                if (filters.compliance.includes("compliant") && !isCompliant) return false;
                if (filters.compliance.includes("non-compliant") && isCompliant) return false;
                if (filters.compliance.length === 1) {
                    if (filters.compliance[0] === "compliant" && !isCompliant) return false;
                    if (filters.compliance[0] === "non-compliant" && isCompliant) return false;
                }
            }

            // Metering filter
            if (filters.metering.length > 0) {
                const hasMetering = !!sub.meter_serial_number || sub.metering_status === "Installed";
                if (filters.metering.includes("installed") && !hasMetering) return false;
                if (filters.metering.includes("missing") && hasMetering) return false;
                if (filters.metering.length === 1) {
                    if (filters.metering[0] === "installed" && !hasMetering) return false;
                    if (filters.metering[0] === "missing" && hasMetering) return false;
                }
            }

            // Category filter
            if (filters.category.length > 0) {
                const category = sub.category || "General";
                if (!filters.category.includes(category)) return false;
            }

            // Snags filter
            if (filters.snags.length > 0) {
                const hasSnags = (snagCountBySubsection[sub.id] || 0) > 0;
                if (filters.snags.includes("has-snags") && !hasSnags) return false;
                if (filters.snags.includes("no-snags") && hasSnags) return false;
                if (filters.snags.length === 1) {
                    if (filters.snags[0] === "has-snags" && !hasSnags) return false;
                    if (filters.snags[0] === "no-snags" && hasSnags) return false;
                }
            }

            return true;
        });
    }, [subsections, filters, snagCountBySubsection]);

    // Group subsections
    const groupedSubsections = useMemo(() => {
        if (filters.groupBy === "none") {
            return { "All Subsections": filteredSubsections };
        }

        const groups: Record<string, Subsection[]> = {};

        filteredSubsections.forEach(sub => {
            let groupKey: string;
            switch (filters.groupBy) {
                case "category":
                    groupKey = sub.category || "General";
                    break;
                case "cocStatus":
                    groupKey = sub.coc_status || "Missing";
                    break;
                case "compliance":
                    groupKey = sub.is_compliant ? "Compliant" : "Non-Compliant";
                    break;
                case "snags":
                    const snagCount = snagCountBySubsection[sub.id] || 0;
                    groupKey = snagCount > 0 ? "With Snags" : "No Snags";
                    break;
                default:
                    groupKey = "All";
            }

            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push(sub);
        });

        // Sort groups
        const sortedGroups: Record<string, Subsection[]> = {};
        Object.keys(groups).sort().forEach(key => {
            sortedGroups[key] = groups[key];
        });

        return sortedGroups;
    }, [filteredSubsections, filters.groupBy]);

    const toggleGroup = (groupName: string) => {
        setExpandedGroups(prev => {
            const newSet = new Set(prev);
            if (newSet.has(groupName)) {
                newSet.delete(groupName);
            } else {
                newSet.add(groupName);
            }
            return newSet;
        });
    };

    // Initialize all groups as expanded
    useMemo(() => {
        if (filters.groupBy !== "none") {
            setExpandedGroups(new Set(Object.keys(groupedSubsections)));
        }
    }, [filters.groupBy]);

    const renderTableView = (items: Subsection[]) => (
        <Table>
            <TableHeader>
                <TableRow className="hover:bg-transparent">
                    <TableHead>Subsection Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>COC Status</TableHead>
                    <TableHead>Metering</TableHead>
                    <TableHead>Compliance</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {items.map((sub) => {
                    const CategoryIcon = getCategoryIcon(sub.category);
                    const categoryColor = getCategoryColor(sub.category);

                    return (
                        <TableRow
                            key={sub.id}
                            className="group cursor-pointer hover:bg-primary/5 transition-colors"
                            onClick={() => navigate(`/clients/${clientId}/sites/${siteId}/subsections/${sub.id}`)}
                        >
                            <TableCell className="font-medium">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${categoryColor.bg}`}>
                                        <CategoryIcon className={`h-4 w-4 ${categoryColor.text}`} />
                                    </div>
                                    <div>
                                        <div>{sub.name}</div>
                                        {sub.tenant_name && <div className="text-xs text-muted-foreground">{sub.tenant_name}</div>}
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell>
                                <Badge variant="outline">
                                    {sub.category || "General"}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                {(() => {
                                    const hasFailedValidation = failedValidationsBySubsection[sub.id];
                                    const primaryStatus = sub.coc_status;
                                    const isPrimaryApproved = primaryStatus === "Approved" || primaryStatus === "Valid" || primaryStatus === "Pass";
                                    
                                    // If any validation failed (including supplementary), show prominent warning
                                    if (hasFailedValidation) {
                                        return (
                                            <div className="flex items-center gap-1.5">
                                                <AlertTriangle className="h-4 w-4 text-destructive animate-pulse" />
                                                <Badge variant="destructive" className="font-medium" title="COC validation failed - requires attention">
                                                    Validation Failed
                                                </Badge>
                                            </div>
                                        );
                                    }
                                    
                                    return (
                                        <Badge
                                            variant={
                                                isPrimaryApproved ? "default" :
                                                    primaryStatus === "Rejected" || primaryStatus === "Fail" ? "destructive" : "secondary"
                                            }
                                        >
                                            {primaryStatus || "Missing"}
                                        </Badge>
                                    );
                                })()}
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-2">
                                    {sub.meter_serial_number ? (
                                        <Badge variant="outline">
                                            {sub.meter_serial_number}
                                        </Badge>
                                    ) : (
                                        <span className="text-xs text-muted-foreground italic">No meter</span>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell>
                                <Badge variant={sub.is_compliant ? "default" : "destructive"}>
                                    {sub.is_compliant ? "Pass" : "Fail"}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/clients/${clientId}/sites/${siteId}/subsections/${sub.id}`);
                                        }}
                                    >
                                        <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setDeleteId(sub.id);
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );

    const renderGridView = (items: Subsection[]) => (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((sub) => {
                const CategoryIcon = getCategoryIcon(sub.category);
                const categoryColor = getCategoryColor(sub.category);

                return (
                    <Card
                        key={sub.id}
                        className="group cursor-pointer hover:shadow-lg hover:border-primary/30 transition-all duration-300 overflow-hidden"
                        onClick={() => navigate(`/clients/${clientId}/sites/${siteId}/subsections/${sub.id}`)}
                    >
                        <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3 min-w-0 flex-1">
                                    <div className={`p-2.5 rounded-xl ${categoryColor.bg} shrink-0`}>
                                        <CategoryIcon className={`h-5 w-5 ${categoryColor.text}`} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h4 className="font-semibold truncate">{sub.name}</h4>
                                        {sub.tenant_name && (
                                            <p className="text-sm text-muted-foreground truncate">{sub.tenant_name}</p>
                                        )}
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteId(sub.id);
                                    }}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                                <Badge variant="outline" className="text-xs">
                                    {sub.category || "General"}
                                </Badge>
                                {(() => {
                                    const hasFailedValidation = failedValidationsBySubsection[sub.id];
                                    const primaryStatus = sub.coc_status;
                                    const isPrimaryApproved = primaryStatus === "Approved" || primaryStatus === "Valid" || primaryStatus === "Pass";
                                    
                                    if (hasFailedValidation) {
                                        return (
                                            <Badge variant="destructive" className="text-xs flex items-center gap-1 font-medium" title="COC validation failed - requires attention">
                                                <AlertTriangle className="h-3 w-3 animate-pulse" />
                                                Validation Failed
                                            </Badge>
                                        );
                                    }
                                    
                                    return (
                                        <Badge
                                            variant={
                                                isPrimaryApproved ? "default" :
                                                    primaryStatus === "Rejected" || primaryStatus === "Fail" ? "destructive" : "secondary"
                                            }
                                            className="text-xs"
                                        >
                                            COC: {primaryStatus || "Missing"}
                                        </Badge>
                                    );
                                })()}
                                <Badge variant={sub.is_compliant ? "default" : "destructive"} className="text-xs">
                                    {sub.is_compliant ? "Compliant" : "Non-Compliant"}
                                </Badge>
                            </div>

                            {sub.meter_serial_number && (
                                <div className="mt-3 pt-3 border-t">
                                    <p className="text-xs text-muted-foreground">
                                        Meter: <span className="font-medium text-foreground">{sub.meter_serial_number}</span>
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );

    const getGroupIcon = (groupName: string) => {
        if (filters.groupBy === "compliance") {
            return groupName === "Compliant" ? Shield : AlertCircle;
        }
        if (filters.groupBy === "cocStatus") {
            return ClipboardCheck;
        }
        if (filters.groupBy === "snags") {
            return groupName === "No Snags" ? Shield : AlertTriangle;
        }
        return Layers;
    };

    const getGroupColor = (groupName: string) => {
        if (filters.groupBy === "compliance") {
            return groupName === "Compliant" 
                ? "bg-green-500/10 text-green-600" 
                : "bg-red-500/10 text-red-600";
        }
        if (filters.groupBy === "cocStatus") {
            if (["Approved", "Valid", "Pass"].includes(groupName)) {
                return "bg-green-500/10 text-green-600";
            }
            if (["Rejected", "Fail"].includes(groupName)) {
                return "bg-red-500/10 text-red-600";
            }
            if (groupName === "Pending") {
                return "bg-yellow-500/10 text-yellow-600";
            }
            return "bg-gray-500/10 text-gray-600";
        }
        if (filters.groupBy === "snags") {
            return groupName === "No Snags" 
                ? "bg-green-500/10 text-green-600" 
                : "bg-orange-500/10 text-orange-600";
        }
        return "bg-primary/10 text-primary";
    };

    return (
        <>
            <div className="space-y-4 mb-4">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                        <SubsectionFilters
                            filters={filters}
                            onFiltersChange={setFilters}
                            categories={categories}
                            totalCount={subsections.length}
                            filteredCount={filteredSubsections.length}
                        />
                    </div>
                </div>
            </div>

            {filteredSubsections.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <div className="p-4 rounded-full bg-muted/50 mb-4">
                            <Layers className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <h3 className="font-semibold text-lg mb-1">No subsections found</h3>
                        <p className="text-muted-foreground text-sm text-center max-w-sm">
                            {subsections.length === 0 
                                ? "No subsections have been added to this site yet."
                                : "No subsections match your current filters. Try adjusting your search or filters."
                            }
                        </p>
                    </CardContent>
                </Card>
            ) : filters.groupBy === "none" ? (
                <Card className="glass-card border-none overflow-hidden">
                    {filters.viewMode === "table" 
                        ? renderTableView(filteredSubsections)
                        : <CardContent className="p-4">{renderGridView(filteredSubsections)}</CardContent>
                    }
                </Card>
            ) : (
                <div className="space-y-4">
                    {Object.entries(groupedSubsections).map(([groupName, items]) => {
                        const GroupIcon = getGroupIcon(groupName);
                        const groupColor = getGroupColor(groupName);
                        const isExpanded = expandedGroups.has(groupName);

                        return (
                            <Collapsible
                                key={groupName}
                                open={isExpanded}
                                onOpenChange={() => toggleGroup(groupName)}
                            >
                                <Card className="overflow-hidden">
                                    <CollapsibleTrigger asChild>
                                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg ${groupColor}`}>
                                                        <GroupIcon className="h-4 w-4" />
                                                    </div>
                                                    <div>
                                                        <CardTitle className="text-base">{groupName}</CardTitle>
                                                        <p className="text-sm text-muted-foreground">
                                                            {items.length} subsection{items.length !== 1 ? "s" : ""}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="secondary">{items.length}</Badge>
                                                    {isExpanded ? (
                                                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                                                    ) : (
                                                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                                                    )}
                                                </div>
                                            </div>
                                        </CardHeader>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                        {filters.viewMode === "table" 
                                            ? renderTableView(items)
                                            : <CardContent className="pt-0">{renderGridView(items)}</CardContent>
                                        }
                                    </CollapsibleContent>
                                </Card>
                            </Collapsible>
                        );
                    })}
                </div>
            )}

            <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Subsection</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this subsection? This will permanently delete all associated inspections, documents, snags, and QR codes. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (deleteId) {
                                    const sub = subsections.find(s => s.id === deleteId);
                                    if (sub) onDelete(deleteId, sub.name);
                                    setDeleteId(null);
                                }
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete Permanently
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
