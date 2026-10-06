// Fortress Marking Checklist: template + saved rows → report data. Shared by the checklist tab
// (FortressMarkingChecklist.tsx) and the site "All reports" runner so both produce the same PDF.
import { generateFortressTemplate } from "@/lib/fortressTemplate";
import type { FortressChecklistData } from "@/lib/fortressChecklistReportGenerator";

export interface FortressChecklistItem {
  id: string;
  item_id: string;
  item_name: string;
  section_name: string;
  is_checked: boolean;
  checked_at: string | null;
  notes: string | null;
  status: "pending" | "completed" | "not_applicable";
}

export interface FortressChecklistRow {
  id: string;
  item_id: string;
  is_checked: boolean | null;
  checked_at: string | null;
  notes: string | null;
  status: string | null;
}

/** Every template checkbox, overlaid with the site's saved state (unsaved items are pending). */
export function mergeFortressChecklist(rows: FortressChecklistRow[]): FortressChecklistItem[] {
  const items: FortressChecklistItem[] = [];
  for (const section of generateFortressTemplate().sections) {
    for (const item of section.items) {
      if (item.type !== "checkbox") continue;
      const saved = rows.find((r) => r.item_id === item.id);
      items.push({
        id: saved?.id || "",
        item_id: item.id,
        item_name: item.name,
        section_name: section.name,
        is_checked: saved?.is_checked || false,
        checked_at: saved?.checked_at || null,
        notes: saved?.notes || null,
        status: (saved?.status as FortressChecklistItem["status"]) || "pending",
      });
    }
  }
  return items;
}

export function buildFortressChecklistData(
  { siteId, siteName, items }: { siteId: string; siteName?: string; items: FortressChecklistItem[] },
): FortressChecklistData {
  const applicable = items.filter((i) => i.status !== "not_applicable");
  const checked = applicable.filter((i) => i.is_checked).length;
  const notApplicable = items.length - applicable.length;

  const bySection = new Map<string, FortressChecklistItem[]>();
  for (const item of items) {
    const list = bySection.get(item.section_name) ?? [];
    list.push(item);
    bySection.set(item.section_name, list);
  }

  const sections = [...bySection.entries()].map(([name, sectionItems]) => {
    const sectionApplicable = sectionItems.filter((i) => i.status !== "not_applicable");
    const sectionChecked = sectionApplicable.filter((i) => i.is_checked).length;
    return {
      name,
      progress: sectionApplicable.length > 0 ? Math.round((sectionChecked / sectionApplicable.length) * 100) : 0,
      items: sectionItems.map((item) => ({
        id: item.item_id,
        label: item.item_name,
        isChecked: item.is_checked,
        isNotApplicable: item.status === "not_applicable",
        checkedAt: item.checked_at || undefined,
      })),
    };
  });

  return {
    title: "Fortress Site Close-Out Checklist",
    siteName: siteName || "Site",
    siteId,
    overallProgress: applicable.length > 0 ? Math.round((checked / applicable.length) * 100) : 0,
    sections,
    stats: {
      completed: checked,
      pending: applicable.length - checked,
      notApplicable,
      total: applicable.length,
    },
    generatedAt: new Date().toISOString(),
  };
}
