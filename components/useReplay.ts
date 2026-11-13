"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentEvent } from "@/lib/types";
import { afterReject, eventDelay, postApproval, preApproval } from "./mock";

export type RunStatus = "idle" | "running" | "awaiting" | "done" | "error";

// Replays scripted events with timing. Replace the source with the SSE stream from /api/run when it exists;
// approve/reject then become POST /api/approve.
export function useReplay() {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [pending, setPending] = useState<AgentEvent[]>([]);
  const [status, setStatus] = useState<RunStatus>("idle");

  // Each step is one timeout; changing status or the queue cancels it, so reset can never leave a stray timer.
  useEffect(() => {
    if (status !== "running" || pending.length === 0) return;
    const next = pending[0];
    const t = setTimeout(() => {
      setEvents((prev) => [...prev, next]);
      setPending((prev) => prev.slice(1));
      if (next.type === "approval_needed") setStatus("awaiting");
      else if (next.type === "done") setStatus("done");
    }, eventDelay(next));
    return () => clearTimeout(t);
  }, [status, pending]);

  const start = useCallback(() => {
    setEvents([]);
    setPending([...preApproval]);
    setStatus("running");
  }, []);

  const decide = useCallback((approved: boolean) => {
    setPending([...(approved ? postApproval : afterReject)]);
    setStatus("running");
  }, []);

  const reset = useCallback(() => {
    setEvents([]);
    setPending([]);
    setStatus("idle");
  }, []);

  return { events, status, error: null as string | null, start, reset, approve: () => decide(true), reject: () => decide(false) };
}
