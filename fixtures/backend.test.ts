import assert from "node:assert/strict";
import { test } from "node:test";
import hero from "./loadBrief.prd.json";
import liveHero from "./loadBrief.hero.json";
import events from "./events.sample.json";
import type { AgentEvent, LoadBrief } from "../lib/types";
import { computeBrief, loadBriefResult, marginProtected, priceImpact, scoreCarrier, toFacility, type Facility, type Shipment, type Vendor, type IntelSource } from "../lib/intel";
import { createTmsClient } from "../lib/tms";
import { resetShipment } from "../scripts/reset";

const fixture: LoadBrief = hero as LoadBrief;
const sample: AgentEvent[] = events as AgentEvent[];
const shipment: Shipment = {
  id: hero.shipmentId, customer_id: hero.customerId, status: "BOOKED", mode: "TL", equipment: "V",
  origin: { city: "Chicago", state: "IL" }, destination: { city: "Dallas", state: "TX" },
  miles: 925, weight_lb: 36938, delivery_facility_id: "BBR-DC135",
  pickup_window: hero.pickupWindow, delivery_window: hero.deliveryWindow, mabd_date: hero.mabdDate,
  sell: hero.sell, costs: [], gp_pct: null,
};
const facility: Facility = {
  id: hero.facility.id, avg_unload_min: 150, grace_min: 30, lumper_policy: "REQUIRED", lumper_fee_range: [150, 300],
  lead_time_hours: 48, mabd_program_note: hero.facility.mabdProgramNote,
  receiving_hours: hero.facility.receivingHours, compliance_flags: hero.facility.complianceFlags, notes: hero.facility.notes,
};
const vendors: Vendor[] = hero.carriers.map(c => ({ id: c.vendorId, name: c.name, equipment: c.equipment, status: c.status as Vendor["status"], insurance: [{ type: "CARGO", expires: c.cargoExpires }], on_time_pickup_pct: c.onTimePickupPct, on_time_delivery_pct: c.onTimeDeliveryPct, claims: c.claims, loads: c.loads }));
const history: Shipment[] = [
  { ...shipment, id: "7300105", status: "CLOSED", gp_pct: 12.1, costs: [{ id: "1", charge_code: "FRT", amount: 2266.25, status: "CONFIRMED" }, { id: "2", charge_code: "LUM", amount: 290, status: "CONFIRMED" }] },
  { ...shipment, id: "7300115", status: "POD_RECEIVED", gp_pct: 13.3, costs: [{ id: "3", charge_code: "FRT", amount: 2303.25, status: "CONFIRMED" }, { id: "4", charge_code: "LUM", amount: 235, status: "CONFIRMED" }] },
];
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

test("margin protected = dock costs priced in + overpay avoided vs lane history", () => {
  const b = computeBrief(shipment, facility, 18, history, vendors, null);
  const dock = b.risk.expectedLumper$ + b.risk.expectedDetention$;
  const hist = b.laneHistory.avgLinehaulPerMile! * b.lane.miles;
  assert.equal(marginProtected(b, hist + 500), Math.round(dock * 100) / 100); // paid above history: only dock costs count
  assert.equal(marginProtected(b, hist - 100), Math.round((dock + 100) * 100) / 100);
});

test("facility adapter accepts null closed days and orders receiving hours", () => {
  const mapped = toFacility({ facility_id: "dock", receiving_hours: { fri: { open: "06:00", close: "14:00" }, sun: null, mon: { open: "06:00", close: "14:00" } } });
  assert.equal(mapped.receiving_hours, "mon/fri 06:00–14:00");
  assert.equal(toFacility({ facility_id: "dock", receiving_hours: { sun: null } }).receiving_hours, null);
});

