# Site COC Coverage + No Double-Assign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every COC-required subsection on the Schedule (including those with no COC on file) and make the Assign dropdown offer only COC-required, not-yet-assigned subsections.

**Architecture:** Frontend-only. `useSiteCoc` fetches `is_coc_required` per subsection; one tested pure helper derives the "uncovered COC-required" set from the schedule + subsections; `ScheduleSubTab` renders gap rows and filters the dropdown from that same set.

**Tech Stack:** React + TS, Supabase, Vitest, shadcn.

**Spec:** `docs/superpowers/specs/2026-06-19-site-coc-coverage-design.md`

---

## Task 1: Coverage helper

**Files:** Create `src/lib/siteCoc/coverage.ts`; Test `src/lib/siteCoc/coverage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { assignedSubsectionIds, unassignedCocRequired } from "./coverage";

describe("assignedSubsectionIds", () => {
  it("collects non-null subsection ids", () => {
    const s = assignedSubsectionIds([{ subsection_id: "a" }, { subsection_id: null }, { subsection_id: "b" }]);
    expect([...s].sort()).toEqual(["a", "b"]);
  });
});

describe("unassignedCocRequired", () => {
  const subs = [
    { id: "a", name: "ACK", is_coc_required: true },
    { id: "b", name: "LV ROOM", is_coc_required: true },
    { id: "c", name: "STORE", is_coc_required: false },
  ];
  it("returns COC-required subsections not in the assigned set", () => {
    const out = unassignedCocRequired(subs, new Set(["a"]));
    expect(out.map(s => s.id)).toEqual(["b"]);
  });
  it("excludes non-COC-required even when unassigned", () => {
    const out = unassignedCocRequired(subs, new Set());
    expect(out.map(s => s.id)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npx vitest run src/lib/siteCoc/coverage.test.ts`

- [ ] **Step 3: Implement**

```ts
export function assignedSubsectionIds(rows: { subsection_id: string | null }[]): Set<string> {
  return new Set(rows.map(r => r.subsection_id).filter((x): x is string => !!x));
}

export function unassignedCocRequired<T extends { id: string; is_coc_required?: boolean | null }>(
  subs: T[], assigned: Set<string>,
): T[] {
  return subs.filter(s => !!s.is_coc_required && !assigned.has(s.id));
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `git add src/lib/siteCoc/coverage.ts src/lib/siteCoc/coverage.test.ts && git commit -m "feat(site-coc): coverage helper (assigned ids + unassigned COC-required)"`

## Task 2: Fetch is_coc_required

**Files:** Modify `src/views/site-coc/useSiteCoc.ts`

- [ ] **Step 1:** Add `is_coc_required` to `SubsectionOption`:

```ts
export interface SubsectionOption { id: string; name: string; tenant_name: string | null; is_coc_required: boolean | null; }
```

- [ ] **Step 2:** Update the subsections fetch select in `refetch`:

```ts
      supabase.from("subsections").select("id, name, tenant_name, is_coc_required").eq("site_id", siteId).is("deleted_at", null).order("name"),
