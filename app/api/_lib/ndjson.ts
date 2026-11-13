import type { AgentEvent } from "@/lib/types";

/** Stream AgentEvents to the browser as newline-delimited JSON (one event per line). */
export function ndjsonStream(work: (emit: (e: AgentEvent) => void) => Promise<void>): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: AgentEvent) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        } catch {
          /* client disconnected */
        }
      };
      try {
        await work(emit);
      } catch (err) {
        emit({ type: "done", summary: `Server error: ${err instanceof Error ? err.message : String(err)}` });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
