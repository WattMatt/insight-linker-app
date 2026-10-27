"use client";
// OAuth consent for MCP clients (Claude connectors). Uses the normal app session: if signed out the
// user goes through /auth/login and comes back here. The server validates the request, checks the
// account is staff and issues the authorization code (see /api/oauth/authorize).
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Check =
  | { kind: "consent"; client_name: string | null; redirect_host: string; scopes: string[] }
  | { kind: "fatal" | "refused"; error: string; error_description: string; redirect_to?: string }
  | { kind: "redirect"; redirect_to: string };

const SCOPE_TEXT: Record<string, string> = {
  "fortress.read": "Read Fortress sites, COC records, verdicts, KPIs and saved reports",
  "fortress.write": "Sign off verdicts, replace COC rows and regenerate reports (each write needs a dry run first)",
  offline_access: "Stay connected (refresh tokens)",
};

function Authorize() {
  const search = useSearchParams();
  const params = Object.fromEntries(search.entries());
  const [check, setCheck] = useState<Exclude<Check, { kind: "redirect" }> | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.replace(`/auth/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        return;
      }
      setEmail(data.session.user.email ?? null);
      const res = await fetch("/api/oauth/authorize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check", params }) });
      const body = (await res.json()) as Check;
      if (body.kind === "redirect") { window.location.replace(body.redirect_to); return; }
      setCheck(body);
    })().catch((e) => setCheck({ kind: "fatal", error: "server_error", error_description: e instanceof Error ? e.message : String(e) }));
    // params come from the URL once; re-running would re-validate the same request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decide = async (action: "approve" | "deny") => {
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ action, params }),
      });
      const body = (await res.json()) as Check;
      if (body.kind === "redirect") { window.location.replace(body.redirect_to); return; }
      setCheck(body);
    } finally {
      setBusy(false);
    }
  };

  if (!check) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        {check.kind === "consent" ? (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Connect {check.client_name ?? "an MCP client"}?</CardTitle>
              <CardDescription>
                <span className="font-medium text-foreground">{check.client_name ?? "Unnamed client"}</span> will be sent back to{" "}
                <span className="font-mono text-foreground">{check.redirect_host}</span> and act as <span className="font-medium text-foreground">{email}</span> on the Fortress MCP server.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm">
                {check.scopes.map((s) => <li key={s} className="rounded border px-3 py-2"><span className="font-mono text-xs">{s}</span><br />{SCOPE_TEXT[s] ?? s}</li>)}
              </ul>
              <p className="text-xs text-muted-foreground">Staff accounts only. Every tool call is recorded in the audit log. You can disconnect it in Claude at any time.</p>
              <div className="flex gap-2">
                <Button className="flex-1" disabled={busy} onClick={() => decide("approve")}>Allow</Button>
                <Button className="flex-1" variant="outline" disabled={busy} onClick={() => decide("deny")}>Deny</Button>
              </div>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-destructive" /> {check.kind === "refused" ? "Not allowed" : "Can't connect"}</CardTitle>
              <CardDescription>{check.error_description}</CardDescription>
            </CardHeader>
            {check.kind === "refused" && check.redirect_to && (
              <CardContent><Button variant="outline" onClick={() => window.location.replace(check.redirect_to!)}>Back to the app that asked</Button></CardContent>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

export default function AuthorizePage() {
  return <Suspense><Authorize /></Suspense>;
}
