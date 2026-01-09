import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SiteEditDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editFormData: {
        name: string;
        address: string;
        description: string;
        status: string;
        location_lat: string;
        location_lng: string;
    };
    setEditFormData: React.Dispatch<React.SetStateAction<{
        name: string;
        address: string;
        description: string;
        status: string;
        location_lat: string;
        location_lng: string;
    }>>;
    onSubmit: (e: React.FormEvent) => void;
}

export const SiteEditDialog: React.FC<SiteEditDialogProps> = ({
    open,
    onOpenChange,
    editFormData,
    setEditFormData,
    onSubmit
}) => {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit Site</DialogTitle>
                    <DialogDescription>
                        Update the site information
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={onSubmit}>
                    <div className="space-y-6 py-4">
                        <div className="space-y-4">
                            <h3 className="font-semibold">Basic Information</h3>
                            <div className="space-y-2">
                                <Label htmlFor="edit-name">Site Name *</Label>
                                <Input
                                    id="edit-name"
                                    value={editFormData.name}
                                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                                    placeholder="e.g., Waterfall Mall"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-address">Address</Label>
                                <Input
                                    id="edit-address"
                                    value={editFormData.address}
                                    onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                                    placeholder="Physical address"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-description">Description</Label>
                                <Input
                                    id="edit-description"
                                    value={editFormData.description}
                                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                                    placeholder="Brief description"
                                />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="font-semibold">Location & Status</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="edit-status">Status</Label>
                                    <Select
                                        value={editFormData.status}
                                        onValueChange={(v) => setEditFormData({ ...editFormData, status: v })}
                                    >
                                        <SelectTrigger id="edit-status">
                                            <SelectValue placeholder="Select status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Active">Active</SelectItem>
                                            <SelectItem value="Maintenance">Maintenance</SelectItem>
                                            <SelectItem value="Pending">Pending</SelectItem>
                                            <SelectItem value="Inactive">Inactive</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="edit-lat">Latitude</Label>
                                    <Input
                                        id="edit-lat"
                                        value={editFormData.location_lat}
                                        onChange={(e) => setEditFormData({ ...editFormData, location_lat: e.target.value })}
                                        placeholder="-25.123456"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-lng">Longitude</Label>
                                    <Input
                                        id="edit-lng"
                                        value={editFormData.location_lng}
                                        onChange={(e) => setEditFormData({ ...editFormData, location_lng: e.target.value })}
                                        placeholder="27.123456"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit">
                            Save Changes
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
