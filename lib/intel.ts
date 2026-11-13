import hero from "../fixtures/loadBrief.hero.json";
import type { CarrierCandidate, LoadBrief } from "./types";
import { tms, type TmsResult } from "./tms";

// Normalized internal records; liveSource adapts the documented Meridian wire schema.
export interface Shipment {
  id: string; customer_id: string; status: string; mode: string; equipment: string;
  origin: { city: string; state: string }; destination: { city: string; state: string };
  miles: number; weight_lb: number; delivery_facility_id: string;
  pickup_window: LoadBrief["pickupWindow"]; delivery_window: LoadBrief["deliveryWindow"];
  mabd_date: string | null; sell: LoadBrief["sell"];
  costs: { id: string; charge_code: string; amount: number; status: string; description?: string }[];
  gp_pct: number | null;
}
export interface Facility {
  id: string; avg_unload_min: number | null; grace_min: number | null;
  lumper_policy: string | null; lumper_fee_range: [number, number] | null;
  lead_time_hours: number | null; mabd_program_note: string | null;
  receiving_hours: string | null; compliance_flags: string[]; notes: string[];
}
export interface Vendor {
  id: string; name: string; equipment: string[]; status: CarrierCandidate["status"];
  insurance: { type: string; expires: string }[];
  on_time_pickup_pct: number | null; on_time_delivery_pct: number | null;
  claims: number | null; loads: number | null;
}
export interface IntelSource {
  getShipment(id: string): Promise<TmsResult<Shipment>>;
  getFacility(id: string): Promise<TmsResult<Facility>>;
  getCustomer(id: string): Promise<TmsResult<{ margin_floor_pct: number | null }>>;
  getFacilityShipments(id: string, filters: Record<string, string | number>): Promise<TmsResult<Shipment[]>>;
  listVendors(filters: Record<string, string>): Promise<TmsResult<Vendor[]>>;
  rateEngine(body: unknown): Promise<TmsResult<{ rate_id: string; market_context: { low_linehaul: number; target_linehaul: number; high_linehaul: number } }>>;
}
// ---------- Live adapter: real Meridian wire format → the interfaces above (verified 2026-11-13) ----------
type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const mapOk = <A, B>(r: TmsResult<A>, f: (a: A) => B): TmsResult<B> => (r.ok ? { ok: true, result: f(r.result) } : r);
const window = (w: Raw | undefined) => ({ start: w?.earliest_local, end: w?.latest_local, tz: w?.timezone });
const toShipment = (s: Raw): Shipment => {
  const stops: Raw[] = s.stops ?? [];
  const pick = stops.find(x => x.stop_type === "PICKUP") ?? stops[0];
  const drop = [...stops].reverse().find(x => x.stop_type === "DELIVERY") ?? stops.at(-1);
  const charges: Raw[] = (s.customer_charges ?? []).filter((c: Raw) => c.status !== "CANCELLED");
  return {
    id: s.shipment_id, customer_id: s.customer_id, status: s.status, mode: s.mode, equipment: s.equipment_type,
    origin: { city: s.shipper_city, state: s.shipper_state }, destination: { city: s.consignee_city, state: s.consignee_state },
    miles: s.miles, weight_lb: s.freight_totals?.actual_lb, delivery_facility_id: drop?.facility_id,
    pickup_window: window(pick?.scheduled_window), delivery_window: window(drop?.scheduled_window), mabd_date: drop?.mabd_date ?? null,
    sell: { total: s.sell_total, lines: charges.map(c => ({ code: c.charge_code, amount: c.amount })) },
    costs: (s.vendor_costs ?? []).map((c: Raw) => ({ id: c.cost_id, charge_code: c.charge_code, amount: c.amount, status: c.status, description: c.description })),
    gp_pct: s.gp_pct ?? null,
  };
};
const toHours = (h: Raw | undefined) => {
  if (!h) return null;
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].filter(day => h[day] != null);
  if (!days.length) return null;
  const spans = days.map(day => `${day} ${h[day].open}–${h[day].close}`);
  const same = new Set(days.map(day => `${h[day].open}–${h[day].close}`));
  return same.size === 1 ? `${days.join("/")} ${[...same][0]}` : spans.join(", ");
};
export const toFacility = (f: Raw): Facility => ({
  id: f.facility_id, avg_unload_min: f.avg_unload_minutes ?? null, grace_min: f.appointment_grace_minutes ?? null,
  lumper_policy: f.lumper_policy ? `${f.lumper_policy}${f.driver_assist ? ` (driver assist ${f.driver_assist})` : ""}` : null,
  lumper_fee_range: f.lumper_fee_min != null && f.lumper_fee_max != null ? [f.lumper_fee_min, f.lumper_fee_max] : null,
  lead_time_hours: f.appointment_lead_time_hours ?? null, mabd_program_note: f.mabd_program_note ?? null,
  receiving_hours: toHours(f.receiving_hours),
  compliance_flags: [...(f.compliance_flags ?? []), ...(f.pallet_exchange ? [`${f.pallet_exchange} pallets`] : []), ...(f.reschedule_policy_note ? [f.reschedule_policy_note] : [])],
  notes: (f.notes ?? []).map((n: Raw) => `${String(n.timestamp ?? "").slice(0, 10)}: ${n.text}`),
});
const toVendor = (v: Raw): Vendor => ({
  id: v.vendor_id, name: v.legal_name, equipment: v.equipment_types ?? [], status: v.status,
  insurance: (v.insurance ?? []).map((i: Raw) => ({ type: i.policy_type, expires: i.expiration_date })),
  on_time_pickup_pct: v.on_time_pickup_pct ?? null, on_time_delivery_pct: v.on_time_delivery_pct ?? null,
  claims: v.claims_count ?? null, loads: v.loads_completed ?? null,
});
export const liveSource: IntelSource = {
  getShipment: async id => mapOk(await tms.getShipment<Raw>(id), toShipment),
  getFacility: async id => mapOk(await tms.getFacility<Raw>(id), toFacility),
  getCustomer: id => tms.getCustomer(id),
  // Rows only carry a "City, ST → City, ST" lane string; enough for the pre-filter, details are fetched per load.
  getFacilityShipments: async id => mapOk(await tms.getFacilityShipments<Raw>(id), rows => rows.filter(r => r.role === "DELIVERY").map(r => {
    const [city, state] = String(r.lane ?? "").split("→")[0].split(",").map(x => x.trim());
    return { id: r.shipment_id, customer_id: r.customer_id, status: r.status, origin: { city, state } } as Shipment;
  })),
  listVendors: async filters => mapOk(await tms.listVendors<Raw>(filters), rows => rows.map(toVendor)),
  // market_context is all-in (linehaul + FSC); the brief's market is linehaul-only.
  rateEngine: async body => mapOk(await tms.rateEngine<Raw>(body), q => {
    const fsc = (q.lines ?? []).filter((l: Raw) => l.charge_code === "FSC").reduce((t: number, l: Raw) => t + l.amount, 0);
    const m = q.market_context ?? {};
    return { rate_id: q.rate_id, market_context: { low_linehaul: money(m.low - fsc), target_linehaul: money(m.target - fsc), high_linehaul: money(m.high - fsc) } };
  }),
};

