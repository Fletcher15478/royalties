/** Square Money object (amount in smallest currency unit). */
export type SquareMoney = { amount?: bigint | number | null } | null | undefined;

export function moneyToCents(m: SquareMoney): number {
  if (!m?.amount) return 0;
  const a = m.amount;
  return typeof a === "bigint" ? Number(a) : Number(a);
}

export function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}
