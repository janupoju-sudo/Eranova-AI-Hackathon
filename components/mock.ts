// Fixture-shaped mock data for building the UI before Akshaya's fixtures land.
// Numbers follow PRD §5. Swap for fixtures/loadBrief.hero.json + fixtures/events.sample.json when committed.
import { respond, type SimCarrier, type SimTurn } from "@/lib/carrierSim";
import type { AgentEvent, CarrierCandidate, LoadBrief } from "@/lib/types";
import type { QueueLoad } from "./useQueue";

const carrier = (
  vendorId: string, name: string, score: number, otd: number, otp: number, claims: number, loads: number,
  extra: Partial<CarrierCandidate> = {},
): CarrierCandidate => ({
  vendorId, name, equipment: ["V"], status: "ACTIVE", cargoExpires: "2027-03-31", complianceLight: "GREEN",
  onTimePickupPct: otp, onTimeDeliveryPct: otd, claims, loads, score, warnings: [], eligible: true, ...extra,
});

export const heroBrief: LoadBrief = {
  shipmentId: "7300176",
  customerId: "NORTHSTAR",
  lane: { origin: "Chicago, IL", destination: "Dallas, TX", miles: 925 },
  equipment: "TL · 53' dry van",
  weightLb: 36938,
  pickupWindow: { start: "2026-11-17T08:00", end: "2026-11-17T14:00", tz: "America/Chicago" },
  deliveryWindow: { start: "2026-11-19T06:00", end: "2026-11-19T14:00", tz: "America/Chicago" },
  mabdDate: "2026-11-19",
  sell: {
    total: 3479,
    lines: [
      { code: "FRT", amount: 2691.75 },
      { code: "FSC", amount: 527.25 },
      { code: "LUM", amount: 260 },
    ],
  },
  facility: {
    id: "BBR-DC135",
    avgUnloadMin: 150,
    graceMin: 30,
    lumperPolicy: "Required, $150–300",
    lumperFeeRange: [150, 300],
    leadTimeHours: 48,
    mabdProgramNote: "Chargeback 3% of PO value for late arrival; early delivery also non-compliant",
    receivingHours: "Mon–Fri 06:00–14:00 CT",
    complianceFlags: ["Seal required", "Photo ID required", "CHEP pallets"],
    notes: ["11/04: Door 17-22 under repair; expect 30-45 min extra dwell"],
  },
  risk: { expectedDwellH: 3.1, expectedDetentionH: 1.1, expectedDetention$: 82.5, expectedLumper$: 262 },
  laneHistory: { loads: 2, avgLinehaulPerMile: 2.47, avgLumper$: 262.5, avgGpPct: 12.7 },
  market: { low: 2210, target: 2435, high: 2660, rateId: "mock-rate" },
  margin: { floorPct: 18, maxBuyTotal: 2852.78, carrierFuel$: 527.25, maxLinehaul: 2063, floorReachableAtHistory: false },
  carriers: [
    carrier("LAKESHORE", "Lakeshore Transport", 62, 96, 93, 0, 41),
    carrier("CANYONFRT", "Canyon Freight", 64, 94, 91, 1, 36),
    carrier("GULFSTRMX", "Gulfstream Express", 66, 95, 94, 0, 28),
    carrier("SUNRIDGE", "Sunridge Carriers", 58, 90, 88, 1, 19),
    carrier("ACMECARR", "Acme Carriers", 55, 88, 85, 2, 22),
    carrier("PRAIRIEHL", "Prairie Haul", 57, 91, 87, 1, 14),
    carrier("BLUERIDGE", "Blue Ridge Freight", 60, 92, 90, 1, 25),
    carrier("RUSTYRIG", "Rusty Rig Trucking", 49, 85, 82, 3, 12, {
      cargoExpires: "2026-09-29", warnings: ["cargo insurance expired 2026-09-29"], complianceLight: "YELLOW",
    }),
    carrier("BADWOLF", "Bad Wolf Logistics", 20, 60, 55, 9, 6, {
      status: "DO_NOT_USE", eligible: false, complianceLight: "RED", warnings: ["DO NOT USE"],
    }),
  ],
  flags: [
    "Margin floor unreachable at historical rates",
    "Lumper required ($150–300)",
    "OTIF chargeback 3% of PO",
    "Appointment lead time 48 h",
    "Seal · Photo ID · CHEP pallets",
  ],
};

