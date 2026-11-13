"use client";

import { useEffect, useState } from "react";
import type { LoadBrief } from "@/lib/types";
import { preApproval } from "./mock";

type Result = { id: string; brief: LoadBrief | null; error: string | null };

const demoBrief = (() => {
  const e = preApproval.find((x) => x.type === "tool_result" && x.name === "get_load_brief" && x.ok);
  return e && e.type === "tool_result" ? (e.result as LoadBrief) : null;
})();

/** The selected load's brief before any run, so carriers are visible up front. Live: GET /api/brief (read-only). */
export function usePreviewBrief(mode: "live" | "demo", shipmentId: string | null, enabled: boolean) {
  const [res, setRes] = useState<Result | null>(null);

  useEffect(() => {
    if (mode === "demo" || !shipmentId || !enabled) return;
    const ac = new AbortController();
    fetch(`/api/brief?shipmentId=${encodeURIComponent(shipmentId)}`, { signal: ac.signal })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { ok?: boolean; brief?: LoadBrief; detail?: string } | null;
        if (!r.ok || !j?.ok || !j.brief) throw new Error(j?.detail ?? `HTTP ${r.status}`);
        setRes({ id: shipmentId, brief: j.brief, error: null });
      })
      .catch((e) => { if (!ac.signal.aborted) setRes({ id: shipmentId, brief: null, error: e instanceof Error ? e.message : String(e) }); });
    return () => ac.abort();
  }, [mode, shipmentId, enabled]);

  if (mode === "demo") return { brief: demoBrief, loading: false, error: null as string | null };
  const current = shipmentId && res?.id === shipmentId ? res : null;
  return { brief: current?.brief ?? null, loading: !!shipmentId && current == null, error: current?.error ?? null };
}
