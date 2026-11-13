import { tms } from "./deps";

const HERO_FALLBACK = "7300176";

/** Find the hero load by details, not ID (PRD §5): NORTHSTAR, Chicago → Dallas, BOOKED. */
export async function findHeroId(): Promise<string> {
  const r = await tms.listShipments<Record<string, unknown>>({ status: "BOOKED", customer: "NORTHSTAR", limit: 50 });
  if (!r.ok) return HERO_FALLBACK;
  const items = r.result;
  const hit = items.find(
    (s) => String(s.shipper_city).toUpperCase() === "CHICAGO" && String(s.consignee_city).toUpperCase() === "DALLAS",
  );
  return (hit?.shipment_id as string) ?? HERO_FALLBACK;
}
