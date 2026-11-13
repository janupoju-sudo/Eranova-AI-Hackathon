// POST /api/approve { runId, decision: "approved" | "rejected", note? } → NDJSON stream continuing the run.
import { resumeRun, runs } from "@/lib/agent";
import { deps, writesEnabled } from "../_lib/deps";
import { ndjsonStream } from "../_lib/ndjson";

export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { runId?: string; decision?: string; note?: string };
  const { runId, decision, note } = body;
  if (!runId || (decision !== "approved" && decision !== "rejected")) {
    return Response.json({ error: "bad_request", detail: 'Send { runId, decision: "approved" | "rejected" }.' }, { status: 400 });
  }
  const run = runs.get(runId);
  if (!run) return Response.json({ error: "not_found", detail: `Unknown run ${runId} (server restarted?).` }, { status: 404 });
  if (run.status !== "awaiting_approval") {
    return Response.json({ error: "conflict", detail: `Run ${runId} is ${run.status}, not awaiting approval.` }, { status: 409 });
  }
  return ndjsonStream(async (emit) => {
    await resumeRun(runId, decision, { deps, emit, writesEnabled: writesEnabled() }, note);
  });
}
