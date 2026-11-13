// Guardrail tests for lib/tools.ts: no network, fake TMS + scripted carriers.
import assert from "node:assert/strict";
import test from "node:test";
import hero from "./loadBrief.hero.json";
import type { AgentEvent, LoadBrief } from "../lib/types";
import { createTools, decisionNote, newRunState, uncontactedCarriers, type CarrierReply, type ToolDeps } from "../lib/tools";

type Out = { ok: true; result: Record<string, unknown> } | { ok: false; error: string; detail: string };
const brief = hero as LoadBrief;
const QUOTES: Record<string, number> = { GULFSTRMX: 2276, PRAIRIEHL: 2289, LAKESHORE: 2327, RUSTYRIG: 1900 };

function setup(opts: { appointmentFails?: boolean } = {}) {
  const state = newRunState("run_test", brief.shipmentId, "auto");
  const okRes = { ok: true as const, result: {} };
  const deps: ToolDeps = {
    loadBrief: async () => ({ ok: true, result: structuredClone(brief) }),
    carrier: {
      respond: async (id, offer): Promise<CarrierReply> =>
        offer >= QUOTES[id] ? { accept: true, text: "ok", driver: { name: "D", phone: "1" } } : { accept: false, counter: QUOTES[id], text: "no" },
    },
    tms: {
      cover: async (_id, body) =>
        (body as { carrier_id: string }).carrier_id === "RUSTYRIG"
          ? { ok: false, status: 409, error: "CONFLICT", detail: { detail: "Carrier RUSTYRIG cargo insurance expired 2026-09-29" } }
          : okRes,
      addCost: async () => okRes,
      generateRateCon: async () => okRes,
      setAppointment: async () => (opts.appointmentFails ? { ok: false, status: 409, error: "CONFLICT", detail: { detail: "lead time" } } : okRes),
      addShipmentNote: async () => okRes,
    },
  };
  const events: AgentEvent[] = [];
  const tools = createTools({ deps, state, emit: (e) => events.push(e), writesEnabled: true });
  const call = (name: keyof typeof tools, args: unknown) =>
    (tools[name].execute as unknown as (a: unknown, o: unknown) => Promise<Out>)(args, {});
  return { state, call, events };
}

const id = brief.shipmentId;

test("approval must be the carrier's real price, a live carrier, and the lowest risk-adjusted buy", async () => {
  const { state, call } = await (async () => setup())();
  await call("get_load_brief", { shipment_id: id });
  const max = state.brief!.margin.maxLinehaul;
  for (const c of ["GULFSTRMX", "PRAIRIEHL", "LAKESHORE"]) await call("negotiate", { carrier_id: c, offer: max, message: "m" });

  let r = await call("request_approval", { carrier_id: "CANYONFRT", offer: 2300, reason: "r" });
  assert.equal(!r.ok && r.error, "no_quote");
  r = await call("request_approval", { carrier_id: "GULFSTRMX", offer: 2500, reason: "r" });
  assert.equal(!r.ok && r.error, "not_their_price");
  // LAKESHORE and GULFSTRMX are both 93% on time; LAKESHORE is $51 dearer, so code refuses it and names GULFSTRMX.
  r = await call("request_approval", { carrier_id: "LAKESHORE", offer: 2327, reason: "more reliable" });
  assert.equal(!r.ok && r.error, "not_best_risk_adjusted");
  assert.match(!r.ok ? r.detail : "", /GULFSTRMX/);
  r = await call("request_approval", { carrier_id: "GULFSTRMX", offer: 2276, reason: "lowest risk-adjusted" });
  assert.equal(r.ok, true);
  assert.equal(state.approvalPending?.numbers.riskAdjustedBuy, 2276 + 105);
});

test("a failed carrier cannot be put up for approval", async () => {
  const { state, call } = setup();
  await call("get_load_brief", { shipment_id: id });
  await call("negotiate", { carrier_id: "RUSTYRIG", offer: 1950, message: "m" });
  const cover = await call("cover", { shipment_id: id, carrier_id: "RUSTYRIG", amount: 1950 });
  assert.equal(cover.ok, false);
  assert.ok(state.failedCarriers.RUSTYRIG);
  const r = await call("request_approval", { carrier_id: "RUSTYRIG", offer: 1950, reason: "r" });
  assert.equal(!r.ok && r.error, "carrier_blocked");
});

test("an over-ceiling approval covers only the approved carrier", async () => {
  const { state, call } = setup();
  await call("get_load_brief", { shipment_id: id });
  // Human approved GULFSTRMX at 2276 (what agent.resumeRun sets).
  state.approvedLinehaul = 2276;
  state.approvedCarrier = "GULFSTRMX";
  // Another carrier accepting under the raised ceiling but over the floor ceiling is still refused.
  state.deals.PRAIRIEHL = { carrierId: "PRAIRIEHL", amount: 2270 };
  let r = await call("cover", { shipment_id: id, carrier_id: "PRAIRIEHL", amount: 2270 });
  assert.equal(!r.ok && r.error, "approval_required");
  await call("negotiate", { carrier_id: "GULFSTRMX", offer: 2276, message: "m" });
  r = await call("cover", { shipment_id: id, carrier_id: "GULFSTRMX", amount: 2276 });
  assert.equal(r.ok, true);
});

test("the note claims an appointment only if the TMS accepted it, and 'declined' only after a real rejection", async () => {
  const { state, call } = setup({ appointmentFails: true });
  await call("get_load_brief", { shipment_id: id });
  const dw = state.brief!.deliveryWindow;
  const r = await call("request_appointment", { shipment_id: id, stop_seq: 2, earliest_local: dw.start, latest_local: dw.end });
  assert.equal(r.ok, false);
  assert.equal(state.appointment, null);
  await call("negotiate", { carrier_id: "GULFSTRMX", offer: 2000, message: "m" });
  assert.doesNotMatch(decisionNote(state, state.brief!, "why"), /declined|Appointment requested/);
  state.approvalDecision = { carrierId: "GULFSTRMX", decision: "rejected" };
  assert.match(decisionNote(state, state.brief!, "why"), /approval declined/);
});

test("looking for another carrier: only uncontacted, clean carriers; taking a carrier's own price is allowed after 3 rounds", async () => {
  const { state, call } = setup();
  await call("get_load_brief", { shipment_id: id });
  const max = state.brief!.margin.maxLinehaul;
  for (const c of ["LAKESHORE", "PRAIRIEHL", "GULFSTRMX"]) await call("negotiate", { carrier_id: c, offer: max, message: "m" });
  const fresh = uncontactedCarriers(state);
  assert.equal(fresh.length, 3);
  for (const c of fresh) {
    assert.ok(!["LAKESHORE", "PRAIRIEHL", "GULFSTRMX", "RUSTYRIG", "BADWOLF"].includes(c));
    assert.equal(state.brief!.carriers.find((x) => x.vendorId === c)!.warnings.length, 0);
  }
  // Three rounds used with GULFSTRMX; a fourth haggling offer is refused, but meeting their $2,276 is not.
  await call("negotiate", { carrier_id: "GULFSTRMX", offer: max, message: "m" });
  await call("negotiate", { carrier_id: "GULFSTRMX", offer: max, message: "m" });
  let r = await call("negotiate", { carrier_id: "GULFSTRMX", offer: max, message: "m" });
  assert.equal(!r.ok && r.error, "max_rounds");
  state.approvedLinehaul = 2276;
  state.approvedCarrier = "GULFSTRMX";
  r = await call("negotiate", { carrier_id: "GULFSTRMX", offer: 2276, message: "m" });
  assert.equal(r.ok && r.result.accepted, true);
});
