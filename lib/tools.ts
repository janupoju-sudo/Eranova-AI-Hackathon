// Coverage Agent tools (PRD §9.4). Owner: Jay.
//
// Plain code enforces every limit here — the LLM only chooses which tool to call.
//   - No offer or cover above brief.margin.maxLinehaul unless a human approved a higher amount.
//   - No cover at a price/carrier that wasn't actually agreed in negotiation.
//   - Cost-line amounts (FSC, LUM) come from the LoadBrief, never from the model.
//   - Appointment windows must sit inside the delivery window, on/before MABD.
// Every tool returns { ok: true, result } or { ok: false, error, detail } — nothing throws into the loop.

import { tool } from "ai";
import { z } from "zod";
import type { AgentEvent, LoadBrief, Money } from "./types";

// ---------- Dependency contract (implemented by lib/tms.ts, lib/intel.ts, lib/carrierSim.ts) ----------

export type TmsResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; detail: string };

export interface CarrierReply {
  accept: boolean;
  counter?: number;
  text: string;
  driver?: { name: string; phone: string };
}

export interface NegotiationTurn {
  from: "broker" | "carrier";
  text: string;
  amount?: Money;
}

export interface ToolDeps {
  loadBrief(shipmentId: string): Promise<LoadBrief>;
  carrier: {
    respond(carrierId: string, offer: Money, history: NegotiationTurn[], brief: LoadBrief): Promise<CarrierReply>;
  };
  tms: {
    cover(id: string, body: Record<string, unknown>): Promise<TmsResult>;
    addCost(id: string, body: Record<string, unknown>): Promise<TmsResult>;
    generateRateCon(id: string): Promise<TmsResult>;
    setAppointment(id: string, stopSeq: number, body: Record<string, unknown>): Promise<TmsResult>;
    addShipmentNote(id: string, body: Record<string, unknown>): Promise<TmsResult>;
  };
}

// ---------- Per-run state ----------

export interface Deal {
  carrierId: string;
  amount: Money;
  driver?: { name: string; phone: string };
}

export interface RunState {
  runId: string;
  shipmentId: string;
  brief: LoadBrief | null;
  /** Linehaul ceiling raised by a human approval (null = use brief.margin.maxLinehaul). */
  approvedLinehaul: Money | null;
  approvalPending: { carrierId: string; reason: string; numbers: Record<string, Money | number> } | null;
  negotiations: Record<string, NegotiationTurn[]>;
  deals: Record<string, Deal>;
  coveredBy: Deal | null;
  failedCarriers: Record<string, string>; // carrierId -> reason (e.g. 409 detail)
  escalation: string | null;
}

export function newRunState(runId: string, shipmentId: string): RunState {
  return {
    runId,
    shipmentId,
    brief: null,
    approvedLinehaul: null,
    approvalPending: null,
    negotiations: {},
    deals: {},
    coveredBy: null,
    failedCarriers: {},
    escalation: null,
  };
}

export interface ToolContext {
  deps: ToolDeps;
  state: RunState;
  emit: (e: AgentEvent) => void;
  /** When false, TMS write tools return a simulated success instead of calling the TMS (read-only phase). */
  writesEnabled: boolean;
}

type ToolOut = { ok: true; result: unknown } | { ok: false; error: string; detail: string };

const MAX_ROUNDS_PER_CARRIER = 3;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function ceiling(state: RunState): Money {
  if (!state.brief) return 0;
  return state.approvedLinehaul ?? state.brief.margin.maxLinehaul;
}

function fail(error: string, detail: string): ToolOut {
  return { ok: false, error, detail };
}

function fromTms(r: TmsResult, summarize?: (data: unknown) => unknown): ToolOut {
  if (r.ok) return { ok: true, result: summarize ? summarize(r.data) : r.data };
  return { ok: false, error: `${r.status} ${r.error}`, detail: r.detail };
}

