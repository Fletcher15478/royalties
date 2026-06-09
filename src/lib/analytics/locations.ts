import { MILLIES_LOCATIONS, type MilliesLocation } from "@/lib/locations/millies";

/** Non-retail / admin Square locations excluded from executive analytics. */
const ANALYTICS_EXCLUDED_IDS = new Set([
  "LHSJEKAJZ9YC3", // Franchising - Homestead Office
]);

/**
 * Retail Millie's locations for the executive sales dashboard.
 * Uses the shared location registry without royalty dashboard filters.
 */
export function getAnalyticsLocations(): MilliesLocation[] {
  return MILLIES_LOCATIONS.filter((l) => !ANALYTICS_EXCLUDED_IDS.has(l.id));
}

export function analyticsLocationName(locationId: string, fallback?: string): string {
  const loc = MILLIES_LOCATIONS.find((l) => l.id === locationId);
  return loc?.name ?? fallback ?? locationId;
}
