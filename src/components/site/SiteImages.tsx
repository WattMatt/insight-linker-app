import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Upload, AlertCircle } from "lucide-react";
import { Site } from "@/types/site";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCamera } from "@/hooks/useCamera";

interface SiteImagesProps {
    site: Site;
    siteId: string;
    imagePreview: { site_image?: string; client_logo?: string };
    setImagePreview: React.Dispatch<React.SetStateAction<{ site_image?: string; client_logo?: string }>>;
    handleImageUpload: (file: File, imageType: 'site_image' | 'client_logo') => Promise<void>;
    handleDeleteImage: (imageType: 'site_image' | 'client_logo') => Promise<void>;
    uploadingImage: 'site_image' | 'client_logo' | null;
    fetchSiteData: () => void;
}

export const SiteImages: React.FC<SiteImagesProps> = ({
    site,
    siteId,
    imagePreview,
    setImagePreview,
    handleImageUpload,
    handleDeleteImage,
    uploadingImage,
    fetchSiteData
}) => {
    const [deleteImageType, setDeleteImageType] = useState<'site_image' | 'client_logo' | null>(null);
    const { takePicture } = useCamera();

    const onCaptureImage = async (type: 'site_image' | 'client_logo') => {
        try {
            const file = await takePicture({ preferCamera: false }); // Let user choose between camera and gallery
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

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>Site Images</CardTitle>
                    <CardDescription>Manage site logo and main image</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Site Main Image */}
                    <div>
                        <h3 className="text-sm font-medium mb-3">Site Main Image</h3>
                        {imagePreview.site_image ? (
                            <div className="relative group w-fit mb-3">
                                <img
                                    src={imagePreview.site_image}
                                    alt="Preview"
                                    className="w-64 h-48 object-cover rounded border bg-muted"
                                />
                                <Badge variant="secondary" className="absolute top-2 left-2">
                                    Preview
                                </Badge>
                            </div>
                        ) : site.site_image_url ? (
                            <div className="relative group w-fit">
                                {(site.site_image_url.includes('firebasestorage.googleapis.com') ||
                                    site.site_image_url.includes('storage.googleapis.com') ||
                                    !site.site_image_url.includes('supabase.co/storage')) ? (
                                    <div className="w-64 h-48 border-2 border-dashed border-amber-500 rounded flex flex-col items-center justify-center text-muted-foreground p-4">
                                        <AlertCircle className="h-8 w-8 text-amber-500 mb-2" />
                                        <p className="text-sm text-center mb-3">Legacy image URL detected</p>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={async () => {
                                                await supabase
                                                    .from('sites')
                                                    .update({ site_image_url: null })
                                                    .eq('id', siteId);
                                                toast.success("Legacy URL removed. Please upload a new image.");
                                                fetchSiteData();
                                            }}
                                        >
                                            Clear & Upload New
                                        </Button>
                                    </div>
                                ) : (
                                    <>
                                        <img
                                            src={site.site_image_url}
                                            alt="Site main image"
                                            className="w-64 h-48 object-cover rounded border bg-muted"
                                        />
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => setDeleteImageType('site_image')}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="w-64 h-48 border-2 border-dashed rounded flex items-center justify-center text-muted-foreground">
                                No image
                            </div>
                        )}
                        <div className="mt-3">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onCaptureImage('site_image')}
                                disabled={uploadingImage === 'site_image'}
                            >
                                <Upload className="h-4 w-4 mr-2" />
                                {uploadingImage === 'site_image' ? 'Uploading...' : 'Upload New Image'}
                            </Button>
                        </div>
                    </div>

                    {/* Client Logo */}
                    <div>
                        <h3 className="text-sm font-medium mb-3">Client Logo</h3>
                        {imagePreview.client_logo ? (
                            <div className="relative group w-fit mb-3">
                                <img
                                    src={imagePreview.client_logo}
                                    alt="Preview"
                                    className="w-48 h-32 object-contain rounded border p-2 bg-muted"
                                />
                                <Badge variant="secondary" className="absolute top-2 left-2">
                                    Preview
                                </Badge>
                            </div>
                        ) : site.client_logo_url ? (
                            <div className="relative group w-fit">
                                {site.client_logo_url.includes('firebasestorage.googleapis.com') ? (
                                    <div className="w-48 h-32 border-2 border-dashed border-amber-500 rounded flex flex-col items-center justify-center text-muted-foreground p-4">
                                        <AlertCircle className="h-8 w-8 text-amber-500 mb-2" />
                                        <p className="text-xs font-medium text-center mb-2">Legacy Firebase Logo</p>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={async () => {
                                                await supabase
                                                    .from('sites')
                                                    .update({ client_logo_url: null })
                                                    .eq('id', siteId);
                                                toast.success("Legacy URL removed. Please upload a new logo.");
                                                fetchSiteData();
                                            }}
                                        >
                                            Clear & Upload New
                                        </Button>
                                    </div>
                                ) : (
                                    <>
                                        <img
                                            src={site.client_logo_url}
                                            alt="Client logo"
                                            className="w-48 h-32 object-contain rounded border p-2 bg-muted"
                                            crossOrigin="anonymous"
                                        />
                                        {site.client_logo_url.includes('supabase.co/storage') && (
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={() => setDeleteImageType('client_logo')}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="w-48 h-32 border-2 border-dashed rounded flex items-center justify-center text-muted-foreground">
                                No logo
                            </div>
                        )}
                        <div className="mt-3">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onCaptureImage('client_logo')}
                                disabled={uploadingImage === 'client_logo'}
                            >
                                <Upload className="h-4 w-4 mr-2" />
                                {uploadingImage === 'client_logo' ? 'Uploading...' : 'Upload New Logo'}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

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
        </div>
    );
};
