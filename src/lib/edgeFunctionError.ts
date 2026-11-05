/**
 * supabase-js replaces the message of every non-2xx Edge Function reply with the fixed
 * string "Edge Function returned a non-2xx status code" and leaves the untouched
 * Response on `error.context` — the function's own `{ success: false, error }` body is
 * the only place the real reason survives. `context` is absent for network-level
 * failures and its body reads only once, so nothing here may throw: this runs on a
 * failure path, where a second error would bury the first.
 */
export const readInvokeError = async (error: unknown, fallback: string): Promise<Error> => {
  const failure = error as { message?: string; context?: Response } | null | undefined;
  const context = failure?.context;

  try {
    if (context && typeof context.text === "function") {
      // clone() leaves the caller's body unread; it throws once the body is consumed,
      // which the catch below absorbs.
      const source = typeof context.clone === "function" ? context.clone() : context;
      const body = JSON.parse(await source.text()) as { error?: unknown } | null;
      if (typeof body?.error === "string" && body.error.trim()) {
        return new Error(body.error);
      }
    }
  } catch {
    // Absent, non-JSON, or already-consumed body — keep the original message.
  }

  return new Error(failure?.message || fallback);
};
