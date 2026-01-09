import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Trash2, Shield, ClipboardCheck, AlertCircle } from "lucide-react";
import { Subsection } from "@/types/site";
import { useNavigate } from "react-router-dom";
import { getCategoryIcon, getCategoryColor } from "@/lib/subsectionCategories";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useState } from "react";

interface SubsectionListProps {
    subsections: Subsection[];
    onDelete: (id: string, name: string) => void;
    clientId: string;
    siteId: string;
}

export function SubsectionList({ subsections, onDelete, clientId, siteId }: SubsectionListProps) {
    const navigate = useNavigate();

    const [deleteId, setDeleteId] = useState<string | null>(null);

    return (
        <>
            <Card className="glass-card border-none overflow-hidden">
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
                        {subsections.map((sub) => {
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
                                            <div className={`p-2 rounded-lg ${categoryColor.replace('text-', 'bg-').replace('-500', '-500/10')}`}>
                                                <CategoryIcon className={`h-4 w-4 ${categoryColor}`} />
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
                                        <Badge
                                            variant={
                                                sub.coc_status === "Approved" || sub.coc_status === "Valid" || sub.coc_status === "Pass" ? "default" :
                                                    sub.coc_status === "Rejected" || sub.coc_status === "Fail" ? "destructive" : "secondary"
                                            }
                                        >
                                            {sub.coc_status}
                                        </Badge>
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
            </Card>

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