/** Keep TMS shipment payloads small for the model's context. */
function shipmentSummary(data: unknown) {
  const s = (data ?? {}) as Record<string, unknown>;
  const shipment = (s.shipment ?? s) as Record<string, unknown>;
  return {
    shipment_id: shipment.shipment_id,
    status: shipment.status,
    sell_total: shipment.sell_total,
    buy_total: shipment.buy_total,
    gp_amount: shipment.gp_amount,
    gp_pct: shipment.gp_pct,
    rate_con_number: shipment.rate_con_number,
  };
}

/** Wrap a tool body so every call/result is streamed to the UI and nothing throws. */
function traced<A>(ctx: ToolContext, name: string, fn: (args: A) => Promise<ToolOut>) {
  return async (args: A): Promise<ToolOut> => {
    ctx.emit({ type: "tool_call", name, args });
    let out: ToolOut;
    try {
      out = await fn(args);
    } catch (err) {
      out = fail("tool_exception", err instanceof Error ? err.message : String(err));
    }
    ctx.emit({ type: "tool_result", name, ok: out.ok, result: out.ok ? out.result : { error: out.error, detail: out.detail } });
    return out;
  };
}

function dryRun(action: string, payload: Record<string, unknown>): ToolOut {
  return { ok: true, result: { dryRun: true, action, payload, note: "TMS writes disabled (read-only phase); not sent." } };
}

// ---------- Tools ----------

