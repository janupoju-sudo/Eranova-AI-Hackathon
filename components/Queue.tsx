import type { RunStatus } from "./useReplay";
import type { QueueLoad } from "./useQueue";
import { shortDate, usd } from "./format";

export type Outcome = "covered" | "dryrun" | "escalated" | null;

function chip(isHero: boolean, status: RunStatus, outcome: Outcome) {
  if (!isHero) return { t: "BOOKED", c: "bg-stone-100 text-stone-500" };
  if (outcome === "covered") return { t: "COVERED", c: "bg-emerald-100 text-emerald-700" };
  if (outcome === "dryrun") return { t: "COVERED · DRY RUN", c: "bg-indigo-100 text-indigo-700" };
  if (outcome === "escalated") return { t: "ESCALATED", c: "bg-amber-100 text-amber-700" };
  if (status === "awaiting") return { t: "NEEDS APPROVAL", c: "bg-amber-100 text-amber-700" };
  if (status === "running") return { t: "WORKING", c: "bg-indigo-100 text-indigo-700 animate-pulse" };
  if (status === "error") return { t: "ERROR", c: "bg-rose-100 text-rose-700" };
  return { t: "BOOKED", c: "bg-stone-100 text-stone-500" };
}

export default function Queue({ items, heroId, status, outcome, loading, error, onSelect }: {
  items: QueueLoad[]; heroId: string | null; status: RunStatus; outcome: Outcome; loading: boolean; error: string | null;
  onSelect?: (shipmentId: string) => void; // undefined while a run is in progress or in demo mode
}) {
  return (
    <aside className="flex min-h-0 flex-col border-r border-stone-200">
      <div className="flex items-baseline justify-between px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500">Booked loads</h2>
        <span className="font-mono text-xs text-stone-500">{items.length}</span>
      </div>
      <ul data-lenis-prevent className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {loading && <li className="px-1 text-sm text-stone-500">Loading booked loads…</li>}
        {error && <li className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">Queue unavailable: {error}. Check .env.local, or switch to Demo.</li>}
        {items.map((l) => {
          const hero = l.shipmentId === heroId;
          const ch = chip(hero, status, outcome);
          return (
            <li key={l.shipmentId}>
            <button type="button" disabled={!onSelect} aria-pressed={hero} onClick={() => onSelect?.(l.shipmentId)}
              className={`w-full rounded-xl border p-3 text-left transition enabled:hover:border-stone-300 disabled:cursor-default ${hero ? "border-emerald-300 bg-emerald-50" : "border-stone-200 bg-white"}`}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-stone-500">#{l.shipmentId}</span>
                <span className={`rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide ${ch.c}`}>{ch.t}</span>
              </div>
              <div className="mt-1 text-sm font-medium">{l.lane}</div>
              <div className="mt-1 flex justify-between text-xs text-stone-500">
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
