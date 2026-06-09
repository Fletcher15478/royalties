import { MILLIES_LOCATIONS, type MilliesLocation } from "@/lib/locations/millies";

/** Corporate shops on the Monday leadership spreadsheet (not on the royalties dashboard). */
const EXECUTIVE_CORPORATE_LOCATION_IDS = new Set([
  "L4EY6CN442VGB", // Shadyside
  "LHK34R2VTWF87", // Giant Eagle - The Meridian
]);

/**
 * Locations on the Monday leadership spreadsheet.
 * Royalties-dashboard franchises/trucks plus corporate Shadyside and GE Meridian.
 */
export function getAnalyticsLocations(): MilliesLocation[] {
  return MILLIES_LOCATIONS.filter(
    (l) => l.includeInRoyaltiesDashboard !== false || EXECUTIVE_CORPORATE_LOCATION_IDS.has(l.id)
  );
}

export function analyticsLocationName(locationId: string, fallback?: string): string {
  const loc = MILLIES_LOCATIONS.find((l) => l.id === locationId);
  return loc?.name ?? fallback ?? locationId;
}
