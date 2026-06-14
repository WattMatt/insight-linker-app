import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Loader2, Link as LinkIcon, Settings2, Shield, Eye, UserCog, ImageIcon } from "lucide-react";

import { ImageCompressionManager } from "@/components/settings/ImageCompressionManager";
import { AutoLogoutSettings } from "@/components/settings/AutoLogoutSettings";
import PortalManagement from "./PortalManagement";
import Users from "./Users";

interface Settings {
  id: string;
  company_logo_url: string | null;
  login_hero_image_url: string | null;
  company_name: string;
  primary_color: string;
  qr_base_url: string | null;
}

const Settings = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [qrBaseUrl, setQrBaseUrl] = useState("");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .single();

      if (error) throw error;
      setSettings(data);
      setCompanyName(data.company_name || "");
      setQrBaseUrl(data.qr_base_url || "");
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const uploadImage = async (file: File, bucket: string, type: 'logo' | 'hero') => {
    try {
      setUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${type}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      const updateField = type === 'logo' ? 'company_logo_url' : 'login_hero_image_url';
      
      const { error: updateError } = await supabase
        .from("settings")
        .update({ [updateField]: publicUrl })
        .eq("id", settings!.id);

      if (updateError) throw updateError;

      toast.success(`${type === 'logo' ? 'Logo' : 'Hero image'} uploaded successfully`);
      fetchSettings();
    } catch (error: any) {
      console.error(`Error uploading ${type}:`, error);
      toast.error(error.message || `Failed to upload ${type}`);
    } finally {
      setUploading(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadImage(file, 'company-logos', 'logo');
    }
  };

  const handleHeroUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadImage(file, 'company-logos', 'hero');
    }
  };

  const handleCompanyNameUpdate = async () => {
    try {
      const { error } = await supabase
        .from("settings")
        .update({ company_name: companyName })
        .eq("id", settings!.id);

      if (error) throw error;
      toast.success("Company name updated");
      fetchSettings();
    } catch (error: any) {
      console.error("Error updating company name:", error);
      toast.error(error.message || "Failed to update company name");
    }
  };

  const handleQrBaseUrlUpdate = async () => {
    try {
      const { error } = await supabase
        .from("settings")
        .update({ qr_base_url: qrBaseUrl })
        .eq("id", settings!.id);

      if (error) throw error;
      toast.success("QR code base URL updated. Regenerate QR codes to apply changes.");
      fetchSettings();
    } catch (error: any) {
      console.error("Error updating QR base URL:", error);
      toast.error(error.message || "Failed to update QR base URL");
    }
  };

  const handleGoogleDriveConnect = () => {
    toast.info("Google Drive integration coming soon");
  };

  const handleBackupToGoogleDrive = () => {
    toast.info("Backup to Google Drive coming soon");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your application's appearance, branding, and report templates.
        </p>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="image-compression" className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Images
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <UserCog className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="portals" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Portals
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          {/* Branding Section */}
          <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>
            Customize the logos and images used throughout the application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>Company Logo (for sidebar)</Label>
            <div className="flex items-start gap-4">
              {settings?.company_logo_url && (
                <div className="border rounded-lg p-4 bg-muted/50 w-40 h-40 flex items-center justify-center">
                  <img
                    src={settings.company_logo_url}
                    alt="Company Logo"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              )}
              <div className="flex-1 space-y-2">
                <Button
                  variant="outline"
                  disabled={uploading}
                  onClick={() => document.getElementById('logo-upload')?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {uploading ? "Uploading..." : "Choose File"}
                </Button>
                <input
                  id="logo-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                  disabled={uploading}
                />
                <p className="text-sm text-muted-foreground">
                  No file chosen
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Login Page Hero Image</Label>
            <div className="flex items-start gap-4">
              {settings?.login_hero_image_url && (
                <div className="border rounded-lg p-4 bg-muted/50 w-64 h-40 flex items-center justify-center overflow-hidden">
                  <img
                    src={settings.login_hero_image_url}
                    alt="Hero Image"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="flex-1 space-y-2">
                <Button
                  variant="outline"
                  disabled={uploading}
                  onClick={() => document.getElementById('hero-upload')?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {uploading ? "Uploading..." : "Choose File"}
                </Button>
                <input
                  id="hero-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleHeroUpload}
                  disabled={uploading}
                />
                <p className="text-sm text-muted-foreground">
                  No file chosen
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label htmlFor="company-name">Company Name</Label>
            <div className="flex gap-2">
              <Input
                id="company-name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Watson Mattheus"
              />
              <Button onClick={handleCompanyNameUpdate}>
                Update
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <Label htmlFor="qr-base-url">QR Code Base URL</Label>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  id="qr-base-url"
                  value={qrBaseUrl}
                  onChange={(e) => setQrBaseUrl(e.target.value)}
                  placeholder="https://watsonmattheus.com"
                />
                <Button onClick={handleQrBaseUrlUpdate}>
                  Update
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Enter your published app URL or custom domain. After updating, regenerate all QR codes from the site's QR Codes tab.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integrations Section */}
      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>
            Connect to external services like Google Drive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <h4 className="font-semibold">Google Drive Integration</h4>
              <p className="text-sm text-muted-foreground">
                Link your Google Drive account to sync document folders with your sites.
              </p>
            </div>
            <Button onClick={handleGoogleDriveConnect}>
              <LinkIcon className="mr-2 h-4 w-4" />
              Link Google Drive
            </Button>
          </div>

          </CardContent>
        </Card>

        {/* Auto Logout Settings */}
        <AutoLogoutSettings />
      </TabsContent>



      <TabsContent value="image-compression">
        <ImageCompressionManager />
      </TabsContent>

      <TabsContent value="users">
        <Users />
      </TabsContent>

      <TabsContent value="portals">
        <PortalManagement />
      </TabsContent>
    </Tabs>
    </div>
  );
};

export default Settings;
