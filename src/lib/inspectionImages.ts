/**
 * Inspection image detection — single source of truth.
 *
 * "Has this inspection been populated?" is answered by whether its json_data carries any
 * photos. Mirrors exactly what the Reports tab (BulkInspectionReportGenerator) counts:
 * section items' photos[] arrays plus tenant meter/breaker/ctRatio images. Pure, no I/O.
 */
export function countInspectionPhotos(jsonData: unknown): number {
  if (!jsonData || typeof jsonData !== 'object') return 0;
  let count = 0;
  for (const [key, section] of Object.entries(jsonData as Record<string, any>)) {
    if (key === 'tenants' && Array.isArray(section)) {
      for (const tenant of section) {
        if (tenant?.meterImage) count++;
        if (tenant?.breakerImage) count++;
        if (tenant?.ctRatioImage) count++;
      }
    } else if (typeof section === 'object' && section !== null && key !== 'generalInfo') {
      for (const item of Object.values(section)) {
        if (Array.isArray((item as any)?.photos)) {
          count += (item as any).photos.length;
        }
      }
    }
  }
  return count;
}

export function inspectionHasImages(
  inspection: { json_data?: unknown } | null | undefined,
): boolean {
  return countInspectionPhotos(inspection?.json_data) > 0;
}
