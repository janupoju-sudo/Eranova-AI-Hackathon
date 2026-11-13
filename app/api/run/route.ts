// POST /api/run { shipmentId? } → NDJSON stream of AgentEvent. Defaults to the hero load.
import { startRun } from "@/lib/agent";
import { deps, writesEnabled } from "../_lib/deps";
import { findHeroId } from "../_lib/hero";
import { ndjsonStream } from "../_lib/ndjson";

export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { shipmentId?: string };
  const shipmentId = body.shipmentId?.trim() || (await findHeroId());
  return ndjsonStream(async (emit) => {
    emit({ type: "thought", text: `Starting coverage run for shipment ${shipmentId}${writesEnabled() ? "" : " (TMS writes OFF — dry run)"}.` });
    await startRun(shipmentId, { deps, emit, writesEnabled: writesEnabled() });
  });
}
