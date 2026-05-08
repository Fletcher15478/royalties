export type MilliesLocation = {
  id: string; // Square location id
  name: string;
  flatFeeCents: number;
  includeInRoyaltiesDashboard?: boolean;
};

// Source: provided by Millie’s team (internal list).
export const MILLIES_LOCATIONS: MilliesLocation[] = [
  { name: "Millie's Ice Cream Works (Main)", id: "LH5C3MJ9PP80V", flatFeeCents: 5499, includeInRoyaltiesDashboard: false },
  { name: "Shadyside", id: "L4EY6CN442VGB", flatFeeCents: 5814, includeInRoyaltiesDashboard: false },
  { name: "Market Square", id: "L09KC5S41GQRP", flatFeeCents: 5814 },
  { name: "Lawrenceville", id: "LRVZG0XCQPASB", flatFeeCents: 5814 },
  { name: "Pitt Campus", id: "L0TVX3TZ9XSMP", flatFeeCents: 5499, includeInRoyaltiesDashboard: false },
  { name: "South Fayette", id: "LZGJ6T9JYFG7W", flatFeeCents: 5814 },
  { name: "Wexford", id: "L11ZX0KPXGFJH", flatFeeCents: 5814, includeInRoyaltiesDashboard: false },
  { name: "Duquesne University", id: "LCK8B6PZJ8Z85", flatFeeCents: 5499, includeInRoyaltiesDashboard: false },
  { name: "Cranberry", id: "LEAVYE5AMZF06", flatFeeCents: 5814 },
  { name: "CMU", id: "LR2W2EN4Z6A09", flatFeeCents: 5499, includeInRoyaltiesDashboard: false },
  { name: "Kennywood", id: "LH5JR54RVPPA9", flatFeeCents: 5499, includeInRoyaltiesDashboard: false },
  { name: "Truck WC", id: "LGHK54YYZZCNA", flatFeeCents: 5814 },
  { name: "Oakland", id: "LWE92DR7GY9N4", flatFeeCents: 5814 },
  { name: "Tiny Van", id: "LJDR9RFPDTZX3", flatFeeCents: 5814 },
  { name: "Truck PGH", id: "LWW1CFV8T5DTF", flatFeeCents: 5814 },
  { name: "Murrysville", id: "LF70VBZ7CDMHE", flatFeeCents: 5814 },
  { name: "North Park", id: "LK15PMM2F5SGB", flatFeeCents: 5499, includeInRoyaltiesDashboard: false },
  { name: "Ponte Vedra", id: "LQQKGMSGV8V1M", flatFeeCents: 5814 },
  { name: "Truck JAX", id: "L2P2FKMPD9WZ8", flatFeeCents: 5814 },
  { name: "Greensburg", id: "LK5H7DE78S097", flatFeeCents: 5814 },
  { name: "San Marco", id: "LNS0D59DSEW9J", flatFeeCents: 5814 },
  { name: "Ross Park Mall", id: "LB2AP0R5E1H40", flatFeeCents: 5499, includeInRoyaltiesDashboard: false },
  { name: "Ross Park Mall Shop", id: "LBMQ3FAKM6PH2", flatFeeCents: 5814, includeInRoyaltiesDashboard: false },
  { name: "Giant Eagle - The Meridian", id: "LHK34R2VTWF87", flatFeeCents: 5814, includeInRoyaltiesDashboard: false },
  { name: "Franchising - Homestead Office", id: "LHSJEKAJZ9YC3", flatFeeCents: 5499, includeInRoyaltiesDashboard: false },
  { name: "Lubbock", id: "L9WPKVJZFGZS4", flatFeeCents: 5499 },
];

