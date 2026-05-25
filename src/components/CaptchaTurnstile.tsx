"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// Cloudflare Turnstile widget wrapper. Renders nothing (and the consumer
// proceeds without captcha) when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset —
// useful for local dev where Turnstile isn't configured.
//
// Consumers check CAPTCHA_ENABLED before requiring a token; if enabled and
// the user hasn't completed the challenge, block submit with a friendly
// message. After a failed submit, consumers MUST call the imperative
// `reset()` handle exposed via the ref — Turnstile tokens are single-use
// server-side, so a stale token in React state after a failed attempt
// would race against Supabase's rejection on retry.
//
// REQUIRES Supabase project-level captcha enforcement to be on (Dashboard ->
// Authentication -> Auth Providers -> Captcha protection). The client gate
// is only defense-in-depth; Supabase is the real gate.

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
export const CAPTCHA_ENABLED = Boolean(SITE_KEY);

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

interface TurnstileWindow extends Window {
  turnstile?: {
    render: (
      container: HTMLElement,
      options: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void },
    ) => string;
    remove: (widgetId: string) => void;
    reset: (widgetId?: string) => void;
  };
}

export interface CaptchaTurnstileHandle {
  /** Reset the widget. Call after a failed submit to issue a fresh token. */
  reset: () => void;
}

interface Props {
  onTokenChange: (token: string | null) => void;
}

export const CaptchaTurnstile = forwardRef<CaptchaTurnstileHandle, Props>(
  function CaptchaTurnstile({ onTokenChange }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const widgetIdRef = useRef<string | null>(null);
    const callbackRef = useRef(onTokenChange);
    callbackRef.current = onTokenChange;

    useImperativeHandle(
      ref,
      () => ({
        reset: () => {
          const win = window as TurnstileWindow;
          if (widgetIdRef.current && win.turnstile) {
            win.turnstile.reset(widgetIdRef.current);
            callbackRef.current(null);
          }
        },
      }),
      [],
    );

    useEffect(() => {
      if (!CAPTCHA_ENABLED || !containerRef.current) return;

      // Load script once per page.
      let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
      if (!script) {
        script = document.createElement("script");
        script.src = SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }

      function render() {
        const win = window as TurnstileWindow;
        if (!win.turnstile || !containerRef.current) return;
        widgetIdRef.current = win.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          callback: (token) => callbackRef.current(token),
          "expired-callback": () => callbackRef.current(null),
        });
      }

      if ((window as TurnstileWindow).turnstile) {
        render();
      } else {
        script.addEventListener("load", render, { once: true });
      }

      return () => {
        const win = window as TurnstileWindow;
        if (widgetIdRef.current && win.turnstile) {
          win.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
      };
    }, []);

    if (!CAPTCHA_ENABLED) return null;
    return <div ref={containerRef} className="flex justify-center" />;
  },
);
