import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface InspectionDialogsProps {
    isCreateInspectionOpen: boolean;
    setIsCreateInspectionOpen: (open: boolean) => void;
    availableTemplates: Array<{ id: string, name: string, category: string }>;
    selectedTemplateId: string;
    setSelectedTemplateId: (id: string) => void;
    newInspectionDate: string;
    setNewInspectionDate: (date: string) => void;
    handleCreateInspection: () => void;
}

export function InspectionDialogs({
    isCreateInspectionOpen,
    setIsCreateInspectionOpen,
    availableTemplates,
    selectedTemplateId,
    setSelectedTemplateId,
    newInspectionDate,
    setNewInspectionDate,
    handleCreateInspection
}: InspectionDialogsProps) {
    return (
        <Dialog open={isCreateInspectionOpen} onOpenChange={setIsCreateInspectionOpen}>
            <DialogContent className="bg-popover">
                <DialogHeader>
                    <DialogTitle>Create Site Inspection</DialogTitle>
                    <DialogDescription>
                        Create a site-wide inspection like Site Drawing or Progress Report
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="templateSelect">Inspection Template</Label>
                        <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                            <SelectTrigger id="templateSelect" className="bg-background">
                                <SelectValue placeholder="Select a template" />
                            </SelectTrigger>
                            <SelectContent className="bg-popover z-50">
                                {availableTemplates.map(template => (
                                    <SelectItem key={template.id} value={template.id}>
                                        <div>
                                            <p className="font-medium">{template.name}</p>
                                            <p className="text-xs text-muted-foreground">{template.category}</p>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="inspectionDate">Inspection Date</Label>
                        <Input
                            id="inspectionDate"
                            type="date"
                            value={newInspectionDate}
                            onChange={(e) => setNewInspectionDate(e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => {
                        setIsCreateInspectionOpen(false);
                        setSelectedTemplateId("");
                        setNewInspectionDate("");
                    }}>
                        Cancel
                    </Button>
                    <Button onClick={handleCreateInspection}>
                        Create Inspection
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
