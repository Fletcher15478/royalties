import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { ROYALTY_CONFIG_BY_LOCATION_ID } from "@/lib/royalties/config";

export type RoyaltyLine = {
  royaltyRate?: number;
  techFee?: number;
  techFeeAssessed?: boolean;
  royaltyAmount?: number;
  totalDue?: number;
  royaltyBase?: number;
  owner?: string;
  entity?: string;
  configured: boolean;
};

/** Monday yyyy-MM-dd in America/New_York — true if any calendar day in [Mon,Sun] is the 1st. */
export function isMonthlyTechFeeAssessedEt(weekMondayYmdEt: string, timeZone = "America/New_York"): boolean {
  const [y, m, d] = weekMondayYmdEt.split("-").map(Number);
  const noonEt = fromZonedTime(new Date(y, m - 1, d, 12, 0, 0), timeZone);
  for (let i = 0; i < 7; i++) {
    const day = addDays(noonEt, i);
    if (formatInTimeZone(day, timeZone, "d") === "1") return true;
  }
  return false;
}

export function computeRoyalties(
  locationId: string,
  netSales: number,
  opts?: { excludeDeliveryNetSales?: number; weekStartYmd?: string; weekEndYmd?: string; techFeeCadence?: "weekly" | "monthly" }
): RoyaltyLine {
  const cfg = ROYALTY_CONFIG_BY_LOCATION_ID[locationId];
  if (!cfg) {
    return { configured: false };
  }

  const deliveryNet = opts?.excludeDeliveryNetSales ?? 0;
  const royaltyBase = Math.max(0, netSales - deliveryNet);
  const royaltyAmount = royaltyBase * cfg.royaltyRate;

  const cadence = opts?.techFeeCadence ?? "weekly";
  const assess =
    cadence === "weekly"
      ? true
      : Boolean(opts?.weekStartYmd && isMonthlyTechFeeAssessedEt(opts.weekStartYmd));

  const techFee = assess ? cfg.techFee : 0;
  const totalDue = royaltyAmount + techFee;

  return {
    configured: true,
    royaltyRate: cfg.royaltyRate,
    techFee,
    techFeeAssessed: assess,
    royaltyAmount,
    totalDue,
    royaltyBase,
    owner: cfg.owner,
    entity: cfg.entity,
  };
}

