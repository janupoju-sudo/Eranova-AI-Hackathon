import type { RunStatus } from "./useReplay";
import type { QueueLoad } from "./useQueue";
import { shortDate, usd } from "./format";

export type Outcome = "covered" | "dryrun" | "escalated" | null;

function chip(isHero: boolean, status: RunStatus, outcome: Outcome) {
  if (!isHero) return { t: "BOOKED", c: "bg-white/5 text-slate-400" };
  if (outcome === "covered") return { t: "COVERED", c: "bg-emerald-400/15 text-emerald-300" };
  if (outcome === "dryrun") return { t: "COVERED · DRY RUN", c: "bg-sky-400/15 text-sky-300" };
  if (outcome === "escalated") return { t: "ESCALATED", c: "bg-amber-400/15 text-amber-300" };
  if (status === "awaiting") return { t: "NEEDS APPROVAL", c: "bg-amber-400/15 text-amber-300" };
  if (status === "running") return { t: "WORKING", c: "bg-sky-400/15 text-sky-300 animate-pulse" };
  if (status === "error") return { t: "ERROR", c: "bg-rose-500/15 text-rose-300" };
  return { t: "BOOKED", c: "bg-white/5 text-slate-400" };
}

export default function Queue({ items, heroId, status, outcome, loading, error, onSelect }: {
  items: QueueLoad[]; heroId: string | null; status: RunStatus; outcome: Outcome; loading: boolean; error: string | null;
  onSelect?: (shipmentId: string) => void; // undefined while a run is in progress or in demo mode
}) {
  return (
    <aside className="flex min-h-0 flex-col border-r border-white/10">
      <div className="flex items-baseline justify-between px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Booked loads</h2>
        <span className="font-mono text-xs text-slate-500">{items.length}</span>
      </div>
      <ul data-lenis-prevent className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {loading && <li className="px-1 text-sm text-slate-500">Loading booked loads…</li>}
        {error && <li className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">Queue unavailable: {error}. Check .env.local, or switch to Demo.</li>}
        {items.map((l) => {
          const hero = l.shipmentId === heroId;
          const ch = chip(hero, status, outcome);
          return (
            <li key={l.shipmentId}>
            <button type="button" disabled={!onSelect} aria-pressed={hero} onClick={() => onSelect?.(l.shipmentId)}
              className={`w-full rounded-xl border p-3 text-left transition enabled:hover:border-white/30 disabled:cursor-default ${hero ? "border-emerald-400/40 bg-emerald-400/5" : "border-white/10 bg-white/[0.02]"}`}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-slate-400">#{l.shipmentId}</span>
                <span className={`rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide ${ch.c}`}>{ch.t}</span>
              </div>
              <div className="mt-1 text-sm font-medium">{l.lane}</div>
              <div className="mt-1 flex justify-between text-xs text-slate-400">
                <span>{l.customerId} · pickup {shortDate(l.pickupDate)}</span>
                <span className="font-mono">{l.sell == null ? "—" : usd(l.sell)}</span>
              </div>
            </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
