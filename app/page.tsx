"use client";

import { useMemo, useState } from "react";
import Providers from "./providers";
import ApprovalPanel from "@/components/ApprovalPanel";
import Economics from "@/components/Economics";
import Feed from "@/components/Feed";
import Header from "@/components/Header";
import Queue, { type Outcome } from "@/components/Queue";
import { useLiveRun } from "@/components/useLiveRun";
import { usePreviewBrief } from "@/components/usePreviewBrief";
import { useQueue } from "@/components/useQueue";
import { useReplay } from "@/components/useReplay";
import type { LoadBrief } from "@/lib/types";
import type { Autonomy } from "@/lib/tools";

export default function Page() {
  const [mode, setMode] = useState<"live" | "demo">("live");
  const [resetKey, setResetKey] = useState(0);
  const replay = useReplay();
  const live = useLiveRun();
  const run = mode === "demo" ? replay : live;
  const { events, status, error } = run;
  const queue = useQueue(mode, resetKey);
  const [selected, setSelected] = useState<string | null>(null);
  const [autonomy, setAutonomy] = useState<Autonomy>("auto");

  const brief = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === "tool_result" && e.name === "get_load_brief" && e.ok) return e.result as LoadBrief;
    }
    return null;
  }, [events]);
  const offer = useMemo(() => {
    // Carriers the TMS refused at cover no longer count as an offer.
    const blocked = new Set<string>();
    events.forEach((e, i) => {
      if (e.type !== "tool_result" || e.name !== "cover" || e.ok) return;
      const call = events.slice(0, i).reverse().find((x) => x.type === "tool_call" && x.name === "cover");
      const id = call?.type === "tool_call" ? (call.args as { carrier_id?: string }).carrier_id : undefined;
      if (id) blocked.add(id);
    });
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === "approval_needed") return Number(e.numbers.offer); // the price the human is being asked about
      if (e.type === "negotiation" && e.from === "carrier" && e.amount != null && !blocked.has(e.carrierId)) return e.amount;
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
  const heroId = brief?.shipmentId ?? selected ?? queue.items.find((l) => l.customerId === "NORTHSTAR" && l.lane.startsWith("Chicago") && l.lane.includes("Dallas"))?.shipmentId ?? null;

  // Before a run: the selected load's carriers, read-only, so the broker sees who is on file up front.
  const preview = usePreviewBrief(mode, heroId, brief == null);

  const onReset = () => { run.reset(); setResetKey((k) => k + 1); };
  const busy = status === "running" || status === "awaiting";
  const onSelect = (id: string) => { if (busy) return; run.reset(); setSelected(id); };
  const onStart = () => (mode === "live" ? live.start(heroId ?? undefined, autonomy) : replay.start());
  const onMode = (m: "live" | "demo") => { replay.reset(); live.reset(); setMode(m); setResetKey((k) => k + 1); };

  return (
    <Providers>
      <div className="grid h-screen grid-rows-[auto_minmax(0,1fr)_auto] bg-[#0b0f14] text-slate-100">
        <Header status={status} protectedUsd={protectedUsd} mode={mode} onMode={onMode} onStart={onStart} autonomy={mode === "live" ? autonomy : undefined} onAutonomy={busy ? undefined : setAutonomy} onReset={onReset} />
        <div className="grid min-h-0 grid-cols-[260px_minmax(0,1fr)_440px]">
          <Queue items={queue.items} heroId={heroId} status={status} outcome={outcome} loading={queue.loading} error={queue.error} onSelect={mode === "live" && !busy ? onSelect : undefined} />
          <Economics brief={brief} offer={offer} events={events} preview={preview} />
          <Feed events={events} error={error} busy={status === "running"} />
        </div>
        {status === "awaiting" && approval && <ApprovalPanel approval={approval} onApprove={run.approve} onReject={run.reject} />}
      </div>
    </Providers>
  );
}
