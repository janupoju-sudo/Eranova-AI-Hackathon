export type Money = number; // USD, 2 decimals

export interface CarrierCandidate {
  vendorId: string;
  name: string;
  equipment: string[];
  status: "ACTIVE" | "PENDING" | "INACTIVE" | "DO_NOT_USE";
  cargoExpires: string | null;      // YYYY-MM-DD
  complianceLight: "GREEN" | "YELLOW" | "RED";
  onTimePickupPct: number | null;
  onTimeDeliveryPct: number | null;
  claims: number | null;
  loads: number | null;
  score: number;                     // computed by intel
  warnings: string[];                // e.g. "cargo insurance expired 2026-09-29"
  eligible: boolean;                 // false for DO_NOT_USE / wrong equipment
  expectedChargeback$: Money | null; // (1 − on-time %) × OTIF chargeback % × PO value; null if unknown
}

export interface LoadBrief {
  shipmentId: string;
  customerId: string;
  lane: { origin: string; destination: string; miles: number };
  equipment: string;
  weightLb: number;
  pickupWindow: { start: string; end: string; tz: string };
  deliveryWindow: { start: string; end: string; tz: string };
  mabdDate: string | null;
  sell: { total: Money; lines: { code: string; amount: Money }[] };
  facility: {
    id: string;
    avgUnloadMin: number | null;
    graceMin: number | null;
    lumperPolicy: string | null;
    lumperFeeRange: [Money, Money] | null;
    leadTimeHours: number | null;
    mabdProgramNote: string | null;
    receivingHours: string | null;
    complianceFlags: string[];
    notes: string[];
  };
  risk: {
    expectedDwellH: number;
    expectedDetentionH: number;
    expectedDetention$: Money;
    expectedLumper$: Money;
    chargebackPct: number | null;    // OTIF chargeback % of PO value, parsed from the facility MABD note
    poValue$: Money;                 // declared value, else an assumed PO value (poValueAssumed)
    poValueAssumed: boolean;
  };
  laneHistory: { loads: number; avgLinehaulPerMile: number | null; avgLumper$: Money | null; avgGpPct: number | null };
  market: { low: Money; target: Money; high: Money; rateId: string } | null;
  margin: {
    floorPct: number;
    maxBuyTotal: Money;
    carrierFuel$: Money;
    maxLinehaul: Money;
    floorReachableAtHistory: boolean;
  };
  carriers: CarrierCandidate[];      // sorted by score desc
  flags: string[];                   // human-readable: "margin floor unreachable at historical rates", ...
}

export type AgentEvent =
  | { type: "thought"; text: string }
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "tool_result"; name: string; ok: boolean; result: unknown }
  | { type: "negotiation"; carrierId: string; from: "broker" | "carrier"; text: string; amount?: Money }
  | { type: "approval_needed"; runId: string; reason: string; numbers: Record<string, Money | number> }
  | { type: "done"; summary: string; protected$?: Money /** dock risk priced before booking: expected detention + expected OTIF chargeback */ };