export function createTools(ctx: ToolContext) {
  const { deps, state, emit } = ctx;

  const requireBrief = (): LoadBrief | null => state.brief;
  const NO_BRIEF = fail("no_brief", "Call get_load_brief first.");

  return {
    get_load_brief: tool({
      description:
        "Fetch the full economics + risk brief for a load: sell lines, facility rules, expected lumper/detention, lane history, market rate, margin ceiling (maxLinehaul) and ranked carriers. Call this first. All money figures are pre-computed — use them as-is.",
      inputSchema: z.object({ shipment_id: z.string() }),
      execute: traced(ctx, "get_load_brief", async ({ shipment_id }: { shipment_id: string }) => {
        if (shipment_id !== state.shipmentId) {
          return fail("wrong_shipment", `This run is for shipment ${state.shipmentId}.`);
        }
        const brief = await deps.loadBrief(shipment_id);
        state.brief = brief;
        return { ok: true, result: brief };
      }),
    }),

    negotiate: tool({
      description:
        "Send a linehaul offer (USD, excluding fuel and lumper) to a carrier and get their reply. The system rejects offers above the current ceiling (maxLinehaul, or the human-approved amount). Max 3 rounds per carrier.",
      inputSchema: z.object({
        carrier_id: z.string(),
        offer: z.number().positive().describe("Linehaul offer in USD"),
        message: z.string().describe("Short message to the carrier rep"),
      }),
      execute: traced(ctx, "negotiate", async ({ carrier_id, offer, message }: { carrier_id: string; offer: number; message: string }) => {
        const brief = requireBrief();
        if (!brief) return NO_BRIEF;
        const cand = brief.carriers.find((c) => c.vendorId === carrier_id);
        if (!cand) return fail("unknown_carrier", `${carrier_id} is not in the brief's carrier list.`);
        if (!cand.eligible) {
          return fail("ineligible_carrier", `${carrier_id} is not eligible (${cand.status}; ${cand.warnings.join("; ") || "equipment mismatch"}). Pick another carrier.`);
        }
        if (state.failedCarriers[carrier_id]) {
          return fail("carrier_blocked", `${carrier_id} already failed: ${state.failedCarriers[carrier_id]}`);
        }
        offer = round2(offer);
        const cap = ceiling(state);
        if (offer > cap) {
          return fail(
            "over_ceiling",
            `Offer $${offer.toFixed(2)} exceeds the linehaul ceiling $${cap.toFixed(2)}` +
              (state.approvedLinehaul == null ? " (18% margin floor). To go higher, call request_approval with the carrier's best price." : " approved by the human."),
          );
        }
        const history = (state.negotiations[carrier_id] ??= []);
        const brokerRounds = history.filter((t) => t.from === "broker").length;
        if (brokerRounds >= MAX_ROUNDS_PER_CARRIER) {
          return fail("max_rounds", `Already ${MAX_ROUNDS_PER_CARRIER} rounds with ${carrier_id}. Their last counter stands; move on or request approval.`);
        }

        const brokerTurn: NegotiationTurn = { from: "broker", text: message, amount: offer };
        history.push(brokerTurn);
        emit({ type: "negotiation", carrierId: carrier_id, ...brokerTurn });

        const reply = await deps.carrier.respond(carrier_id, offer, history.slice(0, -1), brief);
        const carrierTurn: NegotiationTurn = { from: "carrier", text: reply.text, amount: reply.accept ? offer : reply.counter };
        history.push(carrierTurn);
        emit({ type: "negotiation", carrierId: carrier_id, ...carrierTurn });

        if (reply.accept) {
          state.deals[carrier_id] = { carrierId: carrier_id, amount: offer, driver: reply.driver };
        }
        return {
          ok: true,
          result: {
            accepted: reply.accept,
            agreedLinehaul: reply.accept ? offer : undefined,
            counter: reply.counter,
            carrierSays: reply.text,
            roundsUsed: brokerRounds + 1,
            ceiling: cap,
            counterAboveCeiling: reply.counter != null ? reply.counter > cap : undefined,
          },
        };
      }),
    }),

    cover: tool({
      description:
        "Assign the carrier to the load in the TMS at the agreed linehaul (POST /cover). Only works for a carrier that accepted in negotiate at exactly that amount. The TMS may reject with 409 (e.g. expired insurance) — read the detail and adapt.",
      inputSchema: z.object({
        shipment_id: z.string(),
        carrier_id: z.string(),
        amount: z.number().positive(),
      }),
      execute: traced(ctx, "cover", async ({ shipment_id, carrier_id, amount }: { shipment_id: string; carrier_id: string; amount: number }) => {
        const brief = requireBrief();
        if (!brief) return NO_BRIEF;
        if (shipment_id !== state.shipmentId) return fail("wrong_shipment", `This run is for shipment ${state.shipmentId}.`);
        if (state.coveredBy) return fail("already_covered", `Already covered by ${state.coveredBy.carrierId}.`);
        const deal = state.deals[carrier_id];
        if (!deal) return fail("no_deal", `${carrier_id} has not accepted an offer. Negotiate first.`);
        amount = round2(amount);
        if (Math.abs(deal.amount - amount) > 0.01) {
          return fail("amount_mismatch", `${carrier_id} agreed to $${deal.amount.toFixed(2)}, not $${amount.toFixed(2)}.`);
        }
        const cap = ceiling(state);
        if (amount > cap) return fail("over_ceiling", `$${amount.toFixed(2)} exceeds ceiling $${cap.toFixed(2)}. Request approval first.`);

        const body: Record<string, unknown> = {
          carrier_id,
          amount,
          driver_name: deal.driver?.name,
          driver_phone: deal.driver?.phone,
          target_pay_max: brief.margin.maxLinehaul,
        };
        if (!ctx.writesEnabled) {
          state.coveredBy = deal;
          return dryRun("cover", body);
        }
        const r = await deps.tms.cover(shipment_id, body);
        if (!r.ok) {
          if (r.status === 409 || r.status === 404) state.failedCarriers[carrier_id] = r.detail;
          return fromTms(r);
        }
        state.coveredBy = deal;
        return fromTms(r, shipmentSummary);
      }),
    }),

    add_cost: tool({
      description:
        "Add a carrier-side cost line after covering. charge_code FSC = carrier fuel (vendor = the covering carrier), LUM = expected lumper (vendor DOCKHANDS). Amounts are filled from the brief automatically; do not invent them.",
      inputSchema: z.object({
        shipment_id: z.string(),
        charge_code: z.enum(["FSC", "LUM"]),
        description: z.string().optional(),
      }),
      execute: traced(ctx, "add_cost", async ({ shipment_id, charge_code, description }: { shipment_id: string; charge_code: "FSC" | "LUM"; description?: string }) => {
        const brief = requireBrief();
        if (!brief) return NO_BRIEF;
        if (shipment_id !== state.shipmentId) return fail("wrong_shipment", `This run is for shipment ${state.shipmentId}.`);
        if (!state.coveredBy) return fail("not_covered", "Cover the load before adding carrier cost lines.");
        const body =
          charge_code === "FSC"
            ? {
                vendor_id: state.coveredBy.carrierId,
                charge_code: "FSC",
                amount: brief.margin.carrierFuel$,
                status: "CONFIRMED",
                description: description ?? `Carrier fuel surcharge (${brief.lane.miles} mi)`,
              }
            : {
                vendor_id: "DOCKHANDS",
                charge_code: "LUM",
                amount: brief.risk.expectedLumper$,
                status: "ESTIMATED",
                description: description ?? `Expected lumper at ${brief.facility.id} (lane history / facility range)`,
              };
        if (!ctx.writesEnabled) return dryRun("add_cost", body);
        return fromTms(await deps.tms.addCost(shipment_id, body), shipmentSummary);
      }),
    }),

    generate_rate_con: tool({
      description: "Generate the carrier rate confirmation PDF in the TMS (required before dispatch). Call after covering.",
      inputSchema: z.object({ shipment_id: z.string() }),
      execute: traced(ctx, "generate_rate_con", async ({ shipment_id }: { shipment_id: string }) => {
        if (shipment_id !== state.shipmentId) return fail("wrong_shipment", `This run is for shipment ${state.shipmentId}.`);
        if (!state.coveredBy) return fail("not_covered", "Cover the load first.");
        if (!ctx.writesEnabled) return dryRun("generate_rate_con", { doc_type: "RATE_CONFIRMATION" });
        return fromTms(await deps.tms.generateRateCon(shipment_id), (d) => {
          const doc = ((d ?? {}) as Record<string, unknown>).doc as Record<string, unknown> | undefined;
          return { doc: doc && { doc_id: doc.doc_id, file_name: doc.file_name }, ...shipmentSummary(d) };
        });
      }),
    }),

    request_appointment: tool({
      description:
        "Request a delivery appointment (status REQUESTED; a human books it in the facility portal). Window is facility-local, format YYYY-MM-DDTHH:MM:SS. Must be inside the delivery window and on or before MABD. Never handle portal credentials.",
      inputSchema: z.object({
        shipment_id: z.string(),
        stop_seq: z.number().int().positive(),
        earliest_local: z.string(),
        latest_local: z.string(),
      }),
      execute: traced(ctx, "request_appointment", async (a: { shipment_id: string; stop_seq: number; earliest_local: string; latest_local: string }) => {
        const brief = requireBrief();
        if (!brief) return NO_BRIEF;
        if (a.shipment_id !== state.shipmentId) return fail("wrong_shipment", `This run is for shipment ${state.shipmentId}.`);
        const dw = brief.deliveryWindow;
        const norm = (s: string) => s.slice(0, 19);
        const e = norm(a.earliest_local), l = norm(a.latest_local);
        if (e > l) return fail("bad_window", "earliest_local is after latest_local.");
        if (e < norm(dw.start)) return fail("too_early", `Window starts before the delivery window ${dw.start} — early delivery is non-compliant at this dock.`);
        if (l > norm(dw.end)) return fail("too_late", `Window ends after the delivery window ${dw.end}.`);
        if (brief.mabdDate && l.slice(0, 10) > brief.mabdDate) return fail("after_mabd", `Window ends after MABD ${brief.mabdDate}.`);
        const body = { status: "REQUESTED", scheduled_window: { earliest_local: e, latest_local: l, timezone: dw.tz } };
        if (!ctx.writesEnabled) return dryRun("request_appointment", { stop_seq: a.stop_seq, ...body });
        return fromTms(await deps.tms.setAppointment(a.shipment_id, a.stop_seq, body), shipmentSummary);
      }),
    }),

    add_note: tool({
      description: "Write an internal note on the load in the TMS explaining your decisions (carrier choice, price vs ceiling, risks priced in, errors recovered from).",
      inputSchema: z.object({ shipment_id: z.string(), text: z.string().min(10) }),
      execute: traced(ctx, "add_note", async ({ shipment_id, text }: { shipment_id: string; text: string }) => {
        if (shipment_id !== state.shipmentId) return fail("wrong_shipment", `This run is for shipment ${state.shipmentId}.`);
        const note = `[Coverage Agent] ${text}`;
        if (!ctx.writesEnabled) return dryRun("add_note", { note });
        return fromTms(await deps.tms.addShipmentNote(shipment_id, { note, visibility: "INTERNAL" }), (d) => {
          const ev = (d ?? {}) as Record<string, unknown>;
          return { event_id: ev.event_id ?? ev.id, saved: true };
        });
      }),
    }),

    request_approval: tool({
      description:
        "Pause and ask a human to approve a linehaul above the margin ceiling. Provide the carrier, its best price, and why. The run stops here until the human decides.",
      inputSchema: z.object({
        carrier_id: z.string(),
        offer: z.number().positive().describe("The linehaul you want approved (carrier's best price)"),
        reason: z.string(),
      }),
      execute: traced(ctx, "request_approval", async ({ carrier_id, offer, reason }: { carrier_id: string; offer: number; reason: string }) => {
        const brief = requireBrief();
        if (!brief) return NO_BRIEF;
        offer = round2(offer);
        const sell = brief.sell.total;
        const buyTotal = round2(offer + brief.margin.carrierFuel$ + brief.risk.expectedLumper$);
        const gpPct = sell > 0 ? round2(((sell - buyTotal) / sell) * 100) : 0;
        const numbers: Record<string, Money | number> = {
          offer,
          maxLinehaul: brief.margin.maxLinehaul,
          overCeiling: round2(offer - brief.margin.maxLinehaul),
          sell,
          buyTotal,
          resultingGpPct: gpPct,
          floorPct: brief.margin.floorPct,
          expectedDetention: brief.risk.expectedDetention$,
        };
        const fullReason = `${carrier_id}: ${reason}`;
        state.approvalPending = { carrierId: carrier_id, reason: fullReason, numbers };
        emit({ type: "approval_needed", runId: state.runId, reason: fullReason, numbers });
        return { ok: true, result: { status: "PAUSED_FOR_HUMAN", numbers } };
      }),
    }),

    escalate_to_sales: tool({
      description: "Send sales a lane repricing recommendation (also saved as a note on the load). Use when the margin floor is unreachable at market/historical carrier rates.",
      inputSchema: z.object({ shipment_id: z.string(), text: z.string().min(20) }),
      execute: traced(ctx, "escalate_to_sales", async ({ shipment_id, text }: { shipment_id: string; text: string }) => {
        if (shipment_id !== state.shipmentId) return fail("wrong_shipment", `This run is for shipment ${state.shipmentId}.`);
        state.escalation = text;
        const note = `[Coverage Agent → Sales] Lane repricing recommendation: ${text}`;
        if (!ctx.writesEnabled) return dryRun("escalate_to_sales", { note });
        const r = await deps.tms.addShipmentNote(shipment_id, { note, visibility: "INTERNAL" });
        return r.ok ? { ok: true, result: { escalated: true, savedAsNote: true } } : fromTms(r);
      }),
    }),
  };
}

export type CoverageTools = ReturnType<typeof createTools>;

