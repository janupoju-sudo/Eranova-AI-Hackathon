// GET /api/queue → BOOKED loads for the sidebar (one page, max 50 — no uncapped loops).
import { tms } from "../_lib/deps";

export interface QueueItem {
  shipmentId: string;
  customerId: string;
  lane: string;
  pickupDate: string | null;
  sell: number | null;
  mode: string | null;
  equipment: string | null;
}

export async function GET() {
  const r = await tms.listShipments({ status: "BOOKED", limit: "50" });
  if (!r.ok) return Response.json(r, { status: r.status || 502 });
  const items = ((r.data as { items?: Record<string, unknown>[] }).items ?? []).map(
    (s): QueueItem => ({
      shipmentId: String(s.shipment_id),
      customerId: String(s.customer_id),
      lane: `${s.shipper_city}, ${s.shipper_state} → ${s.consignee_city}, ${s.consignee_state}`,
      pickupDate: (s.pickup_date as string) ?? null,
      sell: (s.sell_total as number) ?? null,
      mode: (s.mode as string) ?? null,
      equipment: (s.equipment_type as string) ?? null,
    }),
  );
  return Response.json({ ok: true, items });
}
