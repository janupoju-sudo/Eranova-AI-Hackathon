"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentEvent } from "@/lib/types";
import { afterReject, eventDelay, postApproval, preApproval } from "./mock";

export type RunStatus = "idle" | "running" | "awaiting" | "done";

// Replays scripted events with timing. Replace the source with the SSE stream from /api/run when it exists;
// the approve/reject calls then become POST /api/approve.
export function useReplay() {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [status, setStatus] = useState<RunStatus>("idle");
  const queueRef = useRef<AgentEvent[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };

  const pump = useCallback(() => {
    const next = queueRef.current.shift();
    if (!next) return;
    timer.current = setTimeout(() => {
      setEvents((prev) => [...prev, next]);
      if (next.type === "approval_needed") { setStatus("awaiting"); return; }
      if (next.type === "done") { setStatus("done"); return; }
      pump();
    }, eventDelay(next));
  }, []);

  const start = useCallback(() => {
    clear();
    setEvents([]);
    setStatus("running");
    queueRef.current = [...preApproval];
    pump();
  }, [pump]);

  const decide = useCallback((approved: boolean) => {
    queueRef.current = [...(approved ? postApproval : afterReject)];
    setStatus("running");
    pump();
  }, [pump]);

  const reset = useCallback(() => { clear(); queueRef.current = []; setEvents([]); setStatus("idle"); }, []);

  useEffect(() => clear, []);

  return { events, status, start, reset, approve: () => decide(true), reject: () => decide(false) };
}
