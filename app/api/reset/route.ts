// POST /api/reset { shipmentId? } → put the hero load back to BOOKED for a re-demo (PRD §9.8).
// Mirrors scripts/reset.ts (Akshaya) so the UI can trigger it. Requires TMS_WRITES=1.
import { tms, writesEnabled } from "../_lib/deps";
import { findHeroId } from "../_lib/hero";

type Cost = { cost_id: string; charge_code: string; status: string; vendor_id?: string | null };

export async function POST(req: Request) {
  if (!writesEnabled()) {
    return Response.json({ ok: false, error: "writes_disabled", detail: "Set TMS_WRITES=1 in .env.local to allow reset." }, { status: 409 });
  }
  const body = (await req.json().catch(() => ({}))) as { shipmentId?: string };
  const id = body.shipmentId?.trim() || (await findHeroId());
  const steps: unknown[] = [];

  const before = await tms.getShipment(id);
  if (!before.ok) return Response.json(before, { status: before.status || 502 });
  const status = (before.data as { status?: string }).status;

  if (status === "COVERED" || status === "DISPATCHED") {
    const r = await tms.uncover(id, { reason: "OTHER", note: "demo reset" });
    steps.push({ uncover: r.ok ? "ok" : r });
  }

  // Cancel FSC / LUM lines the agent added (uncover only cancels the removed carrier's lines).
  const after = await tms.getShipment(id);
  const costs = after.ok ? (((after.data as { vendor_costs?: Cost[] }).vendor_costs) ?? []) : [];
  for (const c of costs.slice(0, 20)) {
    if ((c.charge_code === "FSC" || c.charge_code === "LUM") && c.vendor_id && c.status !== "CANCELLED") {
      const r = await tms.updateCost(id, c.cost_id, { status: "CANCELLED" });
      steps.push({ cancel: c.cost_id, ok: r.ok });
    }
  }

  // Delivery appointment back to NEEDED.
  const r = await tms.setAppointment(id, 2, { status: "NEEDED" });
  steps.push({ appointment: r.ok ? "NEEDED" : r });

  const final = await tms.getShipment(id);
  return Response.json({ ok: true, shipmentId: id, status: final.ok ? (final.data as { status?: string }).status : null, steps });
}
