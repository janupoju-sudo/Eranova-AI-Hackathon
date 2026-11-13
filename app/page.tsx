"use client";

import { useMemo, useState } from "react";
import Providers from "./providers";
import ApprovalPanel from "@/components/ApprovalPanel";
import Economics from "@/components/Economics";
import Feed from "@/components/Feed";
import Header from "@/components/Header";
import Queue, { type Outcome } from "@/components/Queue";
import { useLiveRun } from "@/components/useLiveRun";
import { useQueue } from "@/components/useQueue";
import { useReplay } from "@/components/useReplay";
import type { LoadBrief } from "@/lib/types";

export default function Page() {
  const [mode, setMode] = useState<"live" | "demo">("live");
  const [resetKey, setResetKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const replay = useReplay();
  const live = useLiveRun();
  const run = mode === "demo" ? replay : live;
  const { events, status, error } = run;
  const queue = useQueue(mode, resetKey);

  const brief = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === "tool_result" && e.name === "get_load_brief" && e.ok) return e.result as LoadBrief;
    }
    return null;
  }, [events]);
  const offer = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === "negotiation" && e.from === "carrier" && e.amount != null) return e.amount;
    }
    return null;
  }, [events]);
  const approval = useMemo(() => {
    const e = [...events].reverse().find((x) => x.type === "approval_needed");
    return e && e.type === "approval_needed" ? e : null;
  }, [events]);
  const done = events.find((e) => e.type === "done");
  const protectedUsd = done && done.type === "done" ? done.protected$ ?? 0 : 0;

  const cover = events.find((e) => e.type === "tool_result" && e.name === "cover" && e.ok);
  const dry = cover?.type === "tool_result" && typeof cover.result === "object" && cover.result !== null && (cover.result as { dryRun?: boolean }).dryRun === true;
  const outcome: Outcome = status !== "done" ? null : cover ? (dry ? "dryrun" : "covered") : "escalated";
  const defaultId = queue.items.find((l) => l.customerId === "NORTHSTAR" && l.lane.startsWith("Chicago") && l.lane.includes("Dallas"))?.shipmentId ?? null;
  // Idle: the chosen (or default hero) load. Once a run starts, the load the agent actually read.
  const chosenId = mode === "demo" ? defaultId : selectedId ?? defaultId;
  const activeId = status === "idle" ? chosenId : brief?.shipmentId ?? chosenId;

  const onReset = () => { run.reset(); setResetKey((k) => k + 1); };
  const onMode = (m: "live" | "demo") => { replay.reset(); live.reset(); setMode(m); setResetKey((k) => k + 1); };

  return (
    <Providers>
      <div className="grid h-screen grid-rows-[auto_minmax(0,1fr)_auto] bg-[#0b0f14] text-slate-100">
        <Header status={status} protectedUsd={protectedUsd} mode={mode} onMode={onMode} onStart={() => run.start(chosenId ?? undefined)} onReset={onReset} />
        <div className="grid min-h-0 grid-cols-[300px_minmax(0,1fr)_380px]">
          <Queue items={queue.items} heroId={activeId} status={status} outcome={outcome} loading={queue.loading} error={queue.error} locked={mode === "demo" || status !== "idle"} onSelect={setSelectedId} />
          <Feed events={events} error={error} />
          <Economics brief={brief} offer={offer} />
        </div>
        {status === "awaiting" && approval && <ApprovalPanel approval={approval} onApprove={run.approve} onReject={run.reject} />}
      </div>
    </Providers>
  );
}
