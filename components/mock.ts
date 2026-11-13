// Demo mode replays a recorded LIVE run against the Meridian TMS (hero 7300176), so Demo matches Live exactly:
// brief → negotiation → RUSTYRIG 409 → approval → approve (or reject) → cover, costs, rate con, appointment, notes.
// Re-record by saving the NDJSON from POST /api/run and /api/approve into demoRun.json.
import type { AgentEvent } from "@/lib/types";
import type { QueueLoad } from "./useQueue";
import run from "./demoRun.json";

export const queue: QueueLoad[] = run.queue;
export const preApproval = run.pre as AgentEvent[];
export const postApproval = run.post as AgentEvent[];
export const afterReject = run.reject as AgentEvent[];

export const eventDelay = (e: AgentEvent): number => {
  switch (e.type) {
    case "thought": return 1500;
    case "tool_call": return 500;
    case "tool_result": return 700;
    case "negotiation": return e.from === "broker" ? 800 : 1200;
    default: return 800;
  }
};
