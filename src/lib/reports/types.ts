/** Prior-month GC reconciliation printed with some weekly royalty reports */
export type GiftCardPriorMonthReconciliation = {
  monthLabel: string;
  valueActivated: number;
  valueRedeemed: number;
  /** Dollar amount printed in “Less Commission (on $__.__ Sold)” */
  commissionOnSoldDollars: number | null;
  commissionAmount: number | null;
  loadFeesAmount: number | null;
  equalsAmount: number;
  amountDueToFranchisee?: number;
  amountDueToHQ?: number;
};
