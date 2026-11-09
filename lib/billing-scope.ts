import type { Demo } from "./demo.ts";
export type BillingScope = "period" | "selected" | "individual";
export function scopedUnitIds(state: Demo, scope: BillingScope, selected: string[], individual: string) {
  const ids = scope === "period" ? state.units.map(unit => unit.id) : scope === "selected" ? [...new Set(selected)] : scope === "individual" ? [individual] : [];
  if (!ids.length || ids.some(id => !state.units.some(unit => unit.id === id))) throw new Error("Pilih minimal satu unit yang valid untuk cakupan tagihan.");
  return ids;
}
