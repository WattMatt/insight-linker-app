import { isCocCertificateCategory, normalizeCocType } from "@/lib/cocHierarchy";
import type { Tone } from "@/lib/siteCoc/statusDisplay";

export interface ClientCocSubsection {
  id: string;
  name: string;
  tenant_name: string | null;
  is_coc_required: boolean | null;
  coc_status: string | null; // 'Pass' | 'Pending' | 'Missing' | 'Fail' | 'N/A' | null
  coc_expiry_date: string | null; // ISO yyyy-mm-dd
}

export interface ClientCocDoc {
  subsection_id: string | null;
  file_name: string;
  file_url: string;
  coc_type: string | null;
  category_name: string | null; // from document_categories(name)
}

export interface ClientCocRow {
  subsectionId: string;
  name: string; // includes tenant in parentheses when present
  cocRequired: boolean;
  statusLabel: string;
  tone: Tone;
  expiry: string | null;
  viewUrl: string | null;
  viewName: string | null;
}

export function cocStatusTone(status: string | null | undefined, required: boolean): Tone {
  if (!required) return "slate";
  const s = (status ?? "").toLowerCase();
  if (s === "pass") return "green";
  if (s === "fail") return "red";
  if (s === "missing") return "amber";
  if (s === "pending") return "amber";
  if (s === "n/a") return "slate";
  return "amber"; // required but unknown/blank → needs attention
}

export function cocStatusLabel(status: string | null | undefined, required: boolean): string {
  if (!required) return "Not required";
  const s = (status ?? "").trim();
  return s || "Pending";
}

export function buildClientCocSummary(
  subsections: ClientCocSubsection[],
  cocDocs: ClientCocDoc[],
): ClientCocRow[] {
  const bySub = new Map<string, ClientCocDoc[]>();
  for (const d of cocDocs) {
    if (!d.subsection_id) continue;
    if (!isCocCertificateCategory(d.category_name ?? "")) continue;
    const arr = bySub.get(d.subsection_id) ?? [];
    arr.push(d);
    bySub.set(d.subsection_id, arr);
  }

  return subsections.map((sub) => {
    const required = !!sub.is_coc_required;
    const docs = bySub.get(sub.id) ?? [];
    const initial = docs.find((d) => normalizeCocType(d.coc_type) === "Initial") ?? docs[0] ?? null;
    return {
      subsectionId: sub.id,
      name: sub.tenant_name ? `${sub.name} (${sub.tenant_name})` : sub.name,
      cocRequired: required,
      statusLabel: cocStatusLabel(sub.coc_status, required),
      tone: cocStatusTone(sub.coc_status, required),
      expiry: required ? sub.coc_expiry_date : null,
      viewUrl: initial ? initial.file_url : null,
      viewName: initial ? initial.file_name : null,
    };
  });
}
