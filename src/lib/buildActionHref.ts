/**
 * Pure: turns a deliverables OutstandingItem into a deep-link URL (query-param contract).
 * Destination pages read these params (tab, upload, generate, focus, create, snag) to land the
 * user on the exact tab/subsection with the right dialog open / input focused. See
 * docs/superpowers/specs/2026-06-13-site-compliance-checklist-design.md.
 */
import type { OutstandingItem } from './siteDeliverables';

export interface ActionHrefContext {
  clientId: string;
  siteId: string;
}

export function buildActionHref(item: OutstandingItem, ctx: ActionHrefContext): string {
  const base = `/clients/${ctx.clientId}/sites/${ctx.siteId}`;
  const sub = item.subsectionId ? `${base}/subsections/${item.subsectionId}` : null;
  switch (item.category) {
    case 'schematic':       return `${base}?tab=schematic`;
    case 'asset_register':  return `${base}?tab=asset-verification`;
    case 'thermal':         return `${base}?tab=documents&upload=thermal`;
    case 'summary_report':  return `${base}?tab=reports&generate=1`;
    case 'coc':             return sub ? `${sub}?tab=coc-metering&focus=coc` : `${base}?tab=subsections`;
    case 'metering':        return sub ? `${sub}?tab=coc-metering&focus=meter` : `${base}?tab=subsections`;
    case 'inspections':     return sub ? `${sub}?tab=inspections&create=1` : `${base}?tab=subsections`;
    case 'snags':           return sub ? `${sub}?tab=overview&snag=${item.id}` : `${base}?tab=subsections`;
    default: {
      const _exhaustive: never = item.category; // compile-time guard: a new DeliverableKey must be handled above
      void _exhaustive;
      return `${base}?tab=overview`;
    }
  }
}
