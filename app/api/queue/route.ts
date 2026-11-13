// GET /api/queue → BOOKED loads for the sidebar (lib/tms caps pagination).
import { tms } from "../_lib/deps";

export interface QueueItem {
  shipmentId: string;
  customerId: string;
  lane: string;
  pickupDate: string | null;
  sell: number | null;
  mode: string | null;
  equipment: string | null;
  carrierId: string | null;
  buy: number | null;
  gpPct: number | null;
}

export async function GET(req: Request) {
  // ?status=COVERED lists loads that already have a carrier (read-only). Default: BOOKED loads waiting for one.
  const status = new URL(req.url).searchParams.get("status") === "COVERED" ? "COVERED" : "BOOKED";
  // TL only: LTL needs a PRO number and freight-line rating the agent does not handle.
  const r = await tms.listShipments<Record<string, unknown>>({ status, mode: "TL", limit: 50 });
  if (!r.ok) return Response.json(r, { status: r.status || 502 });
  const items = r.result.slice(0, 50).map(
    (s): QueueItem => ({
      shipmentId: String(s.shipment_id),
      customerId: String(s.customer_id),
      lane: `${s.shipper_city}, ${s.shipper_state} → ${s.consignee_city}, ${s.consignee_state}`,
      pickupDate: (s.pickup_date as string) ?? null,
      sell: (s.sell_total as number) ?? null,
      mode: (s.mode as string) ?? null,
      equipment: (s.equipment_type as string) ?? null,
      carrierId: (s.carrier_id as string) ?? null,
      buy: (s.buy_total as number) ?? null,
      gpPct: (s.gp_pct as number) ?? null,
    }),
  );
  return Response.json({ ok: true, items });
}
