import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { recordAuthEvent } from "@/lib/auth-audit";
import { evaluatePassword } from "@/lib/password-strength";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Camera, Save, Lock, User, Mail, Calendar } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { format } from "date-fns";

const MyProfile = () => {
  const queryClient = useQueryClient();
  const { data: userRole } = useUserRole();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Profile form state
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [company, setCompany] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return { ...data, auth_email: user.email, created_at_auth: user.created_at };
    },
  });

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setPhone(profile.phone || "");
      setJobTitle(profile.job_title || "");
      setDepartment(profile.department || "");
      setCompany(profile.company || "");
      setAddress(profile.address || "");
      setCity(profile.city || "");
      setCountry(profile.country || "");
      setPostalCode(profile.postal_code || "");
      setBio(profile.bio || "");
      setAvatarUrl(profile.avatar_url);
    }
  }, [profile]);

  const getInitials = (name: string) => {
    if (!name) return "U";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

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
      // Save immediately
      await supabase.from("profiles").update({ avatar_url: urlData.publicUrl }).eq("id", user.id);
      queryClient.invalidateQueries({ queryKey: ["current-user-profile"] });
      toast.success("Photo updated!");
    } catch (error: any) {
      toast.error(error.message || "Failed to upload photo");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          phone,
          job_title: jobTitle,
          department,
          company,
          address,
          city,
          country,
          postal_code: postalCode,
          bio,
          avatar_url: avatarUrl,
        })
        .eq("id", user.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["current-user-profile"] });
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      toast.success("Profile updated successfully!");
    } catch (error: any) {
      toast.error(error.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    // Sync with the auth-flow rules (was min 6 — now matches EC-2: 8 chars
    // minimum + zxcvbn score >= 2 + not in HIBP breach corpus).
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setChangingPassword(true);
    try {
      // Verify current password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile?.email || "",
        password: currentPassword,
      });
      if (signInError) {
        toast.error("Current password is incorrect");
        return;
      }
      // Strength + breach gate (best-effort; matches Set/ResetPassword).
      const evalRes = await evaluatePassword(newPassword);
      if (evalRes.score < 2) {
        toast.error("Password is too weak. Mix words, length, and symbols.", { duration: 6000 });
        return;
      }
      if (evalRes.pwned) {
        toast.error(
          `Found in ${evalRes.pwnCount?.toLocaleString() ?? "known"} data breaches. Choose a unique password.`,
          { duration: 6000 },
        );
        return;
      }
      // Update password
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        if (error.message?.includes("weak") || error.message?.includes("pwned")) {
          toast.error("Password is too common. Please choose a stronger password.", { duration: 6000 });
        } else {
          toast.error(error.message);
        }
        return;
      }
      recordAuthEvent("password_changed", { method: "self" });
      toast.success("Password changed successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast.error(error.message || "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground">Manage your personal information and account settings</p>
      </div>

      {/* Avatar & Basic Info */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-6">
            <div className="relative">
              <Avatar className="h-20 w-20">
                <AvatarImage src={avatarUrl || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-xl">
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
                size="icon"
                variant="outline"
                className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Camera className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold">{fullName || "User"}</h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                {profile?.auth_email || profile?.email}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary">{userRole || "User"}</Badge>
                {profile?.created_at_auth && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Member since {format(new Date(profile.created_at_auth), "MMM yyyy")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" /> Personal Details
          </CardTitle>
          <CardDescription>Update your personal information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jobTitle">Job Title</Label>
              <Input id="jobTitle" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Input id="department" value={department} onChange={(e) => setDepartment(e.target.value)} />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="company">Company</Label>
              <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postalCode">Postal Code</Label>
              <Input id="postalCode" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A short description about yourself..."
              rows={3}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveProfile} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4" /> Change Password
          </CardTitle>
          <CardDescription>Update your account password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={changingPassword}>
              <Lock className="h-4 w-4 mr-2" />
              {changingPassword ? "Changing..." : "Change Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default MyProfile;
