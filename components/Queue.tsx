import { queue } from "./mock";
import type { RunStatus } from "./useReplay";
import { usd } from "./format";

function chip(hero: boolean | undefined, status: RunStatus, covered: boolean) {
  if (!hero) return { t: "BOOKED", c: "bg-white/5 text-slate-400" };
  if (covered) return { t: "COVERED", c: "bg-emerald-400/15 text-emerald-300" };
  if (status === "awaiting") return { t: "NEEDS APPROVAL", c: "bg-amber-400/15 text-amber-300" };
  if (status === "running") return { t: "WORKING", c: "bg-sky-400/15 text-sky-300 animate-pulse" };
  if (status === "done") return { t: "ESCALATED", c: "bg-amber-400/15 text-amber-300" };
  return { t: "BOOKED", c: "bg-white/5 text-slate-400" };
}

export default function Queue({ status, covered }: { status: RunStatus; covered: boolean }) {
  return (
    <aside className="flex min-h-0 flex-col border-r border-white/10">
      <div className="flex items-baseline justify-between px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Booked loads</h2>
        <span className="font-mono text-xs text-slate-500">{queue.length}</span>
      </div>
      <ul data-lenis-prevent className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {queue.map((l) => {
          const ch = chip(l.hero, status, covered);
          return (
            <li key={l.shipmentId} className={`rounded-xl border p-3 transition ${l.hero ? "border-emerald-400/40 bg-emerald-400/5" : "border-white/10 bg-white/[0.02]"}`}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-slate-400">#{l.shipmentId}</span>
                <span className={`rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide ${ch.c}`}>{ch.t}</span>
              </div>
              <div className="mt-1 text-sm font-medium">{l.lane}</div>
              <div className="mt-1 flex justify-between text-xs text-slate-400">
                <span>{l.customer} · pickup {l.pickup}</span>
                <span className="font-mono">{usd(l.sell)}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
