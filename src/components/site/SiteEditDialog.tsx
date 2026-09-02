import React, { useEffect, useState } from "react";
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
import { SITE_TYPE_OPTIONS } from "@/lib/siteTypes";
import { normaliseImageForUpload } from "@/lib/uploadImageNormaliser";

// Mirrors the real columns of public.sites — the previous shape carried
// description/status/lat/lng, which don't exist on the table, so every save
// was rejected by the API.
export interface SiteEditFormData {
    name: string;
    address: string;
    site_type: string;
    managing_agency_id: string; // "" = no agency (fund-level visibility only)
}

interface SiteEditDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editFormData: SiteEditFormData;
    setEditFormData: React.Dispatch<React.SetStateAction<SiteEditFormData>>;
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
    const [agencies, setAgencies] = useState<{ id: string; name: string }[]>([]);
    const { takePicture } = useCamera();

    // The site's client's managing agencies (empty for clients without any —
    // the agency selector only renders when the client uses agencies).
    useEffect(() => {
        if (!open || !site?.client_id) return;
        supabase
            .from("managing_agencies")
            .select("id, name")
            .eq("client_id", site.client_id)
            .order("name")
            .then(({ data, error }) => {
                if (error) {
                    console.error("Failed to load managing agencies:", error);
                    return;
                }
                setAgencies(data ?? []);
            });
    }, [open, site?.client_id]);

    const handleImageUpload = async (file: File) => {
        if (!siteId) return;
        setUploadingImage(true);
        try {
            // Single conversion gate: HEIC → JPEG, downscale, truthful mime/extension.
            const normalised = await normaliseImageForUpload(file);
            if (!normalised.ok) {
                toast.error(normalised.error.reason);
                return;
            }
            const path = `${siteId}/site-image.${normalised.image.extension}`;
            await supabase.storage.from('site-images').upload(path, normalised.image.blob, {
                upsert: true,
                contentType: normalised.image.mime,
            });
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
                            </div>

                            {/* Classification */}
                            <div className="space-y-4">
                                <h3 className="font-semibold">Classification</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="edit-site-type">Site Type / Sector</Label>
                                        <Select
                                            value={editFormData.site_type || undefined}
                                            onValueChange={(v) => setEditFormData({ ...editFormData, site_type: v })}
                                        >
                                            <SelectTrigger id="edit-site-type">
                                                <SelectValue placeholder="Select site type" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {/* keep a legacy value visible/selectable rather than blanking it */}
                                                {editFormData.site_type &&
                                                    !SITE_TYPE_OPTIONS.some(o => o.value === editFormData.site_type) && (
                                                        <SelectItem value={editFormData.site_type}>
                                                            {editFormData.site_type}
                                                        </SelectItem>
                                                    )}
                                                {SITE_TYPE_OPTIONS.map((o) => (
                                                    <SelectItem key={o.value} value={o.value}>
                                                        {o.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {agencies.length > 0 && (
                                        <div className="space-y-2">
                                            <Label htmlFor="edit-agency">Managing Agency</Label>
                                            <Select
                                                value={editFormData.managing_agency_id || "none"}
                                                onValueChange={(v) =>
                                                    setEditFormData({ ...editFormData, managing_agency_id: v === "none" ? "" : v })
                                                }
                                            >
                                                <SelectTrigger id="edit-agency">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">No agency</SelectItem>
                                                    {agencies.map((agency) => (
                                                        <SelectItem key={agency.id} value={agency.id}>
                                                            {agency.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <p className="text-xs text-muted-foreground">
                                                Agency-scoped portal users only see sites assigned to their agency.
                                            </p>
                                        </div>
                                    )}
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