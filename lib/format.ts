/** Compact USD formatter with a real minus sign for negatives. */
export function formatUsd(usd: number): string {
  const sign = usd < 0 ? "−" : "";
  const a = Math.abs(usd);
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(1)}k`;
  return `${sign}$${a.toFixed(0)}`;
}
