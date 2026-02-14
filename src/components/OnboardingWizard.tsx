import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Camera, ArrowRight, ArrowLeft, CheckCircle2, User, Zap, Shield, ClipboardCheck } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";

interface OnboardingWizardProps {
  open: boolean;
  onComplete: () => void;
}

const STEPS = ["Welcome", "Profile", "Photo", "Overview"];

export function OnboardingWizard({ open, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { data: userRole } = useUserRole();

  const { data: settings } = useQuery({
    queryKey: ["company-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("settings")
        .select("company_name, company_logo_url")
        .single();
      return data;
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["onboarding-profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, phone, job_title, company, bio, avatar_url, email")
        .eq("id", user.id)
        .single();
      if (data) {
        setFullName(data.full_name || "");
        setPhone(data.phone || "");
        setJobTitle(data.job_title || "");
        setCompany(data.company || "");
        setBio(data.bio || "");
        setAvatarUrl(data.avatar_url);
      }
      return data;
    },
  });

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const ext = file.name.split(".").pop();
      const path = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("profile-images")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("profile-images")
        .getPublicUrl(path);

      setAvatarUrl(urlData.publicUrl);
      toast.success("Photo uploaded!");
    } catch (error: any) {
      toast.error(error.message || "Failed to upload photo");
    } finally {
      setUploading(false);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName || undefined,
          phone: phone || undefined,
          job_title: jobTitle || undefined,
          company: company || undefined,
          bio: bio || undefined,
          avatar_url: avatarUrl || undefined,
          onboarding_completed: true,
        })
        .eq("id", user.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["current-user-profile"] });
      queryClient.invalidateQueries({ queryKey: ["onboarding-profile"] });
      toast.success("Welcome aboard! You're all set.");
      onComplete();
    } catch (error: any) {
      toast.error(error.message || "Failed to save profile");
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return "U";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const getRoleDescription = () => {
    switch (userRole) {
      case "Admin":
        return "As an Admin, you can manage clients, sites, inspections, users, and generate compliance reports.";
      case "Client":
        return "As a Client, you can view your sites, track compliance status, and access inspection reports.";
      case "Contractor":
        return "As a Contractor, you can view assigned sites, complete inspections, and upload documentation.";
      default:
        return "Your account is set up. An administrator will assign your role and permissions shortly.";
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-lg [&>button]:hidden" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-xl">
            {step === 0 && "Welcome! 🎉"}
            {step === 1 && "Complete Your Profile"}
            {step === 2 && "Add a Profile Photo"}
            {step === 3 && "You're All Set!"}
          </DialogTitle>
          <DialogDescription>
            Step {step + 1} of {STEPS.length}
          </DialogDescription>
        </DialogHeader>

        {/* Progress */}
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="space-y-4 py-4 text-center">
            <div className="flex justify-center">
              {settings?.company_logo_url ? (
                <img
                  src={settings.company_logo_url}
                  alt="Company"
                  className="h-16 object-contain"
                />
              ) : (
                <div className="w-16 h-16 bg-primary rounded-lg flex items-center justify-center">
                  <Zap className="h-8 w-8 text-primary-foreground" />
                </div>
              )}
            </div>
            <h3 className="text-lg font-semibold">
              Welcome to {settings?.company_name || "SiteWise"}
            </h3>
            <p className="text-sm text-muted-foreground">
              Let's get your account set up. This will only take a minute.
            </p>
          </div>
        )}

        {/* Step 1: Profile details */}
        {step === 1 && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="ob-name">Full Name</Label>
                <Input
                  id="ob-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Smith"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ob-phone">Phone</Label>
                <Input
                  id="ob-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+27 ..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ob-job">Job Title</Label>
                <Input
                  id="ob-job"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Electrical Engineer"
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="ob-company">Company</Label>
                <Input
                  id="ob-company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Your company name"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Photo */}
        {step === 2 && (
          <div className="space-y-4 py-4 flex flex-col items-center">
            <Avatar className="h-24 w-24">
              <AvatarImage src={avatarUrl || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                {getInitials(fullName)}
              </AvatarFallback>
            </Avatar>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Camera className="h-4 w-4 mr-2" />
              {uploading ? "Uploading..." : avatarUrl ? "Change Photo" : "Upload Photo"}
            </Button>
            <p className="text-xs text-muted-foreground">Optional — you can always add this later</p>
          </div>
        )}

        {/* Step 3: Overview */}
        {step === 3 && (
          <div className="space-y-4 py-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Your Role: {userRole || "Pending"}</p>
                  <p className="text-xs text-muted-foreground">{getRoleDescription()}</p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">SANS Compliance Platform</span>
              </div>
              <p className="text-xs text-muted-foreground">
                This platform manages electrical compliance documentation, inspections, and certificates of compliance in accordance with SANS 10142 regulations.
              </p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-2">
          {step > 0 ? (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          ) : (
            <div />
          )}

          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)}>
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleComplete} disabled={loading}>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              {loading ? "Saving..." : "Get Started"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
