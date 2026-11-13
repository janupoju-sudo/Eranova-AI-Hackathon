"use client";

import CountUp from "./CountUp";
import type { RunStatus } from "./useReplay";

const label: Record<RunStatus, { text: string; cls: string }> = {
  idle: { text: "Idle", cls: "bg-stone-100 text-stone-500" },
  running: { text: "Agent working", cls: "bg-indigo-100 text-indigo-700" },
  awaiting: { text: "Needs approval", cls: "bg-amber-100 text-amber-700" },
  done: { text: "Complete", cls: "bg-emerald-100 text-emerald-700" },
  error: { text: "Backend error", cls: "bg-rose-100 text-rose-700" },
};

const DIAL = [
  { k: "draft", t: "Draft", tip: "Agent does everything; nothing is written to the TMS" },
  { k: "supervised", t: "Supervised", tip: "A human approves every cover" },
  { k: "auto", t: "Auto", tip: "Covers within the margin ceiling; human approves exceptions" },
] as const;
type Autonomy = (typeof DIAL)[number]["k"];

export default function Header({ status, protectedUsd, mode, onMode, onStart, onReset, autonomy, onAutonomy }: {
  status: RunStatus; protectedUsd: number; mode: "live" | "demo"; onMode: (m: "live" | "demo") => void; onStart: () => void; onReset: () => void;
  autonomy?: Autonomy; onAutonomy?: (a: Autonomy) => void; // dial hidden in demo mode, locked while a run is in progress
}) {
  const s = label[status];
  return (
    <header className="flex items-center justify-between gap-6 border-b border-stone-200 px-6 py-3">
      <div className="flex items-center gap-4">
        <div className="grid size-9 place-items-center rounded-lg bg-emerald-100 font-mono text-sm font-bold text-emerald-700">CA</div>
        <div>
          <h1 className="text-[15px] font-semibold leading-tight tracking-tight">Facility-Aware Coverage Agent</h1>
          <p className="text-xs text-stone-500">Code enforces the limits · AI makes the calls · Humans approve the exceptions</p>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-stone-500" title="Expected detention + expected OTIF chargeback: dock costs nobody bills for, priced before booking">Dock risk priced before booking</div>
          <div className="font-mono text-2xl font-semibold text-emerald-700"><CountUp value={protectedUsd} digits={0} /></div>
        </div>
        <div className="flex rounded-lg border border-stone-200 p-0.5 text-xs">
          {(["live", "demo"] as const).map((m) => (
            <button key={m} onClick={() => mode !== m && onMode(m)} className={`rounded-md px-3 py-1.5 font-medium capitalize transition ${mode === m ? "bg-stone-100 text-stone-900" : "text-stone-500 hover:text-stone-700"}`}>{m}</button>
          ))}
        </div>
        {autonomy && (
          <div role="radiogroup" aria-label="Autonomy" className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-stone-500">Autonomy</span>
            <div className="flex rounded-lg border border-stone-200 p-0.5 text-xs">
              {DIAL.map((d) => (
                <button key={d.k} role="radio" aria-checked={autonomy === d.k} title={d.tip} disabled={!onAutonomy} onClick={() => onAutonomy?.(d.k)}
                  className={`rounded-md px-2.5 py-1.5 font-medium transition disabled:cursor-not-allowed ${autonomy === d.k ? "bg-amber-100 text-amber-800" : "text-stone-500 enabled:hover:text-stone-700"}`}>{d.t}</button>
              ))}
            </div>
          </div>
        )}
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${s.cls}`}>{s.text}</span>
        {status === "idle" ? (
          <button onClick={onStart} className="rounded-lg bg-gradient-to-b from-indigo-500 to-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-900/20 transition active:scale-[0.97] motion-reduce:active:scale-100 hover:from-indigo-600 hover:to-indigo-800">Run coverage agent</button>
        ) : (
          <button onClick={onReset} className="rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-700 transition hover:bg-stone-100">Reset demo</button>
        )}
      </div>
    </header>
  );
}
