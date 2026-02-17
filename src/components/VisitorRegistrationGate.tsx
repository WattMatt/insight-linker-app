import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, UserCheck } from "lucide-react";

interface VisitorRegistrationGateProps {
  accessLinkId: string;
  companyLogoUrl?: string;
  companyName?: string;
  onRegistered: () => void;
}

interface VisitorForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
}

const VISITOR_SESSION_KEY = "visitor_session";

/** Check if visitor already registered for this link in this browser session */
export function getVisitorSession(linkId: string): boolean {
  try {
    const stored = sessionStorage.getItem(VISITOR_SESSION_KEY);
    if (!stored) return false;
    const data = JSON.parse(stored);
    return data.linkId === linkId;
  } catch {
    return false;
  }
}

export function VisitorRegistrationGate({
  accessLinkId,
  companyLogoUrl,
  companyName,
  onRegistered,
}: VisitorRegistrationGateProps) {
  const [form, setForm] = useState<VisitorForm>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof VisitorForm, string>>>({});

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof VisitorForm, string>> = {};

    if (!form.firstName.trim()) newErrors.firstName = "First name is required";
    if (!form.lastName.trim()) newErrors.lastName = "Last name is required";
    if (!form.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      newErrors.email = "Please enter a valid email";
    }
    if (!form.phone.trim()) {
      newErrors.phone = "Phone number is required";
    } else if (form.phone.trim().length < 7) {
      newErrors.phone = "Please enter a valid phone number";
    }
    if (!form.role) newErrors.role = "Please select your role";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from("access_link_visitors").insert({
        access_link_id: accessLinkId,
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        role: form.role,
        user_agent: navigator.userAgent,
      });

      if (error) {
        console.error("Visitor registration error:", error);
        toast.error("Registration failed. Please try again.");
        return;
      }

      // Store in session so they don't have to re-register on refresh
      sessionStorage.setItem(
        VISITOR_SESSION_KEY,
        JSON.stringify({ linkId: accessLinkId, email: form.email.trim().toLowerCase() })
      );

      onRegistered();
    } catch (err) {
      console.error("Unexpected registration error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = (field: keyof VisitorForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-3">
          {companyLogoUrl ? (
            <img
              src={companyLogoUrl}
              alt={companyName || "Company"}
              className="h-14 object-contain mx-auto"
            />
          ) : (
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Shield className="h-7 w-7 text-primary" />
            </div>
          )}
          <div>
            <CardTitle className="text-xl">Visitor Registration</CardTitle>
            <CardDescription>
              Please provide your details to access the compliance portal
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  placeholder="John"
                  value={form.firstName}
                  onChange={(e) => updateField("firstName", e.target.value)}
                  className={errors.firstName ? "border-destructive" : ""}
                />
                {errors.firstName && (
                  <p className="text-xs text-destructive">{errors.firstName}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  placeholder="Smith"
                  value={form.lastName}
                  onChange={(e) => updateField("lastName", e.target.value)}
                  className={errors.lastName ? "border-destructive" : ""}
                />
                {errors.lastName && (
                  <p className="text-xs text-destructive">{errors.lastName}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@company.com"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                className={errors.email ? "border-destructive" : ""}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone Number *</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+27 82 123 4567"
                value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                className={errors.phone ? "border-destructive" : ""}
              />
              {errors.phone && (
                <p className="text-xs text-destructive">{errors.phone}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role">Your Role *</Label>
              <Select
                value={form.role}
                onValueChange={(v) => updateField("role", v)}
              >
                <SelectTrigger className={errors.role ? "border-destructive" : ""}>
                  <SelectValue placeholder="Select your role..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Property Manager">Property Manager</SelectItem>
                  <SelectItem value="Facility Manager">Facility Manager</SelectItem>
                  <SelectItem value="Building Owner">Building Owner</SelectItem>
                  <SelectItem value="Tenant">Tenant</SelectItem>
                  <SelectItem value="Contractor">Contractor</SelectItem>
                  <SelectItem value="Consultant">Consultant</SelectItem>
                  <SelectItem value="Auditor">Auditor</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
              {errors.role && (
                <p className="text-xs text-destructive">{errors.role}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full min-h-[44px]"
              disabled={submitting}
            >
              {submitting ? (
                "Registering..."
              ) : (
                <>
                  <UserCheck className="h-4 w-4 mr-2" />
                  Access Portal
                </>
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Your details will be recorded for access tracking purposes.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