/** Company-wide margin floor; a customer floor can only raise it (team decision 2026-11-13, PRD §5). */
export const COMPANY_FLOOR_PCT = 18;
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const average = (values: number[]) => values.length ? money(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function scoreCarrier(vendor: Vendor, equipment: string, deliveryDate: string): CarrierCandidate {
  const cargoExpires = vendor.insurance.filter(policy => policy.type === "CARGO").map(policy => policy.expires).sort().at(-1) ?? null;
  const eligible = vendor.status !== "DO_NOT_USE" && vendor.equipment.includes(equipment);
  const warnings: string[] = [];
  if (vendor.status !== "ACTIVE") warnings.push(`carrier status: ${vendor.status}`);
  if (!cargoExpires || cargoExpires < deliveryDate) warnings.push(cargoExpires ? `cargo insurance expired ${cargoExpires}` : "no CARGO policy on file");
  if (!eligible) warnings.push("DO NOT USE or incompatible equipment");
  return {
    vendorId: vendor.id, name: vendor.name, equipment: vendor.equipment, status: vendor.status, cargoExpires,
    complianceLight: !eligible ? "RED" : warnings.length ? "YELLOW" : "GREEN",
    onTimePickupPct: vendor.on_time_pickup_pct, onTimeDeliveryPct: vendor.on_time_delivery_pct,
    claims: vendor.claims, loads: vendor.loads,
    score: money(0.4 * (vendor.on_time_delivery_pct ?? 0) + 0.3 * (vendor.on_time_pickup_pct ?? 0) - 5 * (vendor.claims ?? 0) + Math.min((vendor.loads ?? 0) / 50, 5)),
    warnings, eligible,
  };
}

export function computeBrief(shipment: Shipment, facility: Facility, floorPct: number, history: Shipment[], vendors: Vendor[], market: LoadBrief["market"]): LoadBrief {
  if (!finite(shipment.miles) || shipment.miles <= 0 || !finite(shipment.sell.total) || shipment.sell.total <= 0 || !finite(floorPct) || floorPct < 0 || floorPct >= 100)
    throw new Error("Invalid shipment economics or margin floor");
  for (const window of [shipment.pickup_window, shipment.delivery_window]) {
    if (!window?.start || !window.end || !window.tz) throw new Error("Missing facility-local stop window or IANA timezone");
    new Intl.DateTimeFormat("en-US", { timeZone: window.tz });
  }
  const lane = history.filter(item => item.customer_id === shipment.customer_id && item.origin.city.toLowerCase() === shipment.origin.city.toLowerCase() && item.origin.state === shipment.origin.state && ["CLOSED", "POD_RECEIVED"].includes(item.status)).slice(0, 8);
  const activeCosts = (item: Shipment, code: string) => item.costs.filter(cost => cost.charge_code === code && cost.status !== "CANCELLED");
  const linehauls = lane.filter(item => item.miles > 0 && activeCosts(item, "FRT").length).map(item => activeCosts(item, "FRT").reduce((sum, cost) => sum + cost.amount, 0) / item.miles);
  const lumpers = lane.filter(item => activeCosts(item, "LUM").length).map(item => activeCosts(item, "LUM").reduce((sum, cost) => sum + cost.amount, 0));
  const avgLinehaulPerMile = average(linehauls);
  const avgLumper$ = average(lumpers);
  const expectedLumper$ = avgLumper$ ?? (facility.lumper_fee_range ? money((facility.lumper_fee_range[0] + facility.lumper_fee_range[1]) / 2) : 0);
  const expectedDwellH = money((facility.avg_unload_min ?? 0) / 60 + (facility.notes.some(note => /repair|extra dwell/i.test(note)) ? 0.6 : 0));
  const expectedDetentionH = money(Math.max(0, expectedDwellH - 2));
  const carrierFuel$ = money(shipment.sell.lines.filter(line => line.code === "FSC").reduce((sum, line) => sum + line.amount, 0));
  const maxBuyTotal = money(shipment.sell.total * (1 - floorPct / 100));
  const maxLinehaul = money(maxBuyTotal - carrierFuel$ - expectedLumper$);
  const flags: string[] = [];
  const floorReachableAtHistory = avgLinehaulPerMile !== null && avgLinehaulPerMile * shipment.miles <= maxLinehaul;
  if (avgLinehaulPerMile !== null && !floorReachableAtHistory) flags.push("margin floor unreachable at historical rates");
  if (avgLinehaulPerMile === null) flags.push("lane history unavailable; margin feasibility unknown");
  if (facility.avg_unload_min === null) flags.push("unload duration unknown; detention estimate incomplete");
  if (avgLumper$ === null && facility.lumper_fee_range === null) flags.push("lumper estimate unavailable");
  if (facility.lumper_policy) flags.push(`lumper policy: ${facility.lumper_policy}`);
  if (facility.lead_time_hours !== null) flags.push(`appointment lead time: ${facility.lead_time_hours} hours`);
  if (facility.mabd_program_note) flags.push(facility.mabd_program_note);
  flags.push(...facility.compliance_flags, "portal credentials: never store");
  return {
    shipmentId: shipment.id, customerId: shipment.customer_id,
    lane: { origin: `${shipment.origin.city}, ${shipment.origin.state}`, destination: `${shipment.destination.city}, ${shipment.destination.state}`, miles: shipment.miles },
    equipment: shipment.equipment, weightLb: shipment.weight_lb,
    pickupWindow: shipment.pickup_window, deliveryWindow: shipment.delivery_window, mabdDate: shipment.mabd_date,
    sell: shipment.sell,
    facility: { id: facility.id, avgUnloadMin: facility.avg_unload_min, graceMin: facility.grace_min, lumperPolicy: facility.lumper_policy, lumperFeeRange: facility.lumper_fee_range, leadTimeHours: facility.lead_time_hours, mabdProgramNote: facility.mabd_program_note, receivingHours: facility.receiving_hours, complianceFlags: facility.compliance_flags, notes: facility.notes },
    risk: { expectedDwellH, expectedDetentionH, expectedDetention$: money(expectedDetentionH * 75), expectedLumper$ },
    laneHistory: { loads: lane.length, avgLinehaulPerMile, avgLumper$, avgGpPct: average(lane.map(item => item.gp_pct).filter(finite)) },
    market, margin: { floorPct, maxBuyTotal, carrierFuel$, maxLinehaul, floorReachableAtHistory },
    carriers: vendors.map(vendor => scoreCarrier(vendor, shipment.equipment, shipment.delivery_window.end.slice(0, 10))).sort((a, b) => b.score - a.score || a.vendorId.localeCompare(b.vendorId)), flags,
  };
}

export async function loadBriefResult(shipmentId: string, options: { fixture?: boolean; source?: IntelSource } = {}): Promise<TmsResult<LoadBrief>> {
  if (options.fixture) return shipmentId === hero.shipmentId ? { ok: true, result: structuredClone(hero) as LoadBrief } : { ok: false, status: 404, error: "FIXTURE_NOT_FOUND", detail: "Only the hero shipment fixture is available." };
  const source: IntelSource = options.source ?? liveSource;
  try {
    const shipment = await source.getShipment(shipmentId);
    if (!shipment.ok) return shipment;
    const s = shipment.result;
    const facility = await source.getFacility(s.delivery_facility_id);
    if (!facility.ok) return facility;
    const customer = await source.getCustomer(s.customer_id);
    if (!customer.ok) return customer;
    const history = await source.getFacilityShipments(s.delivery_facility_id, { customer_id: s.customer_id, limit: 8, sort: "-pickup_date" });
    if (!history.ok) return history;
    const details: Shipment[] = [];
    for (const item of history.result.filter(item => ["CLOSED", "POD_RECEIVED"].includes(item.status) && item.customer_id === s.customer_id && item.origin.city === s.origin.city && item.origin.state === s.origin.state).slice(0, 8)) {
      const detail = await source.getShipment(item.id);
      if (!detail.ok) return detail;
      details.push(detail.result);
    }
    const vendors = await source.listVendors({ type: "TRUCKLOAD_CARRIER" });
    if (!vendors.ok) return vendors;
    const quote = await source.rateEngine({ mode: s.mode, origin: { state: s.origin.state }, destination: { state: s.destination.state }, miles: s.miles, pickup_date: s.pickup_window.start.slice(0, 10) });
    if (!quote.ok) return quote;
    const context = quote.result.market_context;
    if (![context.low_linehaul, context.target_linehaul, context.high_linehaul].every(finite)) throw new Error("Invalid market context");
    return { ok: true, result: computeBrief(s, facility.result, Math.max(customer.result.margin_floor_pct ?? 0, COMPANY_FLOOR_PCT), details, vendors.result, { low: context.low_linehaul, target: context.target_linehaul, high: context.high_linehaul, rateId: quote.result.rate_id }) };
  } catch {
    return { ok: false, status: 502, error: "INVALID_TMS_DATA", detail: "Response does not match the required shipment, facility, vendor or quote schema. Verify the Meridian API contract." };
  }
}

/** Success-only compatibility API for PRD §9.2. Agent tools should use loadBriefResult. */
export async function loadBrief(shipmentId: string, options: { fixture?: boolean; source?: IntelSource } = {}): Promise<LoadBrief> {
  const response = await loadBriefResult(shipmentId, options);
  if (!response.ok) throw new Error(`loadBrief failed: ${response.error}. Use loadBriefResult for non-throwing agent tool calls.`);
  return response.result;
}

/** All proposed-price arithmetic belongs here, including the human approval panel. */
export function priceImpact(brief: LoadBrief, linehaul: number) {
  if (!finite(linehaul) || linehaul < 0) throw new Error("Linehaul must be a nonnegative finite amount");
  const totalBuy = money(linehaul + brief.margin.carrierFuel$ + brief.risk.expectedLumper$);
  const totalWithDetention = money(totalBuy + brief.risk.expectedDetention$);
  return { linehaul: money(linehaul), totalBuy, gpPct: money((brief.sell.total - totalBuy) / brief.sell.total * 100), totalWithDetention, gpWithDetentionPct: money((brief.sell.total - totalWithDetention) / brief.sell.total * 100), requiresApproval: linehaul > brief.margin.maxLinehaul, recommendedSell: money(totalWithDetention / (1 - brief.margin.floorPct / 100)) };
}
