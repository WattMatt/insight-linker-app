"use client";

import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AuthSettings {
  company_name: string;
  company_logo_url: string | null;
  login_hero_image_url: string | null;
}

interface AuthLayoutProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}

// Shared 2-column branding shell for every /auth/* page.
// Left column: logo + heading + form (children). Right column: hero image
// (with fallback gradient). Branding pulled from the `settings` table.
export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  const [settings, setSettings] = useState<AuthSettings | null>(null);

  useEffect(() => {
    // NOTE: this query runs before the user has authenticated, so the
    // `settings` row(s) read here must be RLS-readable by the anon role.
    // Limit the SELECT to branding columns only — never add anything to
    // this query that could leak business config / keys / internal flags.
    // (Security-review LOW #12.)
    let cancelled = false;
    void supabase
      .from("settings")
      .select("company_name, company_logo_url, login_hero_image_url")
      .single()
      .then(({ data }) => {
        if (!cancelled && data) setSettings(data as AuthSettings);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen flex">
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-8">
          <div className="flex justify-center">
            {settings?.company_logo_url ? (
              <img
                src={settings.company_logo_url}
                alt={settings.company_name || "Company Logo"}
                className="h-16 object-contain"
              />
            ) : (
              <div className="w-16 h-16 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-2xl font-bold text-primary-foreground">WM</span>
              </div>
            )}
          </div>

          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">
              {title ?? settings?.company_name ?? "Watson Mattheus"}
            </h1>
            {subtitle ? <p className="text-muted-foreground">{subtitle}</p> : null}
          </div>

          {children}
        </div>
      </div>

      <div className="hidden lg:block lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary/20 via-primary/10 to-background">
        {settings?.login_hero_image_url ? (
          <img
            src={settings.login_hero_image_url}
            alt="Login Hero"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-sky-600/20 via-blue-700/20 to-indigo-800/20 flex items-center justify-center">
            <div className="text-center text-white/80 p-8">
              <h2 className="text-4xl font-bold mb-4">Electrical Compliance Management</h2>
              <p className="text-lg">Streamline your inspections and certifications</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
