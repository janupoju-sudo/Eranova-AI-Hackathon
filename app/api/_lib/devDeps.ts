// TEMPORARY stand-ins so the agent runs before the real modules land. Owner: Jay.
// Swap each piece in ./deps.ts as soon as lib/intel.ts, lib/tms.ts, lib/carrierSim.ts exist.
//   devLoadBrief  → lib/intel.ts loadBrief        (Akshaya)
//   devTms        → lib/tms.ts                    (Akshaya)
//   devCarrier    → lib/carrierSim.ts respond     (Advika)

import type { CarrierCandidate, LoadBrief, Money } from "@/lib/types";
import type { CarrierReply, NegotiationTurn, TmsResult, ToolDeps } from "@/lib/tools";

// ---------- Hero brief (PRD §5 numbers) ----------

function cand(p: Partial<CarrierCandidate> & { vendorId: string; name: string }): CarrierCandidate {
  return {
    equipment: ["V"], status: "ACTIVE", cargoExpires: "2027-06-30", complianceLight: "GREEN",
    onTimePickupPct: 95, onTimeDeliveryPct: 94, claims: 0, loads: 120, score: 0, warnings: [], eligible: true,
    ...p,
  };
}

const HERO_CARRIERS: CarrierCandidate[] = [
  cand({ vendorId: "LAKESHORE", name: "Lakeshore Transport", onTimePickupPct: 97, onTimeDeliveryPct: 96, loads: 210, score: 72.3 }),
  cand({ vendorId: "CANYONFRT", name: "Canyon Freight", onTimePickupPct: 96, onTimeDeliveryPct: 95, loads: 180, score: 71.6 }),
  cand({ vendorId: "RUSTYRIG", name: "Rusty Rig Trucking", onTimePickupPct: 94, onTimeDeliveryPct: 93, loads: 160, score: 70.3,
    cargoExpires: "2026-09-29", complianceLight: "YELLOW", warnings: ["cargo insurance expired 2026-09-29"] }),
  cand({ vendorId: "BLUERIDGE", name: "Blue Ridge Carriers", onTimePickupPct: 93, onTimeDeliveryPct: 92, score: 68.3 }),
  cand({ vendorId: "ACMECARR", name: "Acme Carrier Inc.", onTimePickupPct: 92, onTimeDeliveryPct: 90, claims: 1, score: 61.0 }),
  cand({ vendorId: "SUNRIDGE", name: "Sunridge Logistics", onTimePickupPct: 90, onTimeDeliveryPct: 89, score: 64.3 }),
  cand({ vendorId: "GULFSTRMX", name: "Gulfstream Express", onTimePickupPct: 89, onTimeDeliveryPct: 88, score: 63.4 }),
  cand({ vendorId: "PRAIRIEHL", name: "Prairie Haulers", onTimePickupPct: 88, onTimeDeliveryPct: 86, claims: 1, score: 57.8 }),
  cand({ vendorId: "BADWOLF", name: "Bad Wolf Transport", status: "DO_NOT_USE", complianceLight: "RED", score: 0, eligible: false,
    warnings: ["DO NOT USE"] }),
];

const HERO_BRIEF: LoadBrief = {
  shipmentId: "7300176",
  customerId: "NORTHSTAR",
  lane: { origin: "Chicago, IL", destination: "Dallas, TX", miles: 925 },
  equipment: "V",
  weightLb: 36938,
  pickupWindow: { start: "2026-11-17T08:00:00", end: "2026-11-17T14:00:00", tz: "America/Chicago" },
  deliveryWindow: { start: "2026-11-19T06:00:00", end: "2026-11-19T14:00:00", tz: "America/Chicago" },
  mabdDate: "2026-11-19",
  sell: { total: 3479.0, lines: [{ code: "FRT", amount: 2691.75 }, { code: "FSC", amount: 527.25 }, { code: "LUM", amount: 260.0 }] },
  facility: {
    id: "BBR-DC135",
    avgUnloadMin: 150,
    graceMin: 30,
    lumperPolicy: "LUMPER required",
    lumperFeeRange: [150, 300],
    leadTimeHours: 48,
    mabdProgramNote: "MABD/OTIF: 3% of PO value chargeback for late arrival; early delivery also non-compliant",
    receivingHours: "Mon–Fri 06:00–14:00 CT",
    complianceFlags: ["seal required", "photo ID required", "CHEP pallets", "appointments via portal only"],
    notes: ["11/04: Door 17-22 under repair; expect 30-45 min extra dwell"],
  },
  risk: { expectedDwellH: 3.1, expectedDetentionH: 1.1, expectedDetention$: 82.5, expectedLumper$: 262.5 },
  laneHistory: { loads: 2, avgLinehaulPerMile: 2.47, avgLumper$: 262.5, avgGpPct: 12.7 },
  market: { low: 2050, target: 2240, high: 2420, rateId: "DEV-RATE" },
  margin: { floorPct: 18, maxBuyTotal: 2852.78, carrierFuel$: 527.25, maxLinehaul: 2063.03, floorReachableAtHistory: false },
  carriers: HERO_CARRIERS,
  flags: [
    "margin floor unreachable at historical rates",
    "lumper required at BBR-DC135",
    "OTIF chargeback 3% of PO value (late and early)",
    "appointment lead time 48 h",
    "seal / photo ID / CHEP required",
    "portal credentials: never store",
  ],
};

export async function devLoadBrief(shipmentId: string): Promise<LoadBrief> {
  return { ...structuredClone(HERO_BRIEF), shipmentId };
}

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

// ---------- Thin TMS client (mirror of PRD §9.1 contract) ----------

let lastCall = 0;
async function call(method: string, path: string, body?: unknown): Promise<TmsResult> {
  const base = process.env.TMS_API_BASE, key = process.env.TMS_API_KEY;
  if (!base || !key) return { ok: false, status: 0, error: "config", detail: "TMS_API_BASE / TMS_API_KEY not set in .env.local" };
  const wait = lastCall + 150 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  try {
    const res = await fetch(base + path, {
      method,
      headers: { "x-api-key": key, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: json.error ?? "http_error", detail: json.detail ?? res.statusText };
    return { ok: true, data: json };
  } catch (err) {
    return { ok: false, status: 0, error: "network", detail: err instanceof Error ? err.message : String(err) };
  }
}

export const devTms = {
  listShipments: (q: Record<string, string>) => call("GET", `/shipments?${new URLSearchParams(q)}`),
  cover: (id: string, body: Record<string, unknown>) => call("POST", `/shipments/${id}/cover`, body),
  addCost: (id: string, body: Record<string, unknown>) => call("POST", `/shipments/${id}/costs`, body),
  generateRateCon: (id: string) => call("POST", `/shipments/${id}/documents/generate`, { doc_type: "RATE_CONFIRMATION" }),
  setAppointment: (id: string, seq: number, body: Record<string, unknown>) => call("PUT", `/shipments/${id}/stops/${seq}/appointment`, body),
  addShipmentNote: (id: string, body: Record<string, unknown>) => call("POST", `/shipments/${id}/notes`, body),
};

export const devDeps: ToolDeps = {
  loadBrief: devLoadBrief,
  carrier: { respond: devRespond },
  tms: devTms,
};