test("hero economics match the PRD and checked-in fixture", () => {
  const computed = computeBrief(shipment, facility, 18, history, vendors, null);
  assert.deepEqual(computed, fixture);
  assert.equal(sample.at(-1)?.type, "approval_needed");
  const impact = priceImpact(computed, 2266.25);
  assert.equal(impact.gpPct, 12.16);
  assert.equal(impact.requiresApproval, true);
  assert.equal(priceImpact(computed, 2063.03).requiresApproval, false);
  assert.ok(impact.gpWithDetentionPct < impact.gpPct);
  assert.throws(() => priceImpact(computed, NaN));
});

test("history excludes wrong customer/origin, open loads and cancelled cost lines", () => {
  const irrelevant = [{ ...history[0], customer_id: "OTHER" }, { ...history[0], origin: { city: "Boston", state: "MA" } }, { ...history[0], status: "BOOKED" }];
  const computed = computeBrief(shipment, facility, 18, [...irrelevant, ...history], vendors, null);
  assert.deepEqual(computed.laneHistory, fixture.laneHistory);
  const cancelled = { ...history[0], costs: [...history[0].costs, { id: "x", charge_code: "LUM", amount: 999, status: "CANCELLED" }] };
  assert.equal(computeBrief(shipment, facility, 18, [cancelled], vendors, null).risk.expectedLumper$, 290);
  assert.equal(computeBrief(shipment, facility, 18, [], vendors, null).risk.expectedLumper$, 225);
  assert.throws(() => computeBrief({ ...shipment, miles: 0 }, facility, 18, [], [], null));
});

test("RUSTYRIG stays eligible with warning; BADWOLF and wrong equipment are excluded", () => {
  const rusty = scoreCarrier(vendors[1], "V", "2026-11-19");
  assert.equal(rusty.eligible, true); assert.equal(rusty.complianceLight, "YELLOW");
  assert.match(rusty.warnings[0], /2026-09-29/);
  assert.equal(scoreCarrier(vendors[3], "V", "2026-11-19").eligible, false);
  assert.equal(scoreCarrier(vendors[0], "R", "2026-11-19").eligible, false);
});

test("fixture selection is explicit and HTTP errors do not throw into tool callers", async () => {
  assert.deepEqual(await loadBriefResult(hero.shipmentId, { fixture: true }), { ok: true, result: liveHero });
  assert.equal((await loadBriefResult("missing", { fixture: true })).ok, false);
  const client = createTmsClient({ baseUrl: "https://example.invalid", apiKey: "test-only", fetch: async () => json({ error: "EXPIRED", detail: "CARGO policy expired" }, 409), now: () => new Date("2026-11-13T19:00:00Z") });
  assert.deepEqual(await client.cover("hero", {}), { ok: false, status: 409, error: "EXPIRED", detail: { error: "EXPIRED", detail: "CARGO policy expired" } });
});

test("pagination follows empty pages, throttles concurrent calls, and rejects repeated cursors", async () => {
  const starts: number[] = [];
  const client = createTmsClient({ baseUrl: "https://example.invalid", apiKey: "test-only", fetch: async input => {
    starts.push(Date.now());
    const cursor = new URL(String(input)).searchParams.get("cursor");
    return json(cursor ? { items: ["found"], next_cursor: null } : { items: [], next_cursor: "next" });
  } });
  assert.deepEqual(await client.paginate("/shipments"), { ok: true, result: ["found"] });
  await Promise.all([client.getShipment("a"), client.getShipment("b")]);
  assert.ok(starts.every((time, index) => index === 0 || time - starts[index - 1] >= 145));
  const looping = createTmsClient({ baseUrl: "https://example.invalid", apiKey: "test-only", fetch: async () => json({ items: [], next_cursor: "same" }) });
  const result = await looping.paginate("/shipments");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "INVALID_CURSOR");
});

test("network exceptions and invalid JSON are handled without secret leakage", async () => {
  const broken = createTmsClient({ baseUrl: "https://example.invalid", apiKey: "hidden-key", fetch: async () => { throw new Error("hidden-key"); } });
  const result = await broken.getShipment("hero");
  assert.equal(result.ok, false); assert.ok(!JSON.stringify(result).includes("hidden-key"));
  const invalid = createTmsClient({ baseUrl: "https://example.invalid", apiKey: "test-only", fetch: async () => new Response("not JSON", { status: 502 }) });
  assert.equal((await invalid.getShipment("hero")).ok, false);
});

