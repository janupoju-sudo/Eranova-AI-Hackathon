"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentEvent } from "@/lib/types";
import type { RunStatus } from "./useReplay";

// Reads newline-delimited JSON (one AgentEvent per line). Not SSE: use fetch + getReader, not EventSource.
async function readNdjson(res: Response, onEvent: (e: AgentEvent) => void) {
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${text ? ` ${text.slice(0, 200)}` : ""}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const flush = (line: string) => {
    const t = line.trim();
    if (t) onEvent(JSON.parse(t) as AgentEvent);
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      flush(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  }
  flush(buf);
}

export function useLiveRun() {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const runIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stream = useCallback(async (url: string, body: unknown) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    let finished = false;
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ac.signal });
      await readNdjson(res, (e) => {
        if (ac.signal.aborted) return;
        setEvents((prev) => [...prev, e]);
        if (e.type === "approval_needed") { runIdRef.current = e.runId; setStatus("awaiting"); finished = true; }
        if (e.type === "done") { setStatus("done"); finished = true; }
      });
      if (!finished && !ac.signal.aborted) { setError("The stream ended before the agent finished."); setStatus("error"); }
    } catch (err) {
      if (ac.signal.aborted) return;
      setError(`Backend call failed: ${err instanceof Error ? err.message : String(err)}`);
      setStatus("error");
    }
  }, []);

  const start = useCallback((shipmentId?: string) => {
    setEvents([]);
    setError(null);
    runIdRef.current = null;
    setStatus("running");
    void stream("/api/run", shipmentId ? { shipmentId } : {});
  }, [stream]);

  const decide = useCallback((approved: boolean) => {
    const runId = runIdRef.current;
    if (!runId) return;
    setStatus("running");
    void stream("/api/approve", { runId, decision: approved ? "approved" : "rejected" });
  }, [stream]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    runIdRef.current = null;
    setEvents([]);
    setError(null);
    setStatus("idle");
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { events, status, error, start, reset, approve: () => decide(true), reject: () => decide(false) };
}
