// Coverage Agent loop (PRD §9.5 + §9.6). Owner: Jay.
//
// The model makes judgment calls (which carrier, how to negotiate, how to recover from errors,
// how to explain itself). lib/tools.ts enforces every money and compliance limit in code.
// A run pauses when the model calls request_approval; /api/approve resumes it.

import { generateText, hasToolCall, isStepCount, type ModelMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import type { AgentEvent, Money } from "./types";
import { createTools, newRunState, type RunState, type ToolDeps } from "./tools";

const MAX_STEPS = 24;

export const SYSTEM_PROMPT = `You are the Coverage Agent for Meridian Logistics, a freight broker. You cover BOOKED truckload shipments by hiring a carrier, the way the best carrier-sales rep would: you price the WHOLE load — linehaul, carrier fuel, the receiving dock's lumper, detention and chargeback risk — not just the truck.

Rules (non-negotiable):
1. Call get_load_brief first. Reason only from its numbers. Never compute money yourself — sell, maxLinehaul, carrierFuel$, expectedLumper$, expectedDetention$ and history are pre-computed by code.
2. Never offer above margin.maxLinehaul unless a human approved a higher amount. The system will reject it anyway.
3. At docks with chargeback / OTIF programs, value reliability (on-time delivery %) over the cheapest rate. Carrier "warnings" are advisory; the TMS is the final authority on compliance.
4. On any tool error, read "detail", say in one sentence what happened, and adapt (e.g. a 409 on cover means that carrier cannot haul it — move to the next best carrier). Never retry the exact same failing call.
5. Negotiate before escalating: open below maxLinehaul, and when a carrier counters above the ceiling, counter back AT maxLinehaul once, then move on (max 3 rounds per carrier; never repeat the same offer). Try the top 3 eligible carriers before asking for approval. If any carrier accepts at or below maxLinehaul, cover it — no approval needed. Only if no carrier accepts within the ceiling, call request_approval with the best carrier's best price and a clear reason. Then stop and wait. Later, call escalate_to_sales with a lane repricing recommendation that cites lane history GP% vs the floor.
6. After covering: add_cost FSC, add_cost LUM, generate_rate_con, request_appointment for the delivery stop (inside the delivery window, not early, on or before MABD — prefer a morning window inside receiving hours), then add_note explaining every decision: carrier chosen and why, price vs ceiling, risks priced in (lumper, expected detention, dock notes), any errors you recovered from.
7. Never ask for, store or handle facility portal credentials. A human books the portal appointment.

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
    state: newRunState(runId, shipmentId),
    messages: [{ role: "user", content: `Cover shipment ${shipmentId}. Run id ${runId}.` }],
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
  const offer = Number(pending.numbers.offer);
  let text: string;
  if (decision === "approved") {
    run.state.approvedLinehaul = offer; // code-enforced new ceiling, exactly what the human saw
    text =
      `Human APPROVED a linehaul of up to $${offer.toFixed(2)} for ${pending.carrierId} (resulting GP ${pending.numbers.resultingGpPct}%). ` +
      `Close the deal with negotiate at that amount, then cover and finish the post-cover steps. Then escalate_to_sales.`;
  } else {
    text =
      `Human REJECTED going above the $${run.state.brief?.margin.maxLinehaul.toFixed(2)} ceiling. Do not cover. ` +
      `Write a note explaining why the load is still open, and escalate_to_sales with the repricing case.`;
  }
  if (note) text += ` Human note: ${note}`;
  opts.emit({ type: "thought", text: decision === "approved" ? `✅ ${text}` : `⛔ ${text}` });
  run.messages.push({ role: "user", content: text });
  run.status = "running";
  await loop(run, opts);
  return run;
}

async function loop(run: StoredRun, opts: RunOptions) {
  const { state } = run;
  const tools = createTools({ deps: opts.deps, state, emit: opts.emit, writesEnabled: opts.writesEnabled });
  try {
    const result = await generateText({
      model: model(),
      system: SYSTEM_PROMPT,
      messages: run.messages,
      tools,
      temperature: 0.2,
      // One call per step so the model sees a cover 409 before firing cost lines / rate con.
      providerOptions: { openai: { parallelToolCalls: false } },
      stopWhen: [isStepCount(MAX_STEPS), hasToolCall("request_approval")],
      onStepEnd: (step) => {
        const text = step.text?.trim();
        if (text) opts.emit({ type: "thought", text });
      },
    });
    run.messages.push(...result.responseMessages);

    if (state.approvalPending) {
      run.status = "awaiting_approval";
      return; // approval_needed already emitted by the tool
    }
    run.status = "done";
    opts.emit({ type: "done", summary: result.text?.trim() || summarize(state), protected$: protectedDollars(state) });
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

/**
 * Header counter: dock costs priced into the buy that a truck-only rep would have missed
 * (lumper + expected detention), plus overpay avoided vs the lane's historical linehaul.
 * TODO(Akshaya): move into lib/intel.ts if you'd rather own this number.
 */
function protectedDollars(s: RunState): Money | undefined {
  const b = s.brief;
  if (!b || !s.coveredBy) return undefined;
  const dock = b.risk.expectedLumper$ + b.risk.expectedDetention$;
  const hist = b.laneHistory.avgLinehaulPerMile != null ? b.laneHistory.avgLinehaulPerMile * b.lane.miles : null;
  const avoided = hist != null ? Math.max(0, hist - s.coveredBy.amount) : 0;
  return Math.round((dock + avoided) * 100) / 100;
}
