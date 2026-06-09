import { MILLIES_LOCATIONS, type MilliesLocation } from "@/lib/locations/millies";

/**
 * Active franchise retail locations for executive analytics.
 * Matches the royalties dashboard set — excludes Main, campus kiosks, mall shops, and admin offices.
 */
export function getAnalyticsLocations(): MilliesLocation[] {
  return MILLIES_LOCATIONS.filter((l) => l.includeInRoyaltiesDashboard !== false);
}

export function analyticsLocationName(locationId: string, fallback?: string): string {
  const loc = MILLIES_LOCATIONS.find((l) => l.id === locationId);
  return loc?.name ?? fallback ?? locationId;
}
