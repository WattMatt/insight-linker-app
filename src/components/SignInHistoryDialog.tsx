import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  accountWarnings,
  describeEvent,
  SOURCE_LABEL,
  type SignInHistory,
} from "@/lib/auth/signInHistory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

// Admin "Sign-in history" for one user (docs/AUTH_PASSWORD_REVIEW_2026-10-29.md,
// Step 4): the account facts that explain "can't sign in", then one timeline
// from Supabase's own audit log and the app's auth_events, newest first.
// Reads public.admin_user_sign_in_history, which refuses non-admins.

export interface SignInHistoryDialogProps {
  user: { id: string; email: string; full_name?: string | null } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function when(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString() : "never";
}

export function SignInHistoryDialog({ user, open, onOpenChange }: SignInHistoryDialogProps) {
  const [history, setHistory] = useState<SignInHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    setHistory(null);
    setError(null);
    setLoading(true);
    // The function isn't in the generated types yet; its shape is SignInHistory.
    (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(
      "admin_user_sign_in_history",
      { p_user_id: user.id, p_limit: 200 },
    ).then(({ data, error: rpcError }) => {
      if (cancelled) return;
      if (rpcError) setError(rpcError.message);
      else setHistory(data as SignInHistory);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  const account = history?.account;
  const warnings = account ? accountWarnings(account) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sign-in history for {user?.full_name || user?.email}</DialogTitle>
          <DialogDescription>
            Newest first. &quot;Supabase&quot; lines are recorded by the sign-in service itself. &quot;Reported by sign-in
            page&quot; lines were sent before sign-in for this email address and could have been sent by anyone.
          </DialogDescription>
        </DialogHeader>

        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            Couldn&apos;t load the history: {error}
          </p>
        )}

        {account && (
          <div className="space-y-3">
            {warnings.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100" role="status">
                {warnings.map((w) => (
                  <p key={w} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{w}</span>
                  </p>
                ))}
              </div>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Password set</dt>
              <dd>{account.has_password ? "Yes" : "No"}</dd>
              <dt className="text-muted-foreground">Last sign-in</dt>
              <dd>{when(account.last_sign_in_at)}</dd>
              <dt className="text-muted-foreground">Last reset email</dt>
              <dd>{when(account.recovery_sent_at)}</dd>
              <dt className="text-muted-foreground">Email confirmed</dt>
              <dd>{when(account.email_confirmed_at)}</dd>
              <dt className="text-muted-foreground">Account created</dt>
              <dd>{when(account.created_at)}</dd>
            </dl>
          </div>
        )}

        {history && (
          <ScrollArea className="max-h-[45vh] pr-3">
            {history.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sign-in activity recorded.</p>
            ) : (
              <ol className="space-y-2">
                {history.events.map((event, i) => {
                  const d = describeEvent(event);
                  return (
                    <li key={`${event.at}-${i}`} className="rounded-md border p-2 text-sm" data-testid="history-event">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={d.problem ? "font-medium text-destructive" : "font-medium"}>{d.title}</span>
                        <Badge variant={event.source === "reported" ? "outline" : "secondary"}>{SOURCE_LABEL[event.source]}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {when(event.at)}
                        {event.ip ? ` · ${event.ip}` : ""}
                        {d.notes.length ? ` · ${d.notes.join(" · ")}` : ""}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
