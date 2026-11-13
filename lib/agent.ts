// Coverage Agent loop (PRD §9.5 + §9.6). Owner: Jay.
//
// The model makes judgment calls (which carrier, how to negotiate, how to recover from errors,
// how to explain itself). lib/tools.ts enforces every money and compliance limit in code.
// A run pauses when the model calls request_approval; /api/approve resumes it.

import { hasToolCall, isStepCount, streamText, type ModelMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import type { AgentEvent, Money } from "./types";
import { dockRiskPriced } from "./intel";
import { createTools, newRunState, type Autonomy, type RunState, type ToolDeps } from "./tools";

const MAX_STEPS = 24;

export const SYSTEM_PROMPT = `You are the Coverage Agent for Meridian Logistics, a freight broker. You cover BOOKED truckload shipments by hiring a carrier, the way the best carrier-sales rep would: you price the WHOLE load — linehaul, carrier fuel, the receiving dock's lumper, detention and chargeback risk — not just the truck.

Rules (non-negotiable):
1. Call get_load_brief first. Reason only from its numbers. Never compute money yourself — sell, maxLinehaul, carrierFuel$, expectedLumper$, expectedDetention$ and history are pre-computed by code.
2. Never offer above margin.maxLinehaul unless a human approved a higher amount. The system will reject it anyway.
3. At docks with chargeback / OTIF programs, reliability has a dollar value: each carrier's expectedChargeback$ is pre-computed from its on-time delivery %. Compare carriers on riskAdjustedBuy (price + expectedChargeback), not on price alone and not on adjectives. Carrier "warnings" are advisory; the TMS is the final authority on compliance.
4. On any tool error, read "detail", say in one sentence what happened, and adapt (e.g. a 409 on cover means that carrier cannot haul it — move to the next best carrier). Never retry the exact same failing call.
5. Collect quotes before deciding: the top 3 eligible carriers by score AND the eligible budget carrier (complianceLight YELLOW), every run. Open below maxLinehaul; when a carrier counters above the ceiling, counter back AT maxLinehaul once, then move on (max 3 rounds per carrier; never repeat an offer). Then cover the CHEAPEST carrier that accepted at or below maxLinehaul — no approval needed. Don't pre-judge carrier warnings: the TMS decides compliance at cover. If cover fails, cover the next-cheapest accepted carrier; if none accepted, counter the remaining quoted carriers AT maxLinehaul first (if you have not yet). Only if no carrier accepted within the ceiling, call request_approval for the carrier with the LOWEST riskAdjustedBuy (its latest price + its expectedChargeback, both returned by negotiate) at exactly its latest price, with a one-sentence reason that cites those numbers, then stop and wait. The system rejects any other carrier or price. Never claim a carrier is "more reliable" unless its on-time % is actually higher. When the floor is unreachable at historical rates, call escalate_to_sales at the end.
6. After covering: add_cost FSC, add_cost LUM, generate_rate_con, request_appointment for the delivery stop (inside the delivery window, not early, on or before MABD — prefer a morning window inside receiving hours), then add_note. The system writes the facts (carrier, price vs ceiling, buy breakdown, GP, errors recovered, appointment) — you give only a one-sentence "why" for the carrier choice. escalate_to_sales works the same way: one sentence of context; the numbers are filled in by code.
7. Autonomy is set in the first message. In "supervised" mode, call request_approval before EVERY cover (even within the ceiling) with the carrier and its accepted price, then stop and wait.
8. Never ask for, store or handle facility portal credentials. A human books the portal appointment.

Style: before each tool call, write one or two short sentences of reasoning (these are shown live to the user). Be concrete, use the brief's dollar figures. When everything is done, finish with a 2–3 sentence summary.`;

// ---------- Run store (single local server process; survives Next dev HMR via globalThis) ----------

export interface StoredRun {
  state: RunState;
  messages: ModelMessage[];
  status: "running" | "awaiting_approval" | "done" | "error";
}

const g = globalThis as unknown as { __coverageRuns?: Map<string, StoredRun> };
export const runs: Map<string, StoredRun> = (g.__coverageRuns ??= new Map());

export interface RunOptions {
  autonomy?: Autonomy;
  deps: ToolDeps;
  emit: (e: AgentEvent) => void;
  writesEnabled: boolean;
}

function model() {
  return openai(process.env.OPENAI_MODEL || "gpt-4o");
}

/** Start a fresh coverage run for one shipment. */
export async function startRun(shipmentId: string, opts: RunOptions): Promise<StoredRun> {
  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const run: StoredRun = {
    state: newRunState(runId, shipmentId, opts.autonomy),
    messages: [{ role: "user", content: `Cover shipment ${shipmentId}. Run id ${runId}. Autonomy: ${opts.autonomy ?? "auto"}.` }],
    status: "running",
  };
  runs.set(runId, run);
  await loop(run, opts);
  return run;
}

/** Resume a run paused at request_approval with the human's decision. */
export async function resumeRun(
  runId: string,
  decision: "approved" | "rejected",
  opts: RunOptions,
  note?: string,
): Promise<StoredRun> {
  const run = runs.get(runId);
  if (!run) throw new Error(`Unknown run ${runId}`);
  if (run.status !== "awaiting_approval" || !run.state.approvalPending) {
    throw new Error(`Run ${runId} is not awaiting approval (status ${run.status}).`);
  }
  const pending = run.state.approvalPending;
  run.state.approvalPending = null;
  run.state.approvalDecision = { carrierId: pending.carrierId, decision };
  const offer = Number(pending.numbers.offer);
  let text: string;
  if (decision === "approved") {
    run.state.approvedLinehaul = offer; // code-enforced new ceiling, exactly what the human saw
    run.state.approvedCarrier = pending.carrierId;
    text =
      `Human APPROVED a linehaul of up to $${offer.toFixed(2)} for ${pending.carrierId} (resulting GP ${pending.numbers.resultingGpPct}%). ` +
      (run.state.deals[pending.carrierId]?.amount === offer
        ? `${pending.carrierId} already accepted $${offer.toFixed(2)}: cover now, then finish the post-cover steps.`
        : `${pending.carrierId} has not accepted yet: negotiate at exactly $${offer.toFixed(2)}, then cover and finish the post-cover steps.`) +
      (run.state.brief && !run.state.brief.margin.floorReachableAtHistory ? " Then escalate_to_sales." : "");
  } else {
    text =
      `Human REJECTED going above the $${run.state.brief?.margin.maxLinehaul.toFixed(2)} ceiling. Do not cover. ` +
      `Write a note explaining why the load is still open, and escalate_to_sales with the repricing case.`;
  }
  if (note) text += ` Human note: ${note}`;
  opts.emit({
    type: "thought",
    text: decision === "approved"
      ? `✅ You approved ${pending.carrierId} at $${offer.toFixed(2)}.`
      : `⛔ You declined to go over the $${run.state.brief?.margin.maxLinehaul.toFixed(2)} ceiling. The load stays open.`,
  });
  run.messages.push({ role: "user", content: text });
  run.status = "running";
  await loop(run, opts);
  return run;
}

async function loop(run: StoredRun, opts: RunOptions) {
  const { state } = run;
  // Stream the model's reasoning so it reaches the feed BEFORE the tool call it explains.
  let pending = "";
  const flush = () => {
    const text = pending.trim();
    pending = "";
    if (text) opts.emit({ type: "thought", text });
  };
  const emit = (e: AgentEvent) => {
    if (e.type === "tool_call") flush();
    opts.emit(e);
  };
  const tools = createTools({ deps: opts.deps, state, emit, writesEnabled: opts.writesEnabled });
  let streamError: unknown = null;
  try {
    const result = streamText({
      model: model(),
      system: SYSTEM_PROMPT,
      messages: run.messages,
      tools,
      temperature: 0.2,
      // One call per step so the model sees a cover 409 before firing cost lines / rate con.
      providerOptions: { openai: { parallelToolCalls: false } },
      stopWhen: [isStepCount(MAX_STEPS), hasToolCall("request_approval")],
      onChunk: ({ chunk }) => {
        if (chunk.type === "text-delta") pending += chunk.text;
      },
      // The final step (no tool calls) becomes the done summary; don't also emit it as a thought.
      onStepEnd: (step) => (step.toolCalls.length ? flush() : void (pending = "")),
      onError: ({ error }) => {
        streamError = error;
      },
    });
    await result.consumeStream();
    if (streamError) throw streamError;
    run.messages.push(...(await result.responseMessages));
    const finalText = (await result.text)?.trim();

    if (state.approvalPending) {
      run.status = "awaiting_approval";
      return; // approval_needed already emitted by the tool
    }
    run.status = "done";
    opts.emit({ type: "done", summary: finalText || summarize(state), protected$: protectedDollars(state) });
  } catch (err) {
    run.status = "error";
    const msg = err instanceof Error ? err.message : String(err);
    opts.emit({ type: "thought", text: `Agent error: ${msg}` });
    opts.emit({ type: "done", summary: `Run stopped with an error: ${msg}` });
  }
}

function summarize(s: RunState): string {
  if (s.coveredBy) return `Covered ${s.shipmentId} with ${s.coveredBy.carrierId} at $${s.coveredBy.amount.toFixed(2)} linehaul.`;
  return `Shipment ${s.shipmentId} not covered.`;
}

function protectedDollars(s: RunState): Money | undefined {
  return s.brief && s.coveredBy ? dockRiskPriced(s.brief, s.coveredBy.carrierId) : undefined;
}
