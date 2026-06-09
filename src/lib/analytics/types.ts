export type LocationSalesSnapshot = {
  locationId: string;
  ordersCount: number;
  grossSales: number;
  discounts: number;
  refunds: number;
  netSales: number;
};

export type ItemAggregate = {
  name: string;
  qty: number;
  revenue: number;
  grossRevenue: number;
};

export type FlavorAggregate = {
  name: string;
  units: number;
  revenue: number;
};

export type LocationProductMetrics = {
  topFlavor: FlavorAggregate | null;
  topItem: ItemAggregate | null;
  flavors: FlavorAggregate[];
  items: ItemAggregate[];
  shopNetSales: number;
};

export type LocationPerformanceRow = {
  locationId: string;
  locationName: string;
  grossSales: number;
  netSales: number;
  priorWeekNet: number;
  priorYearNet: number;
  wowPct: number | null;
  yoyPct: number | null;
  healthScore: number;
  healthLabel: "At Risk" | "Stable" | "Strong" | "High Performer";
  topFlavor: FlavorAggregate | null;
  topItem: ItemAggregate | null;
  topFlavorWowPct: number | null;
  topFlavorMixPct: number | null;
  topItemMixPct: number | null;
  consecutiveDeclines: number;
};

export type FlavorRankingRow = {
  rank: number;
  name: string;
  units: number;
  revenue: number;
  priorWeekUnits: number;
  unitWowPct: number | null;
};

export type FlavorMover = {
  name: string;
  currentUnits: number;
  priorUnits: number;
  unitChange: number;
  unitWowPct: number | null;
};

export type ExecutiveInsight = {
  kind:
    | "highest_gross"
    | "wow_growth"
    | "wow_decline"
    | "yoy_growth"
    | "yoy_decline"
    | "consecutive_decline"
    | "above_avg"
    | "below_avg";
  title: string;
  detail: string;
};

export type CompanyOverview = {
  totalGross: number;
  totalNet: number;
  wowPct: number | null;
  yoyPct: number | null;
  locationsUpWow: number;
  locationsDownWow: number;
  locationsFlatWow: number;
  locationsUpYoy: number;
  locationsDownYoy: number;
  locationsFlatYoy: number;
};

export type TrendWeek = {
  weekStartYmd: string;
  weekLabel: string;
  grossSales: number;
  netSales: number;
  byLocation: Record<string, { grossSales: number; netSales: number }>;
  topFlavorUnits: Record<string, number>;
};

export type WeeklyPerformanceDashboard = {
  weekStartYmd: string;
  weekLabel: string;
  generatedAt: string;
  company: CompanyOverview;
  insights: ExecutiveInsight[];
  locations: LocationPerformanceRow[];
  flavorTop10: FlavorRankingRow[];
  flavorGainers: FlavorMover[];
  flavorDecliners: FlavorMover[];
  trends: TrendWeek[];
  topFlavorName: string | null;
};
