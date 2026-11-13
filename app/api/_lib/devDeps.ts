// TEMPORARY carrier sim until lib/carrierSim.ts (Advika) lands. Owner: Jay.

import type { LoadBrief, Money } from "@/lib/types";
import type { CarrierReply, NegotiationTurn } from "@/lib/tools";

// ---------- Seeded carrier sim ----------

// Hidden minimum = market target × factor. RUSTYRIG is cheap (that's the trap); the reliable ones want market.
const FACTORS: Record<string, number> = {
  RUSTYRIG: 0.9, LAKESHORE: 1.02, CANYONFRT: 1.0, BLUERIDGE: 1.04, ACMECARR: 0.97,
  SUNRIDGE: 1.06, GULFSTRMX: 1.08, PRAIRIEHL: 0.96,
};
const DRIVERS: Record<string, { name: string; phone: string }> = {
  RUSTYRIG: { name: "Dale Rusk", phone: "312-555-0141" },
  LAKESHORE: { name: "Maria Ortiz", phone: "312-555-0177" },
  CANYONFRT: { name: "Sam Whitehorse", phone: "214-555-0123" },
};

export async function devRespond(carrierId: string, offer: Money, history: NegotiationTurn[], brief: LoadBrief): Promise<CarrierReply> {
  const target = brief.market?.target ?? 2240;
  const min = Math.round(target * (FACTORS[carrierId] ?? 1.05));
  const driver = DRIVERS[carrierId] ?? { name: `${carrierId} Driver`, phone: "555-555-0100" };
  if (offer >= min) {
    return { accept: true, text: `Deal at $${offer.toFixed(0)}. Driver ${driver.name} (${driver.phone}) can load 11/17 morning.`, driver };
  }
  const lastCounter = [...history].reverse().find((t) => t.from === "carrier" && t.amount != null)?.amount;
  const counter = lastCounter ? Math.max(min, Math.round((lastCounter + offer) / 2 / 5) * 5) : Math.round((min * 1.06) / 5) * 5;
  return { accept: false, counter, text: `Can't do $${offer.toFixed(0)} into that DC — dock's slow. I need $${counter}.` };
}
