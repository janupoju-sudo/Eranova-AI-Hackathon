import { pathToFileURL } from "node:url";
import { tms, type TmsResult } from "../lib/tms";
import type { Shipment } from "../lib/intel";

/** Jay's add_cost tool must use this prefix in descriptions so resets own only agent costs. */
export const AGENT_COST_PREFIX = "[coverage-agent]";

export async function resetShipment(shipmentId: string, options: { execute?: boolean; source?: typeof tms } = {}): Promise<TmsResult<{ shipmentId: string; dryRun: boolean; cancelledCostIds: string[] }>> {
  const source = options.source ?? tms;
  const shipment = await source.getShipment<Shipment>(shipmentId);
  if (!shipment.ok) return shipment;
  const s = shipment.result;
  if (!s || !Array.isArray(s.costs) || !s.status)
    return { ok: false, status: 502, error: "INVALID_SHIPMENT", detail: "Expected shipment status and cost lines; verify API schema before reset." };
  if (!["BOOKED", "COVERED"].includes(s.status))
    return { ok: false, status: 409, error: "UNSAFE_RESET_STATUS", detail: "Only BOOKED or COVERED demo shipments can be reset." };
  const costs = s.costs.filter(cost => ["FSC", "LUM"].includes(cost.charge_code) && cost.status !== "CANCELLED" && cost.description?.startsWith(AGENT_COST_PREFIX));
  if (!options.execute) return { ok: true, result: { shipmentId, dryRun: true, cancelledCostIds: costs.map(cost => cost.id) } };
  if (s.status === "COVERED") {
    const uncovered = await source.uncover(shipmentId);
    if (!uncovered.ok) return uncovered;
  }
  const cancelledCostIds: string[] = [];
  for (const cost of costs) {
    const cancelled = await source.updateCost(shipmentId, cost.id, { status: "CANCELLED" });
    if (!cancelled.ok) return { ...cancelled, detail: { message: "Reset partially completed. Re-run to continue; already-cancelled costs are skipped.", failedCostId: cost.id, cancelledCostIds, upstream: cancelled.detail } };
    cancelledCostIds.push(cost.id);
  }
  const verified = await source.getShipment<Shipment>(shipmentId);
  if (!verified.ok) return verified;
  if (verified.result.status !== "BOOKED" || verified.result.costs.some(cost => costs.some(target => target.id === cost.id) && cost.status !== "CANCELLED"))
    return { ok: false, status: 409, error: "RESET_NOT_CONFIRMED", detail: "TMS did not confirm BOOKED status and cancelled agent cost lines." };
  return { ok: true, result: { shipmentId, dryRun: false, cancelledCostIds } };
}

async function main() {
  const args = process.argv.slice(2);
  const shipmentId = args.find(arg => !arg.startsWith("--"));
  if (!shipmentId || args.some(arg => arg.startsWith("--") && arg !== "--execute")) {
    console.error("Usage: npm run reset -- <shipment-id> [--execute]. Default is a read-only preview.");
    process.exitCode = 1; return;
  }
  const result = await resetShipment(shipmentId, { execute: args.includes("--execute") });
  // Print only our own status and IDs, never upstream response details or environment values.
  console.log(JSON.stringify(result.ok ? result : { ok: false, status: result.status, error: result.error }));
  if (!result.ok) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
