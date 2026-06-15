/**
 * Single source of truth for "does this inspection template have a Tenants tab/section".
 *
 * Tenants are an Electrical Main Board (EMB) concept only — shop/circuit tenant
 * details hang off a main board. Every other template type (Generator, Medium
 * Voltage, Solar, Progress, etc.) must NOT collect or render tenant data.
 *
 * Used by the template editor, the inspection runtime, and the report renderers
 * so all three agree. Previously each surface string-matched the template name
 * with its own (contradictory) rule, which leaked the Tenants tab onto non-EMB
 * inspections.
 */
export function templateSupportsTenants(
  template: { name?: string | null } | null | undefined,
): boolean {
  return (template?.name ?? "").toLowerCase().includes("main board");
}
