export function dollars(n: number, maximumFractionDigits = 0) {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
  });
}

export function pct(n: number | null, digits = 1) {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

export function pctMix(part: number, total: number) {
  if (total <= 0) return "—";
  return `${((part / total) * 100).toFixed(1)}%`;
}
