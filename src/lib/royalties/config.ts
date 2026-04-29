export type RoyaltyConfig = {
  owner: string;
  entity: string;
  royaltyRate: number; // e.g. 0.05
  techFee: number; // flat fee in USD
};

// Location id -> config
// Based on the structure you provided.
export const ROYALTY_CONFIG_BY_LOCATION_ID: Record<string, RoyaltyConfig> = {
  // Kayleigh Lucas — Frosty Flamingo LLC
  LZGJ6T9JYFG7W: { owner: "Kayleigh Lucas", entity: "Frosty Flamingo LLC", royaltyRate: 0.05, techFee: 250 }, // South Fayette
  LWW1CFV8T5DTF: { owner: "Kayleigh Lucas", entity: "Frosty Flamingo LLC", royaltyRate: 0.05, techFee: 95 }, // Truck PGH

  // Jason Horowitz — JACO Builders LLC
  LRVZG0XCQPASB: { owner: "Jason Horowitz", entity: "JACO Builders LLC", royaltyRate: 0.05, techFee: 250 }, // Lawrenceville
  LJDR9RFPDTZX3: { owner: "Jason Horowitz", entity: "JACO Builders LLC", royaltyRate: 0.05, techFee: 95 }, // Tiny Van

  // Amanda Sheaffer & Steven Bruzzese — TeenBean LLC
  LWE92DR7GY9N4: { owner: "Amanda Sheaffer & Steven Bruzzese", entity: "TeenBean LLC", royaltyRate: 0.05, techFee: 250 }, // Oakland

  // Amanda Sheaffer & Steven Bruzzese — IceTeen Corp
  LR2W2EN4Z6A09: { owner: "Amanda Sheaffer & Steven Bruzzese", entity: "IceTeen Corp", royaltyRate: 0.03, techFee: 250 }, // CMU — 3%; tech fee matches official worksheets

  // Blair & Michelle Sharpe — Sunset Scoops LLC
  LQQKGMSGV8V1M: { owner: "Blair & Michelle Sharpe", entity: "Sunset Scoops LLC", royaltyRate: 0.05, techFee: 250 }, // Ponte Vedra
  L2P2FKMPD9WZ8: { owner: "Blair & Michelle Sharpe", entity: "Sunset Scoops LLC", royaltyRate: 0.05, techFee: 95 }, // Truck JAX

  // Blair & Michelle Sharpe — Sandy Spoons LLC
  LNS0D59DSEW9J: { owner: "Blair & Michelle Sharpe", entity: "Sandy Spoons LLC", royaltyRate: 0.05, techFee: 250 }, // San Marco

  // Sami & Kasey Toivola — Happy Penguin, LLC
  L9WPKVJZFGZS4: { owner: "Sami & Kasey Toivola", entity: "Happy Penguin, LLC", royaltyRate: 0.055, techFee: 250 }, // Lubbock

  // HHT Frozen Holdings LLC
  LF70VBZ7CDMHE: { owner: "HHT Frozen Holdings LLC", entity: "HHT Frozen Holdings LLC", royaltyRate: 0.05, techFee: 250 }, // Murrysville
  LK5H7DE78S097: { owner: "HHT Frozen Holdings LLC", entity: "HHT Frozen Holdings LLC", royaltyRate: 0.05, techFee: 250 }, // Greensburg
  L09KC5S41GQRP: { owner: "HHT Frozen Holdings LLC", entity: "HHT Frozen Holdings LLC", royaltyRate: 0.05, techFee: 250 }, // Market Square
  LEAVYE5AMZF06: { owner: "HHT Frozen Holdings LLC", entity: "HHT Frozen Holdings LLC", royaltyRate: 0.05, techFee: 250 }, // Cranberry

  // Truck WC (rate confirmed as 5%)
  LGHK54YYZZCNA: { owner: "HHT Frozen Holdings LLC", entity: "HHT Frozen Holdings LLC", royaltyRate: 0.05, techFee: 95 }, // Truck WC
};

