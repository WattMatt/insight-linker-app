// regenerate_site_reports: runs the real "All reports for this site" panel in headless Chromium as the
// calling user, so the PDFs come from exactly the code the Download all / Generate button runs
// (every generator is browser code: canvas image pipeline, browser Supabase client).
// The page gets a short-lived Supabase session for the user (minted JWT, no refresh token), selects
// the requested report groups, clicks Generate and waits for "N saved · M failed".
import type { SupabaseClient } from "@supabase/supabase-js";

export const REPORT_KINDS = {
  "site-coc": "Site COC Report",
  "fortress-checklist": "Fortress Marking Checklist",
  "site-summary": "Site Summary Report",
  "asset-verification": "Asset Verification Report",
  inspection: "Subsection Inspection Reports",
} as const;
export type ReportKind = keyof typeof REPORT_KINDS;

export interface RegenerateInput {
  origin: string;               // deployment to drive, e.g. https://watsonmattheus.com
  siteId: string;
  kinds: ReportKind[];
  supabaseUrl: string;
  accessToken: string;          // minted Supabase JWT for the user
  expiresAt: number;            // seconds
  user: Record<string, unknown>;
  deadlineMs: number;           // absolute epoch ms: stop the run before the function is killed
  /** Inspection reports run in batches: at most `max` per call, only those never generated or
   *  generated before `pendingBefore` (ISO), so repeated calls with the same value resume. */
  inspection?: { max: number; pendingBefore: string };
}

async function launch() {
  const puppeteer = (await import("puppeteer-core")).default;
  if (process.env.CHROME_EXECUTABLE_PATH) {
    // Local runs: optional CHROME_ARGS (JSON array) reproduces the serverless flags.
    const args = process.env.CHROME_ARGS ? (JSON.parse(process.env.CHROME_ARGS) as string[]) : [];
    return puppeteer.launch({ executablePath: process.env.CHROME_EXECUTABLE_PATH, headless: true, args, defaultViewport: { width: 1400, height: 1000 } });
  }
  const chromium = (await import("@sparticuz/chromium")).default;
  return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true, defaultViewport: { width: 1400, height: 1000 } });
}

