// Peso amounts as the register types and offers them.

/** What a typed amount means: digits and a decimal point, to the centavo (anything else is ignored). */
export const parseAmount = (s: string) => {
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

export const roundPeso = (n: number) => Math.round(n * 100) / 100;

/** Bills a customer is likely to hand over, above the total. */
export function quickAmounts(total: number) {
  const steps = [100, 500, 1000].map((s) => Math.ceil(total / s) * s);
  return [...new Set(steps)].filter((a) => a > total).slice(0, 3);
}
