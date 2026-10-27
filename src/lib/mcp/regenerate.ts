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
}

async function launch() {
  const puppeteer = (await import("puppeteer-core")).default;
  if (process.env.CHROME_EXECUTABLE_PATH) {
    return puppeteer.launch({ executablePath: process.env.CHROME_EXECUTABLE_PATH, headless: true });
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
    await page.evaluateOnNewDocument((key: string, value: string, o: string) => {
      if (location.origin === o) localStorage.setItem(key, value);
    }, storageKey, session, origin);
    await page.goto(`${origin}/sites/${input.siteId}?tab=reports`, { waitUntil: "domcontentloaded", timeout: 30_000 });

    const labels = input.kinds.map((k) => REPORT_KINDS[k]);
    const remaining = () => input.deadlineMs - Date.now();
    // Select the requested groups (group header checkbox), then Generate.
    const picked = await page.evaluate(async (wanted: string[], waitMs: number) => {
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
      for (const label of [...document.querySelectorAll("label")]) {
        const text = (label.textContent ?? "").trim();
        const hit = wanted.find((w) => text.startsWith(w));
        if (!hit) continue;
        const box = label.querySelector("button[role=checkbox]") as HTMLButtonElement | null;
        if (!box) continue;
        if (box.disabled) { groups[hit] = "no reports to generate"; continue; }
        if (box.getAttribute("aria-checked") !== "true") { box.click(); await sleep(250); }
        groups[hit] = "selected";
      }
      await sleep(300);
      const g = [...document.querySelectorAll("button")].find((b) => /^Generate \d+ report/.test(b.textContent?.trim() ?? ""));
      const label = g?.textContent?.trim() ?? null;
      const n = Number(label?.match(/\d+/)?.[0] ?? 0);
      if (!g || n === 0 || (g as HTMLButtonElement).disabled) return { groups, label, selected: 0 };
      g.click();
      return { groups, label, selected: n };
    }, labels, Math.min(30_000, remaining()));
    if ("error" in picked) throw new Error(picked.error);
    if (!picked.selected) return { selected: 0, groups: picked.groups, summary: null, stopped: false, errors: [] as string[] };

    // Wait for the run summary, stopping before the function deadline.
    let stopped = false;
    for (;;) {
      const state = await page.evaluate(() => {
        const t = document.querySelector("main")?.textContent ?? document.body.innerText;
        const done = t.match(/\d+ saved · \d+ failed[^\n]*?\d+s/);
        const prog = t.match(/Generating… \d+ of \d+|Stopping after the current report… \d+ of \d+/);
        return { done: done?.[0] ?? null, prog: prog?.[0] ?? null };
      });
      if (state.done) {
        const errors = await page.evaluate(() => [...document.querySelectorAll("p.text-destructive")].map((e) => e.textContent ?? ""));
        return { selected: picked.selected, groups: picked.groups, summary: state.done, stopped, errors };
      }
      if (!stopped && remaining() < 45_000) {
        await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Stop")?.click());
        stopped = true;
      }
      if (remaining() < 5_000) return { selected: picked.selected, groups: picked.groups, summary: state.prog, stopped: true, errors: ["function time limit reached before the run finished; reports already saved are kept"] };
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
    ? await sb.from("subsection_documents").select("id, subsection_id, file_name, created_at").in("subsection_id", subIds).gte("created_at", sinceIso)
    : { data: [] as { id: string; subsection_id: string; file_name: string; created_at: string }[] };
  return [
    ...(site.data ?? []).map((d) => ({ file_id: `site_documents:${d.id}`, category: d.category, file_name: d.file_name, created_at: d.created_at })),
    ...(sub.data ?? []).map((d) => ({ file_id: `subsection_documents:${d.id}`, category: "Inspection Reports", file_name: d.file_name, created_at: d.created_at })),
  ];
}