export const queue: QueueLoad[] = [
  { shipmentId: "7300176", customerId: "NORTHSTAR", lane: "Chicago, IL → Dallas, TX", pickupDate: "2026-11-17", sell: 3479 },
  { shipmentId: "7300181", customerId: "HARBORLT", lane: "Atlanta, GA → Charlotte, NC", pickupDate: "2026-11-16", sell: 1420 },
  { shipmentId: "7300184", customerId: "BRIGHTMILL", lane: "Columbus, OH → Nashville, TN", pickupDate: "2026-11-16", sell: 1985 },
  { shipmentId: "7300187", customerId: "NORTHSTAR", lane: "Joliet, IL → Memphis, TN", pickupDate: "2026-11-17", sell: 2310 },
  { shipmentId: "7300190", customerId: "PINECREST", lane: "Dallas, TX → Houston, TX", pickupDate: "2026-11-17", sell: 1105 },
  { shipmentId: "7300193", customerId: "HARBORLT", lane: "Savannah, GA → Orlando, FL", pickupDate: "2026-11-18", sell: 1760 },
  { shipmentId: "7300196", customerId: "BRIGHTMILL", lane: "Indianapolis, IN → Detroit, MI", pickupDate: "2026-11-18", sell: 1340 },
  { shipmentId: "7300199", customerId: "PINECREST", lane: "Phoenix, AZ → Denver, CO", pickupDate: "2026-11-18", sell: 2890 },
  { shipmentId: "7300203", customerId: "NORTHSTAR", lane: "Kansas City, MO → Omaha, NE", pickupDate: "2026-11-19", sell: 1215 },
];

// ---- scripted run ----
const lake = heroBrief.carriers.find((c) => c.vendorId === "LAKESHORE")!;
const sim: SimCarrier = { vendorId: lake.vendorId, name: lake.name, score: lake.score, style: "blunt" };

function negotiationEvents(): { events: AgentEvent[]; finalOffer: number; openingAsk: number } {
  const events: AgentEvent[] = [];
  const history: SimTurn[] = [];
  let openingAsk = 0;
  let finalOffer = 0;
  const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  for (const [i, offer] of [2063, 2150, 2210].entries()) {
    const text = i === 0
      ? `Opening at ${money(offer)} linehaul, Chicago to Dallas, dry van, delivering 11/19 at BBR-DC135.`
      : i === 1 ? `Can you meet me at ${money(offer)}? On-time delivery matters more than the last few dollars at this dock.`
      : `${money(offer)} is the most I can send over without sign-off. Is that workable?`;
    events.push({ type: "negotiation", carrierId: sim.vendorId, from: "broker", amount: offer, text });
    const r = respond(sim, offer, history, heroBrief.market!.target);
    history.push({ from: "broker", amount: offer });
    events.push({ type: "negotiation", carrierId: sim.vendorId, from: "carrier", amount: r.counter, text: r.text });
    if (r.counter && !openingAsk) openingAsk = r.counter;
    if (r.counter) { history.push({ from: "carrier", amount: r.counter }); finalOffer = r.counter; }
    if (r.accept || r.final) break;
  }
  return { events, finalOffer, openingAsk };
}
const neg = negotiationEvents();
const LINEHAUL = neg.finalOffer; // carrier's final ask
const gp = (lh: number) => ((3479 - (lh + 527.25 + 262)) / 3479) * 100;

