# Report Redesign — Phase 0: Kernel + Test Harness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, unit-tested report kernel of guarded formatters and apply it to root out the silent-formatting defects (#2, #8, #10, #11), fix the margin (#12) and footer page-math (#4 defensive), and remove the silent 20-row truncation (#3).

**Architecture:** A new pure-function module `src/lib/report/reportKernel.ts` owns date/number/filename formatting with explicit, locale-independent output (no `toLocaleDateString`). Existing report code is routed through it: `pdfBranding` formatters delegate to the kernel, `documentDesignStandards` filename stamping uses local time, the compliance + site-summary generators use the kernel and lose their hard caps. Each fix is locked by a colocated vitest test.

**Tech Stack:** TypeScript, pdfmake (`Content`/`TDocumentDefinitions`), vitest (node env, globals on, `@`→`src` alias), `npm test` → `vitest run`.

**Spec:** `docs/superpowers/specs/2026-06-13-report-system-redesign-design.md`

---

## File Structure

- **Create:** `src/lib/report/reportKernel.ts` — pure formatters: `formatDate`, `formatDateTime`, `localDateStamp`, `percent`, `clampPageNumbers`.
- **Create:** `src/lib/report/reportKernel.test.ts` — unit tests for the kernel.
- **Modify:** `src/lib/pdfBranding.ts:337-358` — `formatPdfDate`/`formatPdfDateTime` delegate to kernel.
- **Modify:** `src/lib/documentDesignStandards.ts:396-410` — `generateDocumentFilename` uses `localDateStamp` (fix #11).
- **Modify:** `src/lib/pdfMakeConfig.ts:58-63` — fix `mmToPt(50)` top-margin unit bug (#12).
- **Modify:** `src/lib/pdfMakeUtils.ts:451-492` — footer uses `clampPageNumbers` + kernel date (fix #4 defensive, #8).
- **Create:** `src/lib/report/complianceRows.ts` — pure `buildComplianceSummaryRows(stats)` (fix #10, testable).
- **Create:** `src/lib/report/complianceRows.test.ts`.
- **Modify:** `src/lib/complianceReportGenerator.ts:145-180` — use `buildComplianceSummaryRows` + kernel `formatDate` (fix #10, #8).
- **Create:** `src/lib/report/siteSummaryRows.ts` — pure `buildCocValidationRows`, `buildInspectionRows` (fix #3, testable).
- **Create:** `src/lib/report/siteSummaryRows.test.ts`.
- **Modify:** `src/components/SiteSummaryReport.tsx:455-500` — use the row builders, no `.slice(0,20)` (fix #3, #8).

---

## Task 1: Kernel formatters (`formatDate`, `formatDateTime`, `localDateStamp`, `percent`)

**Files:**
- Create: `src/lib/report/reportKernel.ts`
- Test: `src/lib/report/reportKernel.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/report/reportKernel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatDate, formatDateTime, localDateStamp, percent } from './reportKernel';

describe('formatDate', () => {
  it('formats a valid date day-first, full month, padded day', () => {
    expect(formatDate(new Date(2026, 5, 13))).toBe('13 June 2026'); // month 5 = June
  });
  it('pads single-digit days', () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe('05 January 2026');
  });
  it('accepts ISO date-only strings', () => {
    expect(formatDate('2026-06-13')).toBe('13 June 2026');
  });
  it('returns the fallback for empty / null / undefined (does NOT default to today)', () => {
    expect(formatDate('')).toBe('—');
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
  });
  it('returns the fallback for an unparseable date (never "Invalid Date")', () => {
    expect(formatDate('not-a-date')).toBe('—');
    expect(formatDate('2026-13-45')).toBe('—');
  });
  it('honors a custom fallback', () => {
    expect(formatDate(null, 'N/A')).toBe('N/A');
  });
});

describe('formatDateTime', () => {
  it('formats date + 24h time, short month', () => {
    expect(formatDateTime(new Date(2026, 5, 13, 14, 30))).toBe('13 Jun 2026, 14:30');
  });
  it('pads hours and minutes', () => {
    expect(formatDateTime(new Date(2026, 5, 13, 9, 5))).toBe('13 Jun 2026, 09:05');
  });
  it('returns the fallback for bad input', () => {
    expect(formatDateTime('nope')).toBe('—');
  });
});

describe('localDateStamp', () => {
  it('emits YYYY-MM-DD from LOCAL components (not UTC)', () => {
    expect(localDateStamp(new Date(2026, 5, 13))).toBe('2026-06-13');
    expect(localDateStamp(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('falls back to now for missing input (filenames always get a date)', () => {
    expect(localDateStamp()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('percent', () => {
  it('rounds a normal ratio', () => {
    expect(percent(1, 4)).toBe('25%');
    expect(percent(2, 3)).toBe('67%');
  });
  it('guards divide-by-zero (no NaN%)', () => {
    expect(percent(0, 0)).toBe('0%');
    expect(percent(5, 0)).toBe('0%');
  });
  it('guards NaN inputs', () => {
    expect(percent(NaN, 10)).toBe('0%');
  });
  it('honors a custom fallback', () => {
    expect(percent(1, 0, '—')).toBe('—');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/report/reportKernel.test.ts`
Expected: FAIL — `Failed to resolve import "./reportKernel"` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/report/reportKernel.ts`:

```ts
/**
 * Report kernel — pure, deterministic formatters shared by all report builders.
 *
 * Dates are formatted with EXPLICIT day-first output (not toLocaleDateString),
 * so results are identical regardless of host locale, ICU build, or timezone of
 * the test runner. Missing/invalid dates return a visible fallback ("—") and
 * NEVER "Invalid Date" or a fabricated "today".
 */

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function toValidDate(input?: Date | string | null): Date | null {
  if (input === undefined || input === null || input === '') return null;
  const d = input instanceof Date ? input : new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** "13 June 2026" (local components, day-first). Fallback for missing/invalid. */
export function formatDate(input?: Date | string | null, fallback = '—'): string {
  const d = toValidDate(input);
  if (!d) return fallback;
  return `${pad2(d.getDate())} ${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
}

/** "13 Jun 2026, 14:30" (local, 24h). Fallback for missing/invalid. */
export function formatDateTime(input?: Date | string | null, fallback = '—'): string {
  const d = toValidDate(input);
  if (!d) return fallback;
  return `${pad2(d.getDate())} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "2026-06-13" from LOCAL components, for filenames. Defaults to now. */
export function localDateStamp(input?: Date | string | null): string {
  const d = toValidDate(input) ?? new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "25%" with divide-by-zero / NaN guards. */
export function percent(numerator: number, denominator: number, fallback = '0%'): string {
  if (!denominator || isNaN(denominator) || isNaN(numerator)) return fallback;
  return `${Math.round((numerator / denominator) * 100)}%`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/report/reportKernel.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/report/reportKernel.ts src/lib/report/reportKernel.test.ts
git commit -m "feat(reports): deterministic report kernel formatters (#2,#8,#10,#11)"
```

---

## Task 2: `clampPageNumbers` helper (footer page-math safety, #4 defensive)

**Files:**
- Modify: `src/lib/report/reportKernel.ts`
- Test: `src/lib/report/reportKernel.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `src/lib/report/reportKernel.test.ts`:

```ts
import { clampPageNumbers } from './reportKernel';

describe('clampPageNumbers', () => {
  it('passes through when not skipping the cover', () => {
    expect(clampPageNumbers(2, 5, false)).toEqual({ page: 2, total: 5 });
  });
  it('shifts by one when skipping the cover', () => {
    expect(clampPageNumbers(2, 5, true)).toEqual({ page: 1, total: 4 });
  });
  it('never returns 0 or negative (no "Page 0 of 0")', () => {
    expect(clampPageNumbers(1, 1, true)).toEqual({ page: 1, total: 1 });
  });
  it('never lets page exceed total', () => {
    expect(clampPageNumbers(5, 4, false)).toEqual({ page: 4, total: 4 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/report/reportKernel.test.ts -t clampPageNumbers`
Expected: FAIL — `clampPageNumbers is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/report/reportKernel.ts`:

```ts
/**
 * Compute the page numbers shown in a footer, accounting for a skipped cover
 * page, and clamp so we never display 0/negative or page > total.
 */
export function clampPageNumbers(
  currentPage: number,
  pageCount: number,
  skipFirstPage: boolean,
): { page: number; total: number } {
  const rawPage = skipFirstPage ? currentPage - 1 : currentPage;
  const rawTotal = skipFirstPage ? pageCount - 1 : pageCount;
  const total = Math.max(1, rawTotal);
  const page = Math.min(Math.max(1, rawPage), total);
  return { page, total };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/report/reportKernel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/report/reportKernel.ts src/lib/report/reportKernel.test.ts
git commit -m "feat(reports): clampPageNumbers footer-math helper (#4)"
```

---

## Task 3: Route `pdfBranding` formatters through the kernel (#2, #8)

**Files:**
- Modify: `src/lib/pdfBranding.ts:337-358`
- Test: `src/lib/pdfBranding.dates.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdfBranding.dates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatPdfDate, formatPdfDateTime } from './pdfBranding';

describe('pdfBranding date formatters (delegated to kernel)', () => {
  it('formatPdfDate uses day-first kernel output', () => {
    expect(formatPdfDate(new Date(2026, 5, 13))).toBe('13 June 2026');
  });
  it('formatPdfDate returns "—" for an invalid string (not "Invalid Date")', () => {
    expect(formatPdfDate('garbage')).toBe('—');
  });
  it('formatPdfDate returns "—" for empty (no longer defaults to today)', () => {
    expect(formatPdfDate('')).toBe('—');
  });
  it('formatPdfDateTime uses kernel datetime output', () => {
    expect(formatPdfDateTime(new Date(2026, 5, 13, 14, 30))).toBe('13 Jun 2026, 14:30');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pdfBranding.dates.test.ts`
Expected: FAIL — current `formatPdfDate('garbage')` returns `"Invalid Date"`, and `formatPdfDate('')` returns today's date.

- [ ] **Step 3: Implement — delegate to the kernel**

In `src/lib/pdfBranding.ts`, replace the bodies at lines 337-358:

```ts
import { formatDate as kernelFormatDate, formatDateTime as kernelFormatDateTime } from './report/reportKernel';

/**
 * Format a date for display in PDFs. Delegates to the report kernel:
 * day-first, locale-independent, "—" for missing/invalid.
 */
export function formatPdfDate(date?: Date | string): string {
  return kernelFormatDate(date);
}

/**
 * Format a datetime for display in PDFs. Delegates to the report kernel.
 */
export function formatPdfDateTime(date?: Date | string): string {
  return kernelFormatDateTime(date);
}
```

(Place the `import` with the other imports at the top of the file; remove it from inline if duplicated.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/pdfBranding.dates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdfBranding.ts src/lib/pdfBranding.dates.test.ts
git commit -m "fix(reports): route pdfBranding dates through guarded kernel (#2,#8)"
```

---

## Task 4: Local-time filename stamp (#11)

**Files:**
- Modify: `src/lib/documentDesignStandards.ts:396-410`
- Test: `src/lib/documentDesignStandards.filename.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/documentDesignStandards.filename.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateDocumentFilename } from './documentDesignStandards';

describe('generateDocumentFilename', () => {
  it('stamps the LOCAL date, not UTC', () => {
    // 13 June 2026 local midnight — UTC-based formatting could roll to the 12th.
    const name = generateDocumentFilename('inspection', 'Acme Site', new Date(2026, 5, 13));
    expect(name).toContain('2026-06-13');
    expect(name.endsWith('.pdf')).toBe(true);
  });
  it('sanitizes unsafe characters in the site name', () => {
    const name = generateDocumentFilename('inspection', 'A/B C*?', new Date(2026, 5, 13));
    expect(name).not.toMatch(/[\/*?]/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/documentDesignStandards.filename.test.ts`
Expected: The local-date test may PASS or FAIL depending on the runner timezone (that flakiness is the bug). Treat a TZ-dependent result as the failing condition we are removing.

- [ ] **Step 3: Implement — use `localDateStamp`**

In `src/lib/documentDesignStandards.ts`, add the import near the top:

```ts
import { localDateStamp } from './report/reportKernel';
```

Replace line 404:

```ts
  const dateStr = localDateStamp(date);
```

- [ ] **Step 4: Run to verify it passes (deterministically, any timezone)**

Run: `TZ=America/Los_Angeles npx vitest run src/lib/documentDesignStandards.filename.test.ts`
Expected: PASS (the local stamp is `2026-06-13` regardless of TZ).

- [ ] **Step 5: Commit**

```bash
git add src/lib/documentDesignStandards.ts src/lib/documentDesignStandards.filename.test.ts
git commit -m "fix(reports): local-time filename stamp, not UTC (#11)"
```

---

## Task 5: Fix the top-margin unit bug (#12)

**Files:**
- Modify: `src/lib/pdfMakeConfig.ts:58-63`
- Test: `src/lib/pdfMakeConfig.margins.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdfMakeConfig.margins.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PAGE_CONFIG } from './pdfMakeConfig';

describe('PAGE_CONFIG margins', () => {
  it('top margin is ~64pt (header band), not the ~141pt mm-confusion value', () => {
    const top = PAGE_CONFIG.pageMargins[1];
    expect(top).toBeGreaterThan(50);
    expect(top).toBeLessThan(90); // ~141pt (the mmToPt(50) bug) is excluded
  });
  it('bottom margin leaves room for the footer (~70-110pt)', () => {
    const bottom = PAGE_CONFIG.pageMargins[3];
    expect(bottom).toBeGreaterThan(60);
    expect(bottom).toBeLessThan(120);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pdfMakeConfig.margins.test.ts`
Expected: FAIL — current top is `mmToPt(50)` ≈ 141.7pt, exceeding the `< 90` bound.

- [ ] **Step 3: Implement — use an explicit point value**

In `src/lib/pdfMakeConfig.ts`, replace the top-margin line (currently `mmToPt(50)`) at line 60:

```ts
  pageMargins: [
    mmToPt(margins.left),       // ~42.5pt
    64,                         // 64pt top — header band (was mmToPt(50)≈141pt; unit bug)
    mmToPt(margins.right),      // ~42.5pt
    mmToPt(35),                 // ~99pt bottom — footer band
  ] as [number, number, number, number],
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/pdfMakeConfig.margins.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdfMakeConfig.ts src/lib/pdfMakeConfig.margins.test.ts
git commit -m "fix(reports): correct top-margin unit (pt not mm) (#12)"
```

---

## Task 6: Footer uses `clampPageNumbers` + kernel date (#4, #8)

**Files:**
- Modify: `src/lib/pdfMakeUtils.ts:451-492`
- Test: `src/lib/pdfMakeUtils.footer.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdfMakeUtils.footer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createPageFooter } from './pdfMakeUtils';

// The footer factory returns (currentPage, pageCount) => Content.
// The page-number text lives in columns[1].text.
function pageText(content: any): string {
  if (content && typeof content === 'object' && 'columns' in content) {
    return content.columns[1].text;
  }
  return ''; // skipped page returns { text: '' }
}

describe('createPageFooter', () => {
  it('skips the cover page (returns empty content)', () => {
    const footer = createPageFooter(true);
    expect(pageText(footer(1, 5))).toBe('');
  });
  it('numbers content pages correctly when skipping the cover', () => {
    const footer = createPageFooter(true);
    expect(pageText(footer(2, 5))).toBe('Page 1 of 4');
    expect(pageText(footer(5, 5))).toBe('Page 4 of 4');
  });
  it('never renders "Page 0 of 0"', () => {
    const footer = createPageFooter(true);
    // Defensive: a single-page doc with skip should not underflow.
    expect(pageText(footer(1, 1))).toBe(''); // page 1 is skipped
  });
  it('numbers every page when not skipping a cover', () => {
    const footer = createPageFooter(false);
    expect(pageText(footer(1, 3))).toBe('Page 1 of 3');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pdfMakeUtils.footer.test.ts`
Expected: FAIL — current footer computes `displayTotal = pageCount - 1` without clamping; assertions on exact text still pass for the happy path but the import/structure may differ. If all pass already, treat the underflow case as the guard we are adding and continue (the implementation below makes the intent explicit and locale-safe).

- [ ] **Step 3: Implement — clamp + kernel date**

In `src/lib/pdfMakeUtils.ts`, add the import near the top:

```ts
import { clampPageNumbers, formatDate } from './report/reportKernel';
```

Replace the footer body (lines 451-492) so the page math uses `clampPageNumbers` and the date uses the kernel:

```ts
export function createPageFooter(skipFirstPage = true): (currentPage: number, pageCount: number) => Content {
  const formattedDate = formatDate(new Date());

  return (currentPage: number, pageCount: number): Content => {
    if (skipFirstPage && currentPage === 1) {
      return { text: '' };
    }

    const { page: displayPage, total: displayTotal } = clampPageNumbers(currentPage, pageCount, skipFirstPage);

    return {
      columns: [
        {
          text: footers.confidentialityText,
          fontSize: 8,
          color: COLORS.textMuted,
          width: '*',
        },
        {
          text: `Page ${displayPage} of ${displayTotal}`,
          fontSize: 8,
          color: COLORS.textMuted,
          alignment: 'center',
          width: 80,
        },
        {
          text: formattedDate,
          fontSize: 8,
          color: COLORS.textMuted,
          alignment: 'right',
          width: '*',
        },
      ],
      margin: [mmToPt(margins.left), mmToPt(25), mmToPt(margins.right), 0],
    };
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/pdfMakeUtils.footer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdfMakeUtils.ts src/lib/pdfMakeUtils.footer.test.ts
git commit -m "fix(reports): clamp footer page numbers + kernel date (#4,#8)"
```

---

## Task 7: Compliance summary rows — guard percentages (#10, #8)

**Files:**
- Create: `src/lib/report/complianceRows.ts`
- Test: `src/lib/report/complianceRows.test.ts`
- Modify: `src/lib/complianceReportGenerator.ts:145-180`

- [ ] **Step 1: Write the failing test**

Create `src/lib/report/complianceRows.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildComplianceSummaryRows, type ComplianceStats } from './complianceRows';

const stats = (o: Partial<ComplianceStats> = {}): ComplianceStats => ({
  total: 0, compliant: 0, nonCompliant: 0, expiringSoon: 0, expired: 0, pendingReview: 0, ...o,
});

describe('buildComplianceSummaryRows', () => {
  it('computes rounded percentages for a normal dataset', () => {
    const rows = buildComplianceSummaryRows(stats({ total: 4, compliant: 1, nonCompliant: 3 }));
    const compliant = rows.find(r => r.metric === 'Compliant')!;
    expect(compliant.count).toBe(1);
    expect(compliant.percentage).toBe('25%');
  });
  it('never produces NaN% when total is 0', () => {
    const rows = buildComplianceSummaryRows(stats({ total: 0 }));
    for (const r of rows) {
      expect(r.percentage).not.toContain('NaN');
    }
    expect(rows.find(r => r.metric === 'Non-Compliant')!.percentage).toBe('0%');
  });
  it('always shows the Total Items row at 100% when there are items, 0% when none', () => {
    expect(buildComplianceSummaryRows(stats({ total: 4, compliant: 4 })).find(r => r.metric === 'Total Items')!.percentage).toBe('100%');
    expect(buildComplianceSummaryRows(stats({ total: 0 })).find(r => r.metric === 'Total Items')!.percentage).toBe('0%');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/report/complianceRows.test.ts`
Expected: FAIL — `Failed to resolve import "./complianceRows"`.

- [ ] **Step 3: Implement the pure row builder**

Create `src/lib/report/complianceRows.ts`:

```ts
import { percent } from './reportKernel';

export interface ComplianceStats {
  total: number;
  compliant: number;
  nonCompliant: number;
  expiringSoon: number;
  expired: number;
  pendingReview: number;
}

export interface ComplianceSummaryRow {
  metric: string;
  count: number;
  percentage: string;
}

/** Build the compliance summary table rows with divide-by-zero-safe percentages. */
export function buildComplianceSummaryRows(stats: ComplianceStats): ComplianceSummaryRow[] {
  const t = stats.total;
  return [
    { metric: 'Total Items', count: t, percentage: percent(t, t) },
    { metric: 'Compliant', count: stats.compliant, percentage: percent(stats.compliant, t) },
    { metric: 'Non-Compliant', count: stats.nonCompliant, percentage: percent(stats.nonCompliant, t) },
    { metric: 'Expiring Within 90 Days', count: stats.expiringSoon, percentage: percent(stats.expiringSoon, t) },
    { metric: 'Expired', count: stats.expired, percentage: percent(stats.expired, t) },
    { metric: 'Pending Review', count: stats.pendingReview, percentage: percent(stats.pendingReview, t) },
  ];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/report/complianceRows.test.ts`
Expected: PASS.

- [ ] **Step 5: Use the builder in the generator**

In `src/lib/complianceReportGenerator.ts`:

1. Add imports near the top:

```ts
import { buildComplianceSummaryRows } from './report/complianceRows';
import { formatDate } from './report/reportKernel';
```

2. Replace the inline summary-rows array (the six `{ metric, count, percentage }` objects at lines 149-156) with:

```ts
      buildComplianceSummaryRows(stats),
```

so the `createDataTable(...)` call passes `buildComplianceSummaryRows(stats)` as its data argument.

3. Replace the bare date at line 179:

```ts
      issueDate: formatDate(item.cocIssueDate),
```

- [ ] **Step 6: Run the full suite to verify nothing regressed**

Run: `npm test`
Expected: PASS (all suites).

- [ ] **Step 7: Commit**

```bash
git add src/lib/report/complianceRows.ts src/lib/report/complianceRows.test.ts src/lib/complianceReportGenerator.ts
git commit -m "fix(reports): guard compliance percentages + kernel date (#10,#8)"
```

---

## Task 8: Site-summary rows — remove the 20-row cap (#3, #8)

**Files:**
- Create: `src/lib/report/siteSummaryRows.ts`
- Test: `src/lib/report/siteSummaryRows.test.ts`
- Modify: `src/components/SiteSummaryReport.tsx:455-500`

- [ ] **Step 1: Write the failing test**

Create `src/lib/report/siteSummaryRows.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildCocValidationRows, buildInspectionRows } from './siteSummaryRows';

describe('buildCocValidationRows', () => {
  it('includes ALL rows — no 20-row cap', () => {
    const subs = Array.from({ length: 23 }, (_, i) => ({
      name: `Sub ${i}`, coc_number: `C${i}`, coc_status: 'Valid', coc_issue_date: '2026-06-13',
    }));
    expect(buildCocValidationRows(subs)).toHaveLength(23);
  });
  it('formats the issue date day-first and guards missing dates', () => {
    const rows = buildCocValidationRows([
      { name: 'A', coc_number: 'C1', coc_status: 'Valid', coc_issue_date: '2026-06-13' },
      { name: 'B', coc_number: null, coc_status: null, coc_issue_date: null },
    ]);
    expect(rows[0].date).toBe('13 June 2026');
    expect(rows[0].cocNumber).toBe('C1');
    expect(rows[1].date).toBe('—');
    expect(rows[1].cocNumber).toBe('-');
    expect(rows[1].status).toBe('Missing');
  });
});

describe('buildInspectionRows', () => {
  it('includes ALL rows — no 20-row cap', () => {
    const insp = Array.from({ length: 25 }, (_, i) => ({
      title: `T${i}`, status: 'Completed', inspector_name: 'Sam', inspection_date: '2026-06-13',
    }));
    expect(buildInspectionRows(insp)).toHaveLength(25);
  });
  it('guards missing fields', () => {
    const rows = buildInspectionRows([{ title: null, status: null, inspector_name: null, inspection_date: null }]);
    expect(rows[0].title).toBe('Untitled');
    expect(rows[0].status).toBe('Unknown');
    expect(rows[0].inspector).toBe('-');
    expect(rows[0].date).toBe('—');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/report/siteSummaryRows.test.ts`
Expected: FAIL — `Failed to resolve import "./siteSummaryRows"`.

- [ ] **Step 3: Implement the pure row builders**

Create `src/lib/report/siteSummaryRows.ts`:

```ts
import { formatDate } from './reportKernel';

export interface CocSubsectionInput {
  name?: string | null;
  coc_number?: string | null;
  coc_status?: string | null;
  coc_issue_date?: string | null;
}
export interface CocValidationRow {
  subsection: string;
  cocNumber: string;
  status: string;
  date: string;
}

export interface InspectionInput {
  title?: string | null;
  status?: string | null;
  inspector_name?: string | null;
  inspection_date?: string | null;
}
export interface InspectionRow {
  title: string;
  status: string;
  inspector: string;
  date: string;
}

/** All COC validation rows (no truncation), with guarded fields/date. */
export function buildCocValidationRows(subsections: CocSubsectionInput[]): CocValidationRow[] {
  return subsections.map(sub => ({
    subsection: sub.name || 'Unknown',
    cocNumber: sub.coc_number || '-',
    status: sub.coc_status || 'Missing',
    date: formatDate(sub.coc_issue_date),
  }));
}

/** All inspection rows (no truncation), with guarded fields/date. */
export function buildInspectionRows(inspections: InspectionInput[]): InspectionRow[] {
  return inspections.map(insp => ({
    title: insp.title || 'Untitled',
    status: insp.status || 'Unknown',
    inspector: insp.inspector_name || '-',
    date: formatDate(insp.inspection_date),
  }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/report/siteSummaryRows.test.ts`
Expected: PASS.

- [ ] **Step 5: Use the builders in the component**

In `src/components/SiteSummaryReport.tsx`:

1. Add the import near the top:

```ts
import { buildCocValidationRows, buildInspectionRows } from '@/lib/report/siteSummaryRows';
```

2. Replace the COC rows block at lines 464-469:

```ts
            const validationRows = buildCocValidationRows(cocSubsections);
```

3. Replace the inspection rows block at lines 491-496:

```ts
            const inspectionRows = buildInspectionRows(allInspections);
```

- [ ] **Step 6: Run the full suite + typecheck**

Run: `npm test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: No new type errors in the touched files.

- [ ] **Step 7: Commit**

```bash
git add src/lib/report/siteSummaryRows.ts src/lib/report/siteSummaryRows.test.ts src/components/SiteSummaryReport.tsx
git commit -m "fix(reports): remove silent 20-row cap in site summary (#3,#8)"
```

---

## Task 9: Phase 0 wrap-up — full suite + lint gate

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS — all suites including the new kernel/rows/footer/margin/filename tests.

- [ ] **Step 2: Lint the touched files**

Run: `npm run lint`
Expected: No new errors introduced by Phase 0 files.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: No new type errors.

- [ ] **Step 4: Confirm the four classic pdfmake reports still build (manual smoke)**

In the running app (`npm run dev`), generate: Site Summary, Compliance/COC, Asset Verification, Floor Plan. Confirm each downloads a non-empty PDF and dates render day-first (e.g. "13 June 2026"), with no "Invalid Date", "NaN%", or 20-row truncation.

- [ ] **Step 5: Open the Phase 0 PR**

```bash
git push -u origin feat/report-system-redesign
gh pr create --title "Report redesign Phase 0: kernel + formatting/pagination fixes" \
  --body "Phase 0 of the report-system redesign (see docs/superpowers/specs/2026-06-13-report-system-redesign-design.md). Adds the deterministic report kernel and roots out silent-formatting defects: #2 Invalid Date, #3 20-row cap, #4 footer page-math, #8 date-locale, #10 NaN%, #11 UTC filename, #12 margin unit. All locked with vitest tests."
```

---

## Self-Review

**Spec coverage (Phase 0 scope = #2,#3,#4(defensive),#8,#10,#11,#12 + test harness):**
- #2 Invalid Date → Task 1 (`formatDate` guard) + Task 3 (pdfBranding delegates). ✓
- #3 20-row cap → Task 8 (row builders, no slice). ✓
- #4 footer page-math (defensive) → Task 2 + Task 6. (The inspection cover-page wiring half of #4 is Phase 2.) ✓
- #8 date locale → Task 1 (deterministic kernel) applied in Tasks 3, 6, 7, 8. (UI/date-fns display dates deferred to Phase 6.) ✓
- #10 NaN% → Task 1 (`percent`) + Task 7. ✓
- #11 UTC filename → Task 1 (`localDateStamp`) + Task 4. ✓
- #12 margin unit → Task 5. ✓
- Test harness → kernel/rows/footer/margin/filename suites; full run in Task 9. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every run step shows the command + expected result. ✓

**Type consistency:** `formatDate`/`formatDateTime`/`localDateStamp`/`percent`/`clampPageNumbers` signatures are defined in Task 1/2 and used unchanged in Tasks 3,4,6,7,8. `ComplianceStats` fields match the generator's `stats` shape (`total/compliant/nonCompliant/expiringSoon/expired/pendingReview`, per `complianceReportGenerator.ts:152-155`). Row builder field names (`subsection/cocNumber/status/date`, `title/status/inspector/date`) match the existing `COC_VALIDATION_COLUMNS`/`INSPECTION_COLUMNS` field mapping in `SiteSummaryReport.tsx:464-496`. ✓

**Notes / risks for the implementer:**
- Verify `ComplianceStats` field names against `complianceReportGenerator.ts` `calculateStats` before Task 7 Step 5; adjust the interface if the source uses different keys.
- In Task 6 Step 2 the happy-path assertions may already pass; the value of the task is the clamp guard + locale-safe date — keep the test as the regression lock.
- `pdfBranding.ts` may already import from `./report/reportKernel` after Task 3 — avoid a duplicate import line.