test("intel orchestration uses bounded history and propagates upstream failures", async () => {
  const requested: string[] = [];
  const source: IntelSource = {
    getShipment: async id => { requested.push(id); return { ok: true, result: id === shipment.id ? shipment : history.find(item => item.id === id)! }; },
    getFacility: async () => ({ ok: true, result: facility }),
    getCustomer: async () => ({ ok: true, result: { margin_floor_pct: null } }),
    getFacilityShipments: async () => ({ ok: true, result: history }),
    listVendors: async () => ({ ok: true, result: vendors }),
    rateEngine: async () => ({ ok: true, result: { rate_id: "fixture-quote", market_context: { low_linehaul: 2100, target_linehaul: 2250, high_linehaul: 2400 } } }),
  };
  const result = await loadBriefResult(shipment.id, { source });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.result.market?.target, 2250);
  assert.deepEqual(requested, [shipment.id, "7300105", "7300115"]);
  source.getFacility = async () => ({ ok: false, status: 404, error: "NOT_FOUND", detail: "facility missing" });
  const failure = await loadBriefResult(shipment.id, { source });
  assert.equal(failure.ok, false);
  if (!failure.ok) assert.equal(failure.status, 404);
});

test("pagination stops at the cap instead of returning partial data", async () => {
  let calls = 0;
  const source = createTmsClient({ baseUrl: "https://example.invalid", apiKey: "test-only", fetch: async () => json({ items: [], next_cursor: String(++calls) }) });
  const result = await source.paginate("/shipments", {}, 2);
  assert.equal(calls, 2);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "PAGE_LIMIT");
});

test("reset previews without writes and preserves unrelated costs when executing", async () => {
  const state = { shipment_id: shipment.id, status: "COVERED", vendor_costs: [
    { cost_id: "agent-fuel", charge_code: "FSC", amount: 527.25, status: "CONFIRMED", description: "[coverage-agent] fuel" },
    { cost_id: "manual-lumper", charge_code: "LUM", amount: 20, status: "CONFIRMED", description: "manual charge" },
  ] };
  const writes: string[] = [];
  const source = createTmsClient({ baseUrl: "https://example.invalid", apiKey: "test-only", now: () => new Date("2026-11-13T19:00:00Z"), fetch: async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (init?.method === "GET") return json(state);
    writes.push(path);
    if (path.endsWith("/uncover")) state.status = "BOOKED";
    if (path.endsWith("/agent-fuel")) state.vendor_costs[0].status = "CANCELLED";
    return json({});
  } });
  assert.equal((await resetShipment("7300176", { source })).ok, true);
  assert.deepEqual(writes, []);
  assert.equal((await resetShipment("7300176", { source, execute: true })).ok, true);
  assert.equal(state.vendor_costs[1].status, "CONFIRMED");
  assert.equal(writes.length, 2);
  writes.length = 0;
  assert.equal((await resetShipment("7300176", { source, execute: true })).ok, true);
  assert.equal(writes.length, 0);
});

test("reset stops after the first failed cost cancellation and reports partial progress", async () => {
  const writes: string[] = [];
  const source = createTmsClient({ baseUrl: "https://example.invalid", apiKey: "test-only", now: () => new Date("2026-11-13T19:00:00Z"), fetch: async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (init?.method === "GET") return json({ shipment_id: shipment.id, status: "BOOKED", vendor_costs: ["a", "b"].map(cost_id => ({ cost_id, charge_code: "FSC", amount: 10, status: "CONFIRMED", description: "[coverage-agent] fuel" })) });
    writes.push(path); return json({ error: "CONFLICT" }, 409);
  } });
  const result = await resetShipment(shipment.id, { source, execute: true });
  assert.equal(result.ok, false); assert.equal(writes.length, 1);
  if (!result.ok) assert.equal((result.detail as { failedCostId: string }).failedCostId, "a");
});
