"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentEvent } from "@/lib/types";
import { usd } from "./format";

function Json({ value }: { value: unknown }) {
  return <pre data-lenis-prevent className="max-h-48 overflow-auto rounded-md bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-slate-300">{JSON.stringify(value, null, 2)}</pre>;
}

function ToolCall({ e }: { e: Extract<AgentEvent, { type: "tool_call" }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-left">
        <span className="rounded bg-sky-400/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-300">CALL</span>
        <span className="font-mono text-sm text-slate-200">{e.name}</span>
        <span className="ml-auto text-xs text-slate-500">{open ? "hide" : "args"}</span>
      </button>
      {open && <div className="mt-2"><Json value={e.args} /></div>}
    </div>
  );
}

function ToolResult({ e }: { e: Extract<AgentEvent, { type: "tool_result" }> }) {
  const [open, setOpen] = useState(!e.ok);
  const detail = !e.ok && typeof e.result === "object" && e.result ? (e.result as { status?: number; detail?: string }) : null;
  if (!e.ok) {
    return (
      <div className="rounded-xl border border-rose-500/50 bg-rose-500/10 p-4">
        <div className="flex items-center gap-2">
          <span className="rounded bg-rose-500 px-2 py-0.5 font-mono text-xs font-bold text-white">{detail?.status ?? "ERR"}</span>
          <span className="text-sm font-semibold text-rose-200">{e.name} rejected by the TMS</span>
        </div>
        {detail?.detail && <p className="mt-2 text-sm text-rose-100">{detail.detail}</p>}
        <p className="mt-2 text-xs text-rose-300/80">The agent reads this, explains it, and adapts.</p>
        <button onClick={() => setOpen(!open)} className="mt-2 text-xs text-rose-300 underline-offset-2 hover:underline">{open ? "hide raw" : "raw response"}</button>
        {open && <div className="mt-2"><Json value={e.result} /></div>}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] px-3 py-2">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-left">
        <span className="rounded bg-emerald-400/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">OK</span>
        <span className="font-mono text-sm text-slate-300">{e.name}</span>
        <span className="ml-auto text-xs text-slate-500">{open ? "hide" : "result"}</span>
      </button>
      {open && <div className="mt-2"><Json value={e.result} /></div>}
    </div>
  );
}

function Bubble({ e }: { e: Extract<AgentEvent, { type: "negotiation" }> }) {
  const broker = e.from === "broker";
  return (
    <div className={`flex ${broker ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${broker ? "rounded-br-sm bg-emerald-400/15 text-emerald-50" : "rounded-bl-sm bg-white/[0.07] text-slate-100"}`}>
        <div className="mb-0.5 flex items-center justify-between gap-4 text-[10px] uppercase tracking-widest text-slate-400">
          <span>{broker ? "Broker agent" : e.carrierId}</span>
          {e.amount != null && <span className="font-mono text-sm font-semibold normal-case tracking-normal text-white">{usd(e.amount)}</span>}
        </div>
        <p className="text-sm leading-snug">{e.text}</p>
      </div>
    </div>
  );
}

export default function Feed({ events }: { events: AgentEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" }); }, [events.length]);
  return (
    <main className="flex min-h-0 flex-col">
      <div className="flex items-baseline justify-between px-6 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Live agent feed</h2>
        <span className="font-mono text-xs text-slate-500">{events.length} events</span>
      </div>
      <div ref={ref} data-lenis-prevent className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 pb-6">
        {events.length === 0 && (
          <div className="grid h-full place-items-center text-center text-slate-500">
            <div><p className="text-lg text-slate-300">Ready.</p><p className="mt-1 text-sm">Press “Run coverage agent” to cover load #7300176.</p></div>
          </div>
        )}
        {events.map((e, i) => {
          const k = `${i}-${e.type}`;
          switch (e.type) {
            case "thought":
              return <p key={k} className="animate-[fadein_.35s_ease-out] border-l-2 border-slate-600 pl-4 text-[15px] leading-relaxed text-slate-300">{e.text}</p>;
            case "tool_call": return <div key={k} className="animate-[fadein_.35s_ease-out]"><ToolCall e={e} /></div>;
            case "tool_result": return <div key={k} className="animate-[fadein_.35s_ease-out]"><ToolResult e={e} /></div>;
            case "negotiation": return <div key={k} className="animate-[fadein_.35s_ease-out]"><Bubble e={e} /></div>;
            case "approval_needed":
              return <div key={k} className="rounded-xl border border-amber-400/50 bg-amber-400/10 p-4 text-sm text-amber-100"><b>Paused for human approval.</b> {e.reason}</div>;
            case "done":
              return <div key={k} className="rounded-xl border border-emerald-400/50 bg-emerald-400/10 p-4 text-sm text-emerald-100"><b>Done.</b> {e.summary}</div>;
          }
        })}
      </div>
    </main>
  );
}
