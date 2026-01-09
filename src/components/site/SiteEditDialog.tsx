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
    const [deleteImageType, setDeleteImageType] = useState<'site_image' | 'client_logo' | null>(null);
    const [uploadingImage, setUploadingImage] = useState<'site_image' | 'client_logo' | null>(null);
    const [imagePreview, setImagePreview] = useState<{ site_image?: string; client_logo?: string }>({});
    const { takePicture } = useCamera();

    const handleImageUpload = async (file: File, imageType: 'site_image' | 'client_logo') => {
        if (!siteId) return;
        setUploadingImage(imageType);
        try {
            const path = `${siteId}/${imageType === 'site_image' ? 'site-image' : 'client-logo'}.${file.name.split('.').pop()}`;
            await supabase.storage.from('site-images').upload(path, file, { upsert: true });
            const { data } = supabase.storage.from('site-images').getPublicUrl(path);
            await supabase.from('sites').update({ 
                [imageType === 'site_image' ? 'site_image_url' : 'client_logo_url']: `${data.publicUrl}?t=${Date.now()}` 
            }).eq('id', siteId);
            toast.success(`${imageType === 'site_image' ? 'Site image' : 'Client logo'} uploaded`);
            onImageChange?.();
        } catch (error) {
            console.error('Upload error:', error);
            toast.error('Failed to upload image');
        } finally {
            setUploadingImage(null);
            setImagePreview(prev => {
                const newPreview = { ...prev };
                delete newPreview[imageType];
                return newPreview;
            });
        }
    };

    const handleDeleteImage = async (imageType: 'site_image' | 'client_logo') => {
        if (!siteId) return;
        try {
            await supabase.from('sites').update({ 
                [imageType === 'site_image' ? 'site_image_url' : 'client_logo_url']: null 
            }).eq('id', siteId);
            toast.success(`${imageType === 'site_image' ? 'Site image' : 'Client logo'} deleted`);
            onImageChange?.();
        } catch (error) {
            toast.error('Failed to delete image');
        }
    };

    const onCaptureImage = async (type: 'site_image' | 'client_logo') => {
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
                setImagePreview(prev => ({ ...prev, [type]: result }));
                await handleImageUpload(file, type);
            }
        } catch (error) {
            console.error(`${type} capture error:`, error);
            setImagePreview(prev => {
                const newPreview = { ...prev };
                delete newPreview[type];
                return newPreview;
            });
        }
    };

    const clearLegacyUrl = async (type: 'site_image' | 'client_logo') => {
        if (!siteId) return;
        await supabase
            .from('sites')
            .update({ [type === 'site_image' ? 'site_image_url' : 'client_logo_url']: null })
            .eq('id', siteId);
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
                            Update site information and images
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

                            {/* Site Images Section */}
                            {site && siteId && (
                                <div className="space-y-4">
                                    <h3 className="font-semibold flex items-center gap-2">
                                        <Image className="h-4 w-4" />
                                        Site Images
                                    </h3>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Site Main Image */}
                                        <div className="space-y-3">
                                            <Label>Site Main Image</Label>
                                            {imagePreview.site_image ? (
                                                <div className="relative w-full aspect-video">
                                                    <img
                                                        src={imagePreview.site_image}
                                                        alt="Preview"
                                                        className="w-full h-full object-cover rounded border bg-muted"
                                                    />
                                                    <Badge variant="secondary" className="absolute top-2 left-2 text-xs">
                                                        Uploading...
                                                    </Badge>
                                                </div>
                                            ) : site.site_image_url ? (
                                                <div className="relative group w-full aspect-video">
                                                    {isLegacyUrl(site.site_image_url) ? (
                                                        <div className="w-full h-full border-2 border-dashed border-amber-500 rounded flex flex-col items-center justify-center text-muted-foreground p-4">
                                                            <AlertCircle className="h-6 w-6 text-amber-500 mb-2" />
                                                            <p className="text-xs text-center mb-2">Legacy URL</p>
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => clearLegacyUrl('site_image')}
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
                                                                onClick={() => setDeleteImageType('site_image')}
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="w-full aspect-video border-2 border-dashed rounded flex items-center justify-center text-muted-foreground text-sm">
                                                    No image
                                                </div>
                                            )}
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="w-full"
                                                onClick={() => onCaptureImage('site_image')}
                                                disabled={uploadingImage === 'site_image'}
                                            >
                                                <Upload className="h-4 w-4 mr-2" />
                                                {uploadingImage === 'site_image' ? 'Uploading...' : 'Upload Image'}
                                            </Button>
                                        </div>

                                        {/* Client Logo */}
                                        <div className="space-y-3">
                                            <Label>Client Logo</Label>
                                            {imagePreview.client_logo ? (
                                                <div className="relative w-full aspect-video">
                                                    <img
                                                        src={imagePreview.client_logo}
                                                        alt="Preview"
                                                        className="w-full h-full object-contain rounded border p-2 bg-muted"
                                                    />
                                                    <Badge variant="secondary" className="absolute top-2 left-2 text-xs">
                                                        Uploading...
                                                    </Badge>
                                                </div>
                                            ) : site.client_logo_url ? (
                                                <div className="relative group w-full aspect-video">
                                                    {isLegacyUrl(site.client_logo_url) ? (
                                                        <div className="w-full h-full border-2 border-dashed border-amber-500 rounded flex flex-col items-center justify-center text-muted-foreground p-4">
                                                            <AlertCircle className="h-6 w-6 text-amber-500 mb-2" />
                                                            <p className="text-xs text-center mb-2">Legacy URL</p>
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => clearLegacyUrl('client_logo')}
                                                            >
                                                                Clear & Upload New
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <img
                                                                src={site.client_logo_url}
                                                                alt="Client logo"
                                                                className="w-full h-full object-contain rounded border p-2 bg-muted"
                                                            />
                                                            <Button
                                                                type="button"
                                                                size="icon"
                                                                variant="destructive"
                                                                className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                onClick={() => setDeleteImageType('client_logo')}
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="w-full aspect-video border-2 border-dashed rounded flex items-center justify-center text-muted-foreground text-sm">
                                                    No logo
                                                </div>
                                            )}
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="w-full"
                                                onClick={() => onCaptureImage('client_logo')}
                                                disabled={uploadingImage === 'client_logo'}
                                            >
                                                <Upload className="h-4 w-4 mr-2" />
                                                {uploadingImage === 'client_logo' ? 'Uploading...' : 'Upload Logo'}
                                            </Button>
                                        </div>
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
            <AlertDialog open={deleteImageType !== null} onOpenChange={() => setDeleteImageType(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Image</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this {deleteImageType === 'site_image' ? 'site image' : 'client logo'}? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (deleteImageType) {
                                    handleDeleteImage(deleteImageType);
                                    setDeleteImageType(null);
                                }
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