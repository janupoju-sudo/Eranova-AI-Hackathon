"use client";

import { useMemo } from "react";
import Providers from "./providers";
import ApprovalPanel from "@/components/ApprovalPanel";
import Economics from "@/components/Economics";
import Feed from "@/components/Feed";
import Header from "@/components/Header";
import Queue from "@/components/Queue";
import { heroBrief } from "@/components/mock";
import { useReplay } from "@/components/useReplay";

export default function Page() {
  const { events, status, start, reset, approve, reject } = useReplay();

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
  const covered = status === "done" && events.some((e) => e.type === "tool_result" && e.name === "cover" && e.ok);
  const protectedUsd = done && done.type === "done" ? done.protected$ ?? 0 : 0;

  return (
    <Providers>
    <div className="grid h-screen bg-[#0b0f14] text-slate-100 grid-rows-[auto_minmax(0,1fr)_auto]">
      <Header status={status} protectedUsd={protectedUsd} onStart={start} onReset={reset} />
      <div className="grid min-h-0 grid-cols-[300px_minmax(0,1fr)_380px]">
        <Queue status={status} covered={covered} />
        <Feed events={events} />
        <Economics brief={heroBrief} offer={offer} />
      </div>
      {status === "awaiting" && approval && <ApprovalPanel approval={approval} onApprove={approve} onReject={reject} />}
    </div>
    </Providers>
  );
}
