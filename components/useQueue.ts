"use client";

import { useEffect, useState } from "react";
import { queue as mockQueue } from "./mock";

export interface QueueLoad {
  shipmentId: string;
  customerId: string;
  lane: string;
  pickupDate: string | null;
  sell: number | null;
}

type Result = { key: string; items: QueueLoad[]; error: string | null };

// Live: GET /api/queue (BOOKED loads). Demo: the mock list. `key` changes on mode switch or reset to refetch.
export function useQueue(mode: "live" | "demo", resetKey: number) {
  const key = `${mode}:${resetKey}`;
  const [res, setRes] = useState<Result | null>(null);

  useEffect(() => {
    if (mode === "demo") return;
    const ac = new AbortController();
    fetch("/api/queue", { signal: ac.signal })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { ok?: boolean; items?: QueueLoad[]; detail?: string } | null;
        if (!r.ok || !j?.ok) throw new Error(`HTTP ${r.status}${j?.detail ? ` ${j.detail}` : ""}`);
        setRes({ key, items: j.items ?? [], error: null });
      })
      .catch((e) => { if (!ac.signal.aborted) setRes({ key, items: [], error: e instanceof Error ? e.message : String(e) }); });
    return () => ac.abort();
  }, [mode, key]);

  if (mode === "demo") return { items: mockQueue, error: null as string | null, loading: false };
  const current = res?.key === key ? res : null;
  return { items: current?.items ?? [], error: current?.error ?? null, loading: current == null };
}