export const preApproval: AgentEvent[] = [
  { type: "thought", text: "Reading the load brief before touching anything. Every number I use comes from it." },
  { type: "tool_call", name: "get_load_brief", args: { shipment_id: "7300176" } },
  { type: "tool_result", name: "get_load_brief", ok: true, result: heroBrief },
  { type: "thought", text: "Max linehaul is $2,063 ($2.23/mi). This lane has historically cleared at $2.45–2.49/mi, so the 18% floor is unreachable at normal rates. I'll negotiate hard, then escalate rather than quietly eat the margin." },
  { type: "thought", text: "RUSTYRIG is ACTIVE and cheap on paper. Trying it first." },
  { type: "tool_call", name: "cover", args: { shipment_id: "7300176", carrier_id: "RUSTYRIG", amount: 2063 } },
  { type: "tool_result", name: "cover", ok: false, result: { ok: false, status: 409, error: "business_rule", detail: "Carrier RUSTYRIG has no unexpired CARGO insurance policy (expired 2026-09-29)." } },
  { type: "thought", text: "409: RUSTYRIG's cargo insurance lapsed on 09/29. Dropping it. This dock has a 3% OTIF chargeback, so I'm picking on reliability: LAKESHORE has 96% on-time delivery and has run this lane." },
  { type: "tool_call", name: "negotiate", args: { carrier_id: "LAKESHORE", offer: 2063 } },
  ...neg.events,
  { type: "thought", text: `LAKESHORE's floor is ${LINEHAUL.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}, $${LINEHAUL - 2063} over my ceiling. I can't exceed the ceiling on my own. Asking a human.` },
  {
    type: "approval_needed", runId: "run-7300176",
    reason: "Best available linehaul is above the margin ceiling. Floor unreachable on this lane.",
    numbers: {
      offer: LINEHAUL, maxLinehaul: 2063, overCeiling: LINEHAUL - 2063, resultingGpPct: Number(gp(LINEHAUL).toFixed(1)),
      floorPct: 18, expectedDetention: 82.5, openingAsk: neg.openingAsk,
    },
  },
];

export const postApproval: AgentEvent[] = [
  { type: "thought", text: "Approved. Committing LAKESHORE and booking the rest of the load's real costs so the ledger isn't flattering." },
  { type: "tool_call", name: "cover", args: { shipment_id: "7300176", carrier_id: "LAKESHORE", amount: LINEHAUL, driver_name: "Marcus Bell", driver_phone: "704-555-4821" } },
  { type: "tool_result", name: "cover", ok: true, result: { status: "COVERED", frt: LINEHAUL } },
  { type: "tool_call", name: "add_cost", args: { code: "FSC", vendor_id: "LAKESHORE", amount: 527.25 } },
  { type: "tool_result", name: "add_cost", ok: true, result: { code: "FSC", amount: 527.25 } },
  { type: "tool_call", name: "add_cost", args: { code: "LUM", vendor_id: "DOCKHANDS", amount: 262 } },
  { type: "tool_result", name: "add_cost", ok: true, result: { code: "LUM", amount: 262 } },
  { type: "tool_call", name: "generate_rate_con", args: { shipment_id: "7300176" } },
  { type: "tool_result", name: "generate_rate_con", ok: true, result: { doc_type: "RATE_CONFIRMATION", generated: true } },
  { type: "tool_call", name: "request_appointment", args: { stop_seq: 2, earliest_local: "2026-11-19T10:00", latest_local: "2026-11-19T12:00", status: "REQUESTED" } },
  { type: "tool_result", name: "request_appointment", ok: true, result: { status: "REQUESTED", note: "inside MABD, 48 h+ lead, not early" } },
  { type: "tool_call", name: "add_note", args: { shipment_id: "7300176", text: "Covered LAKESHORE at over-ceiling rate with human approval. RUSTYRIG rejected (cargo expired)." } },
  { type: "tool_result", name: "add_note", ok: true, result: { ok: true } },
  { type: "tool_call", name: "escalate_to_sales", args: { text: "NORTHSTAR Chicago → DC135 runs 12–13% GP vs 18% floor. Reprice or add lumper/detention pass-through." } },
  { type: "tool_result", name: "escalate_to_sales", ok: true, result: { ok: true } },
  {
    type: "done",
    summary: "Load covered with human approval. Dock costs priced in, repricing case sent to sales.",
    protected$: 262 + 82.5 + (neg.openingAsk - LINEHAUL),
  },
];

export const afterReject: AgentEvent[] = [
  { type: "thought", text: "Rejected. No carrier committed, the load stays BOOKED. Sending the repricing case to sales instead." },
  { type: "tool_call", name: "escalate_to_sales", args: { text: "Cannot cover NORTHSTAR Chicago → DC135 inside floor. Needs repricing." } },
  { type: "tool_result", name: "escalate_to_sales", ok: true, result: { ok: true } },
  { type: "done", summary: "Nothing committed. Overpay of $" + (LINEHAUL - 2063) + " avoided.", protected$: LINEHAUL - 2063 },
];

export const eventDelay = (e: AgentEvent): number => {
  switch (e.type) {
    case "thought": return 1500;
    case "tool_call": return 700;
    case "tool_result": return 900;
    case "negotiation": return e.from === "broker" ? 900 : 1300;
    default: return 800;
  }
};
