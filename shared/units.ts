export type UnitSystem = "metric" | "imperial";
const KG_PER_LB = 0.45359237;
export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const mlToFlOz = (ml: number) => ml / 29.5735295625;

export function formatWeight(kg: number, system: UnitSystem): string {
  return system === "metric" ? `${kg.toFixed(1)} kg` : `${kgToLb(kg).toFixed(1)} lb`;
}
export function formatVolume(ml: number, system: UnitSystem): string {
  return system === "metric" ? `${(ml / 1000).toFixed(1)} L` : `${mlToFlOz(ml).toFixed(0)} fl oz`;
}
