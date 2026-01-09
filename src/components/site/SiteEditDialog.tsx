import React, { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Upload, AlertCircle, Image } from "lucide-react";
import { Site } from "@/types/site";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCamera } from "@/hooks/useCamera";

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
    site?: Site | null;
    siteId?: string;
    onImageChange?: () => void;
}

export const SiteEditDialog: React.FC<SiteEditDialogProps> = ({
    open,
    onOpenChange,
    editFormData,
    setEditFormData,
    onSubmit,
    site,
    siteId,
    onImageChange
}) => {
    const [deleteImageConfirm, setDeleteImageConfirm] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const { takePicture } = useCamera();

    const handleImageUpload = async (file: File) => {
        if (!siteId) return;
        setUploadingImage(true);
        try {
            const path = `${siteId}/site-image.${file.name.split('.').pop()}`;
            await supabase.storage.from('site-images').upload(path, file, { upsert: true });
            const { data } = supabase.storage.from('site-images').getPublicUrl(path);
            await supabase.from('sites').update({ 
                site_image_url: `${data.publicUrl}?t=${Date.now()}` 
            }).eq('id', siteId);
            toast.success("Site image uploaded");
            onImageChange?.();
        } catch (error) {
            console.error('Upload error:', error);
            toast.error('Failed to upload image');
        } finally {
            setUploadingImage(false);
            setImagePreview(null);
        }
    };

    const handleDeleteImage = async () => {
        if (!siteId) return;
        try {
            await supabase.from('sites').update({ site_image_url: null }).eq('id', siteId);
            toast.success("Site image deleted");
            onImageChange?.();
        } catch (error) {
            toast.error('Failed to delete image');
        }
    };

    const onCaptureImage = async () => {
        try {
            const file = await takePicture({ preferCamera: false });
            if (file) {
                const reader = new FileReader();
                const previewPromise = new Promise<string>((resolve, reject) => {
                    reader.onload = (event) => resolve(event.target?.result as string);
                    reader.onerror = reject;
                });
                reader.readAsDataURL(file);
                const result = await previewPromise;
                setImagePreview(result);
                await handleImageUpload(file);
            }
        } catch (error) {
            console.error("Image capture error:", error);
            setImagePreview(null);
        }
    };

    const clearLegacyUrl = async () => {
        if (!siteId) return;
        await supabase.from('sites').update({ site_image_url: null }).eq('id', siteId);
        toast.success("Legacy URL removed. Please upload a new image.");
        onImageChange?.();
    };

    const isLegacyUrl = (url: string | null | undefined) => {
        if (!url) return false;
        return url.includes('firebasestorage.googleapis.com') ||
            url.includes('storage.googleapis.com') ||
            !url.includes('supabase.co/storage');
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit Site</DialogTitle>
                        <DialogDescription>
                            Update site information and image
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={onSubmit}>
                        <div className="space-y-6 py-4">
                            {/* Basic Information */}
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

                            {/* Location & Status */}
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

                            {/* Site Image Section */}
                            {site && siteId && (
                                <div className="space-y-4">
                                    <h3 className="font-semibold flex items-center gap-2">
                                        <Image className="h-4 w-4" />
                                        Site Image
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        Note: Client logo is managed at the client level and applies to all sites.
                                    </p>
                                    
                                    <div className="space-y-3">
                                        {imagePreview ? (
                                            <div className="relative w-full max-w-md aspect-video">
                                                <img
                                                    src={imagePreview}
                                                    alt="Preview"
                                                    className="w-full h-full object-cover rounded border bg-muted"
                                                />
                                                <Badge variant="secondary" className="absolute top-2 left-2 text-xs">
                                                    Uploading...
                                                </Badge>
                                            </div>
                                        ) : site.site_image_url ? (
                                            <div className="relative group w-full max-w-md aspect-video">
                                                {isLegacyUrl(site.site_image_url) ? (
                                                    <div className="w-full h-full border-2 border-dashed border-amber-500 rounded flex flex-col items-center justify-center text-muted-foreground p-4">
                                                        <AlertCircle className="h-6 w-6 text-amber-500 mb-2" />
                                                        <p className="text-xs text-center mb-2">Legacy URL</p>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={clearLegacyUrl}
                                                        >
                                                            Clear & Upload New
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <img
                                                            src={site.site_image_url}
                                                            alt="Site main image"
                                                            className="w-full h-full object-cover rounded border bg-muted"
                                                        />
                                                        <Button
                                                            type="button"
                                                            size="icon"
                                                            variant="destructive"
                                                            className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            onClick={() => setDeleteImageConfirm(true)}
                                                        >
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="w-full max-w-md aspect-video border-2 border-dashed rounded flex items-center justify-center text-muted-foreground text-sm">
                                                No image uploaded
                                            </div>
                                        )}
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={onCaptureImage}
                                            disabled={uploadingImage}
                                        >
                                            <Upload className="h-4 w-4 mr-2" />
                                            {uploadingImage ? 'Uploading...' : 'Upload Site Image'}
                                        </Button>
                                    </div>
                                </div>
                            )}
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

            {/* Delete Image Confirmation */}
            <AlertDialog open={deleteImageConfirm} onOpenChange={setDeleteImageConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Site Image</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this site image? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                handleDeleteImage();
                                setDeleteImageConfirm(false);
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};