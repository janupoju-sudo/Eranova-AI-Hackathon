"use client";

import CountUp from "./CountUp";
import type { RunStatus } from "./useReplay";

const label: Record<RunStatus, { text: string; cls: string }> = {
  idle: { text: "Idle", cls: "bg-white/5 text-slate-400" },
  running: { text: "Agent working", cls: "bg-sky-400/15 text-sky-300" },
  awaiting: { text: "Needs approval", cls: "bg-amber-400/15 text-amber-300" },
  done: { text: "Complete", cls: "bg-emerald-400/15 text-emerald-300" },
  error: { text: "Backend error", cls: "bg-rose-500/15 text-rose-300" },
};

export default function Header({ status, protectedUsd, mode, onMode, onStart, onReset }: {
  status: RunStatus; protectedUsd: number; mode: "live" | "demo"; onMode: (m: "live" | "demo") => void; onStart: () => void; onReset: () => void;
}) {
  const s = label[status];
  return (
    <header className="flex items-center justify-between gap-6 border-b border-white/10 px-6 py-3">
      <div className="flex items-center gap-4">
        <div className="grid size-9 place-items-center rounded-lg bg-emerald-400/15 font-mono text-sm font-bold text-emerald-300">CA</div>
        <div>
          <h1 className="text-[15px] font-semibold leading-tight tracking-tight">Facility-Aware Coverage Agent</h1>
          <p className="text-xs text-slate-400">Code enforces the limits · AI makes the calls · Humans approve the exceptions</p>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-slate-500">Margin protected</div>
          <div className="font-mono text-2xl font-semibold text-emerald-300"><CountUp value={protectedUsd} digits={0} /></div>
        </div>
        <div className="flex rounded-lg border border-white/10 p-0.5 text-xs">
          {(["live", "demo"] as const).map((m) => (
            <button key={m} onClick={() => mode !== m && onMode(m)} className={`rounded-md px-3 py-1.5 font-medium capitalize transition ${mode === m ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}>{m}</button>
          ))}
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${s.cls}`}>{s.text}</span>
        {status === "idle" ? (
          <button onClick={onStart} className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300">Run coverage agent</button>
        ) : (
          <button onClick={onReset} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/5">Reset demo</button>
        )}
      </div>
    </header>
  );
}
