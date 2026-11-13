// GET /api/brief?shipmentId=… → the LoadBrief for one load, read-only (no TMS writes, no model call).
// Lets the UI show carriers and their compliance before the agent runs.
import { deps } from "../_lib/deps";

export async function GET(req: Request) {
  const shipmentId = new URL(req.url).searchParams.get("shipmentId")?.trim();
  if (!shipmentId) return Response.json({ ok: false, error: "bad_request", detail: "shipmentId is required." }, { status: 400 });
  const r = await deps.loadBrief(shipmentId);
  if (!r.ok) return Response.json({ ok: false, error: r.error, detail: typeof r.detail === "string" ? r.detail : "TMS could not provide the load brief." }, { status: r.status || 502 });
  return Response.json({ ok: true, brief: r.result });
}
