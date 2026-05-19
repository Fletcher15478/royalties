export type ThirdPartyDeliveryPlatform = "doordash" | "uber_eats" | "grubhub" | "unknown";

/** Per-order royalty math breakdown (amounts in USD unless noted). */
export type DeliveryOrderRoyaltyBreakdown = {
  orderId: string;
  locationId: string;
  platform: ThirdPartyDeliveryPlatform;
  sourceName: string | null;
  closedAt: string | null;
  /** Sum of merchandise line gross (excludes gift cards). */
  grossSales: number;
  returns: number;
  /** Marketplace / promo discounts that reduce royalty-eligible revenue. */
  marketingDiscounts: number;
  /** Other order/line discounts (non-marketing). */
  otherDiscounts: number;
  /** Refunds on the order object (APPROVED/COMPLETED). */
  refundsOnOrder: number;
  /** Extra refunds matched via Refunds API + payment_id on tenders. */
  refundsFromPaymentsApi: number;
  /** Marketplace / platform fee (DoorDash, Uber, Grubhub commission from service_charges). */
  platformFee: number;
  /** gross − returns − marketing − otherDiscounts − refunds − platformFee (floored at 0). */
  netRoyaltyEligible: number;
};

export type DeliveryWeekTotals = {
  orderCount: number;
  grossSales: number;
  returns: number;
  marketingDiscounts: number;
  otherDiscounts: number;
  refunds: number;
  platformFees: number;
  netRoyaltyEligible: number;
  byPlatform: Record<
    ThirdPartyDeliveryPlatform,
    { count: number; netRoyaltyEligible: number; platformFees: number }
  >;
};

export type DeliveryLocationSyncSummary = {
  locationId: string;
  startAt: string;
  endAt: string;
  ordersProcessed: number;
  deliveryOrders: number;
  totalNetRoyaltyEligible: number;
  byPlatform: Record<ThirdPartyDeliveryPlatform, { count: number; netRoyaltyEligible: number }>;
};

export type DeliveryRoyaltyRecord = DeliveryOrderRoyaltyBreakdown & {
  weekStartYmd: string;
  updatedAt: string;
  squareOrderVersion?: number;
};
