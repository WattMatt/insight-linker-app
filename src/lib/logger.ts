/**
 * Minimal structured logger — the single replacement for the ~425 raw console.*
 * calls scattered through src/.
 *
 * - `debug` is compiled out of production output (noise-free consoles on site).
 * - `error` additionally forwards to an installed reporter (Sentry, PostHog, ...)
 *   once one is registered, so production failures stop being invisible.
 * - `child(scope)` prefixes every line, replacing hand-rolled "[useOfflineSync] ..."
 *   string prefixes.
 *
 * No dependencies; safe in browser, Node, and the Capacitor WebView.
 */

type LogArgs = unknown[];

export interface ErrorReporter {
  captureMessage(message: string, context?: Record<string, unknown>): void;
  captureException(error: unknown, context?: Record<string, unknown>): void;
}

let reporter: ErrorReporter | null = null;

/** Wire up Sentry (or any reporter) once at app start; logging works without it. */
export function installErrorReporter(instance: ErrorReporter): void {
  reporter = instance;
}

const isProduction = process.env.NODE_ENV === "production";

function emit(level: "debug" | "info" | "warn" | "error", scope: string | null, args: LogArgs): void {
  if (level === "debug" && isProduction) return;

  const prefix = scope ? `[${scope}]` : null;
  const line = prefix ? [prefix, ...args] : args;

  // eslint-disable-next-line no-console
  console[level](...line);

  if (level === "error" && reporter) {
    const [first, ...rest] = args;
    const context = { scope: scope ?? undefined, extra: rest.length > 0 ? rest : undefined };
    if (first instanceof Error) {
      reporter.captureException(first, context);
    } else {
      reporter.captureMessage(String(first), context);
    }
  }
}

export interface Logger {
  debug(...args: LogArgs): void;
  info(...args: LogArgs): void;
  warn(...args: LogArgs): void;
  error(...args: LogArgs): void;
  child(scope: string): Logger;
}

function createLogger(scope: string | null): Logger {
  return {
    debug: (...args) => emit("debug", scope, args),
    info: (...args) => emit("info", scope, args),
    warn: (...args) => emit("warn", scope, args),
    error: (...args) => emit("error", scope, args),
    child: (childScope) => createLogger(scope ? `${scope}:${childScope}` : childScope),
  };
}

export const logger: Logger = createLogger(null);