```

- [ ] **Step 3: Typecheck + Commit**

```bash
npx tsc --noEmit
git add src/views/site-coc/useSiteCoc.ts
git commit -m "feat(site-coc): fetch is_coc_required for coverage"
```

## Task 3: Gap rows + filtered dropdown in ScheduleSubTab

**Files:** Modify `src/views/site-coc/ScheduleSubTab.tsx`

- [ ] **Step 1:** Add imports + derive the sets at the top of the component (after the `if (!rows.length)` guard is removed — the tab can now have gap rows even with no imported rows; see Step 3):

```ts
import { assignedSubsectionIds, unassignedCocRequired } from "@/lib/siteCoc/coverage";
```

- [ ] **Step 2:** Replace the component body so it computes coverage, renders gap rows, and filters the dropdown. Full new component:

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { scheduleStatusTone } from "@/lib/siteCoc/statusDisplay";
import { assignedSubsectionIds, unassignedCocRequired } from "@/lib/siteCoc/coverage";
import { StatusPill } from "./StatusPill";
import type { CocScheduleRow, SubsectionOption } from "./useSiteCoc";

const shortStatus = (s: string) => (s || "—").split("—")[0].trim() || "—";

function CertChips({ value }: { value: string }) {
  const items = (value || "").split(";").map(v => v.trim()).filter(Boolean);
  if (!items.length) return <span className="text-muted-foreground/60">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((c, i) => <span key={i} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-tight">{c}</span>)}
    </div>
  );
}

interface Props {
  rows: CocScheduleRow[];
  subsections: SubsectionOption[];
  onResolve: (scheduleRowId: string, shopNoRaw: string, subsectionId: string) => void;
}

export function ScheduleSubTab({ rows, subsections, onResolve }: Props) {
  const assigned = assignedSubsectionIds(rows);
  const gaps = unassignedCocRequired(subsections, assigned);
  const subName = new Map(subsections.map(s => [s.id, s.name]));

  if (!rows.length && !gaps.length) return <p className="text-sm text-muted-foreground">No schedule imported yet.</p>;

  return (
    <div className="space-y-2">
      {gaps.length > 0 && (
        <p className="text-xs font-medium text-amber-700">
          {gaps.length} COC-required subsection{gaps.length === 1 ? "" : "s"} have no COC on file.
        </p>
      )}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[1%] whitespace-nowrap">Shop</TableHead>
              <TableHead>Trading name</TableHead>
              <TableHead className="text-center">Req.</TableHead>
              <TableHead>Initial COC(s)</TableHead>
              <TableHead>Supplementary COC(s)</TableHead>
              <TableHead className="text-right">Files</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Subsection</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => {
              const unmatched = r.match_status === "unmatched";
              const req = r.coc_required.trim().toUpperCase();
              return (
                <TableRow key={r.id} className={cn(unmatched && "bg-red-50/60 hover:bg-red-50")}>
                  <TableCell className="whitespace-nowrap font-mono text-xs font-medium align-top">{r.shop_no_raw}</TableCell>
                  <TableCell className="align-top">{r.trading_name}</TableCell>
                  <TableCell className="text-center align-top">
                    <span className={cn("text-xs font-medium", req === "Y" ? "text-foreground" : "text-muted-foreground")}>
                      {req === "N/A" ? "N/A" : req || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="align-top"><CertChips value={r.initial_cert_nos} /></TableCell>
                  <TableCell className="align-top"><CertChips value={r.supplementary_cert_nos} /></TableCell>
                  <TableCell className="text-right tabular-nums align-top">{r.files_count ?? "—"}</TableCell>
                  <TableCell className="align-top">
                    <StatusPill tone={scheduleStatusTone(r.status)} label={shortStatus(r.status)} title={r.status || "—"} />
                  </TableCell>
                  <TableCell className="align-top min-w-[12rem]">
                    {r.subsection_id
                      ? <span className="text-xs">{subName.get(r.subsection_id) ?? "—"}</span>
                      : (
                        <Select onValueChange={(v) => onResolve(r.id, r.shop_no_raw, v)}>
                          <SelectTrigger className="h-8 w-full"><SelectValue placeholder="Assign subsection…" /></SelectTrigger>
                          <SelectContent>
                            {gaps.map(s => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}{s.tenant_name && s.tenant_name !== s.name ? ` · ${s.tenant_name}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                  </TableCell>
                </TableRow>
              );
            })}

            {gaps.map(s => (
              <TableRow key={`gap-${s.id}`} className="bg-amber-50/40">
                <TableCell className="align-top text-muted-foreground/60">—</TableCell>
                <TableCell className="align-top font-medium">{s.name}{s.tenant_name && s.tenant_name !== s.name ? ` · ${s.tenant_name}` : ""}</TableCell>
                <TableCell className="text-center align-top text-xs font-medium">Y</TableCell>
                <TableCell className="align-top text-muted-foreground/60">—</TableCell>
                <TableCell className="align-top text-muted-foreground/60">—</TableCell>
                <TableCell className="text-right align-top text-muted-foreground/60">—</TableCell>
                <TableCell className="align-top"><StatusPill tone="red" label="No COC" title="No COC on file" /></TableCell>
                <TableCell className="align-top text-xs">{s.name}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build** `npm run build` — Expected: success.
- [ ] **Step 4: Commit** `git add src/views/site-coc/ScheduleSubTab.tsx && git commit -m "feat(site-coc): merge uncovered COC-required subsections + dedup assign dropdown"`

## Task 4: Verify

- [ ] `npx vitest run` — all pass (incl. new coverage tests).
- [ ] `npm run build` — succeeds.

## Task 5: Deploy

- [ ] Merge `feat/site-coc-coverage` → `main`, push (Vercel prod). Confirm Ready.
- [ ] Runtime (auth): YARONA Schedule shows `CENTRE MANAGEMENT`, `COUNCIL OFFICE`, `LV ROOM` as "No COC" rows; the Assign dropdown excludes already-assigned subsections.

---

## Self-Review
- Spec §Decisions 1 (merge gaps) → Task 3 gap rows. ✓
- §Decisions 2 (dropdown COC-required + dedup) → Task 1 `unassignedCocRequired` + Task 3 dropdown uses `gaps`. ✓
- §Decisions 3 (is_coc_required, frontend-only) → Task 2 fetch; no migration. ✓
- §Pure helper → Task 1 (tested). ✓
- §Header line → Task 3 gaps banner. ✓
- Placeholders: none. Types: `SubsectionOption.is_coc_required` consistent Tasks 2↔1↔3; `unassignedCocRequired`/`assignedSubsectionIds` signatures consistent Tasks 1↔3.
- Note: `unassignedCocRequired` is generic so it accepts `SubsectionOption` (which has `is_coc_required`) in Task 3 and the test's literal objects in Task 1.
