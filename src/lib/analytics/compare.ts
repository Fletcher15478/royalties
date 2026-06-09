/** Week-over-week or year-over-year percent change. */
export function pctChange(current: number, prior: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(prior)) return null;
  if (prior === 0) return current === 0 ? 0 : null;
  return ((current - prior) / prior) * 100;
}

export function growthTone(pct: number | null, flatThreshold = 0.5): "up" | "down" | "flat" {
  if (pct == null || !Number.isFinite(pct)) return "flat";
  if (pct > flatThreshold) return "up";
  if (pct < -flatThreshold) return "down";
  return "flat";
}