export async function regenerateInBrowser(input: RegenerateInput) {
  const storageKey = `sb-${new URL(input.supabaseUrl).hostname.split(".")[0]}-auth-token`;
  const session = JSON.stringify({
    access_token: input.accessToken, token_type: "bearer", expires_at: input.expiresAt,
    expires_in: input.expiresAt - Math.floor(Date.now() / 1000), refresh_token: "mcp-no-refresh", user: input.user,
  });
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const origin = new URL(input.origin).origin;
    // Diagnostics returned with every result: main-frame navigations and browser errors.
    const t0 = Date.now();
    const diag = { navigations: [] as { at_s: number; url: string }[], errors: [] as string[], dialogs: [] as string[] };
    const note = (list: string[], m: string) => { if (list.length < 20) list.push(m.slice(0, 300)); };
    // The app's PWA service worker can take over and reload the page; a headless run has no use for it.
    await page.setBypassServiceWorker(true);
    page.on("dialog", (d) => { note(diag.dialogs, `${d.type()}: ${d.message()}`); d.accept().catch(() => {}); });
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) diag.navigations.push({ at_s: Math.round((Date.now() - t0) / 1000), url: f.url().replace(origin, "") }); });
    page.on("pageerror", (e) => note(diag.errors, `pageerror: ${e instanceof Error ? e.message : String(e)}`));
    page.on("console", (m) => { if (m.type() === "error") note(diag.errors, `console: ${m.text()}`); });
    // Report rows show "Generated d MMM yyyy HH:mm" in the browser's time zone; pin it to UTC so the
    // batch filter below compares like with like.
    await page.emulateTimezone("UTC");
    await page.evaluateOnNewDocument((key: string, value: string, o: string) => {
      if (location.origin === o) localStorage.setItem(key, value);
    }, storageKey, session, origin);
    await page.goto(`${origin}/sites/${input.siteId}?tab=reports`, { waitUntil: "domcontentloaded", timeout: 30_000 });

    const labels = input.kinds.map((k) => REPORT_KINDS[k]);
    const remaining = () => input.deadlineMs - Date.now();
    // Select the requested groups (group header checkbox), then Generate.
    const batch = input.inspection ?? { max: 0, pendingBefore: new Date().toISOString() };
    const picked = await page.evaluate(async (wanted: string[], waitMs: number, inspLabel: string, max: number, pendingBefore: string) => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const t0 = Date.now();
      while (Date.now() - t0 < waitMs) {
        const ready = document.body.innerText.includes("All reports for this site") && document.querySelectorAll("button[role=checkbox]").length > 0;
        if (ready) break;
        await sleep(500);
      }
      await sleep(1500);
      if (!document.body.innerText.includes("All reports for this site")) return { error: "the All reports panel did not load (signed out, or no access to this site?)" };
      [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Clear")?.click();
      await sleep(300);
      const groups: Record<string, string> = {};
      let inspection: { total: number; pending: number; selected: number } | null = null;
      for (const label of [...document.querySelectorAll("label")]) {
        const text = (label.textContent ?? "").trim();
        const hit = wanted.find((w) => text.startsWith(w));
        if (!hit) continue;
        const box = label.querySelector("button[role=checkbox]") as HTMLButtonElement | null;
        if (!box) continue;
        if (box.disabled) { groups[hit] = "no reports to generate"; continue; }
        if (hit === inspLabel) {
          // Batch: tick individual rows, oldest-pending first in panel order, at most `max`.
          const group = label.closest("div.rounded-lg") ?? label.parentElement?.parentElement;
          const rows = [...(group?.querySelectorAll(".divide-y > div") ?? [])];
          const cutoff = Math.floor(new Date(pendingBefore).getTime() / 60000) * 60000;
          const pending = rows.filter((row) => {
            const m = (row.textContent ?? "").match(/Generated (\d{1,2} \w{3} \d{4} \d{2}:\d{2})/);
            if (!m) return true;                       // never generated
            const at = Date.parse(`${m[1]} UTC`);
            return !(at >= cutoff);
          });
          let selected = 0;
          for (const row of pending.slice(0, max)) {
            const rb = row.querySelector("button[role=checkbox]") as HTMLButtonElement | null;
            if (!rb || rb.disabled) continue;
            if (rb.getAttribute("aria-checked") !== "true") { rb.click(); await sleep(150); }
            selected++;
          }
          inspection = { total: rows.length, pending: pending.length, selected };
          groups[hit] = `batch of ${selected} (of ${pending.length} pending, ${rows.length} total)`;
          continue;
        }
        if (box.getAttribute("aria-checked") !== "true") { box.click(); await sleep(250); }
        groups[hit] = "selected";
      }
      await sleep(300);
      const g = [...document.querySelectorAll("button")].find((b) => /^Generate \d+ report/.test(b.textContent?.trim() ?? ""));
      const label = g?.textContent?.trim() ?? null;
      const n = Number(label?.match(/\d+/)?.[0] ?? 0);
      if (!g || n === 0 || (g as HTMLButtonElement).disabled) return { groups, label, selected: 0, inspection };
      g.click();
      return { groups, label, selected: n, inspection };
    }, labels, Math.min(30_000, remaining()), REPORT_KINDS.inspection, batch.max, batch.pendingBefore);
    if ("error" in picked) throw new Error(picked.error);
    if (!picked.selected) return { selected: 0, groups: picked.groups, inspection: picked.inspection, summary: null, stopped: false, errors: [] as string[], diag };
    const navsAtStart = diag.navigations.length;

    // Wait for the run summary, stopping before the function deadline.
    let stopped = false;
    for (;;) {
      let state: { done: string | null; prog: string | null };
      try {
        state = await page.evaluate(() => {
          const t = document.querySelector("main")?.textContent ?? document.body.innerText;
          const done = t.match(/\d+ saved · \d+ failed[^\n]*?\d+s/);
          const prog = t.match(/Generating… \d+ of \d+|Stopping after the current report… \d+ of \d+/);
          return { done: done?.[0] ?? null, prog: prog?.[0] ?? null };
        });
      } catch (e) {
        // A full navigation ends the in-browser run; report it instead of failing the whole call.
        if (diag.navigations.length > navsAtStart || /detached|context was destroyed/i.test(String(e))) {
          return { selected: picked.selected, groups: picked.groups, inspection: picked.inspection, summary: null, stopped: true, errors: [`the page navigated away during the run (${String(e).slice(0, 120)}); reports already saved are kept`], diag };
        }
        throw e;
      }
      if (state.done) {
        const errors = await page.evaluate(() => [...document.querySelectorAll("p.text-destructive")].map((e) => e.textContent ?? ""));
        return { selected: picked.selected, groups: picked.groups, inspection: picked.inspection, summary: state.done, stopped, errors, diag };
      }
      if (!stopped && remaining() < 45_000) {
        await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Stop")?.click());
        stopped = true;
      }
      if (remaining() < 5_000) return { selected: picked.selected, groups: picked.groups, inspection: picked.inspection, summary: state.prog, stopped: true, errors: ["function time limit reached before the run finished; reports already saved are kept"], diag };
      await new Promise((r) => setTimeout(r, 1500));
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

/** Reports saved for the site since `sinceIso` (site and inspection reports), newest first. */
export async function savedSince(sb: SupabaseClient, siteId: string, sinceIso: string) {
  const [site, subs] = await Promise.all([
    sb.from("site_documents").select("id, category, file_name, created_at").eq("site_id", siteId).gte("created_at", sinceIso),
    sb.from("subsections").select("id").eq("site_id", siteId),
  ]);
  const subIds = (subs.data ?? []).map((s) => s.id);
  const sub = subIds.length
    ? await sb.from("subsection_documents").select("id, subsection_id, file_name, uploaded_at").in("subsection_id", subIds).gte("uploaded_at", sinceIso)
    : { data: [] as { id: string; subsection_id: string; file_name: string; uploaded_at: string }[] };
  return [
    ...(site.data ?? []).map((d) => ({ file_id: `site_documents:${d.id}`, category: d.category, file_name: d.file_name, created_at: d.created_at })),
    ...(sub.data ?? []).map((d) => ({ file_id: `subsection_documents:${d.id}`, category: "Inspection Reports", file_name: d.file_name, created_at: d.uploaded_at })),
  ];
}
