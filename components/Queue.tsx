"use client";

import { useEffect, useState } from "react";
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

const TMS_UI = process.env.NEXT_PUBLIC_TMS_UI_URL?.replace(/\/$/, "");

type CoveredLoad = QueueLoad & { carrierId?: string | null; buy?: number | null; gpPct?: number | null };

/** Loads that already have a carrier, read straight from the TMS each time the tab is opened. */
function Covered({ refreshKey }: { refreshKey: string }) {
  const [res, setRes] = useState<{ key: string; items: CoveredLoad[]; error: string | null } | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/queue?status=COVERED", { signal: ac.signal })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { ok?: boolean; items?: CoveredLoad[] } | null;
        if (!r.ok || !j?.ok) throw new Error(`HTTP ${r.status}`);
        setRes({ key: refreshKey, items: j.items ?? [], error: null });
      })
      .catch((e) => { if (!ac.signal.aborted) setRes({ key: refreshKey, items: [], error: e instanceof Error ? e.message : String(e) }); });
    return () => ac.abort();
  }, [refreshKey]);
  const cur = res?.key === refreshKey ? res : null;
  if (!cur) return <li className="px-1 text-sm text-stone-500">Loading covered loads…</li>;
  if (cur.error) return <li className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">Covered loads unavailable: {cur.error}.</li>;
  if (!cur.items.length) return <li className="px-1 text-sm text-stone-500">No covered loads yet. Run the agent on a booked load.</li>;
  return (
    <>
      {cur.items.map((l) => (
        <li key={l.shipmentId} className="rounded-xl border border-stone-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-stone-500">#{l.shipmentId}</span>
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-700">COVERED</span>
          </div>
          <div className="mt-1 text-sm font-medium">{l.lane}</div>
          <div className="mt-1 flex justify-between text-xs text-stone-500">
            <span>{l.customerId} · pickup {shortDate(l.pickupDate)}</span>
            <span className="font-mono">{l.sell == null ? "—" : usd(l.sell)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-stone-100 pt-2 text-xs">
            <span className="font-mono font-semibold text-stone-800">{l.carrierId ?? "carrier n/a"}</span>
            <span className="text-stone-600">{l.gpPct == null ? "" : `keeps ${l.gpPct}%`}</span>
          </div>
          {TMS_UI && <a href={`${TMS_UI}/shipments/${encodeURIComponent(l.shipmentId)}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-medium text-indigo-700 underline-offset-2 hover:underline">Open in the TMS ↗</a>}
        </li>
      ))}
    </>
  );
}

export default function Queue({ items, heroId, status, outcome, loading, error, onSelect }: {
  items: QueueLoad[]; heroId: string | null; status: RunStatus; outcome: Outcome; loading: boolean; error: string | null;
  onSelect?: (shipmentId: string) => void; // undefined while a run is in progress or in demo mode
}) {
  const [tab, setTab] = useState<"booked" | "covered">("booked");
  return (
    <aside className="flex min-h-0 flex-col border-r border-stone-200">
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <div role="tablist" aria-label="Loads" className="flex rounded-lg border border-stone-200 bg-white p-0.5 text-xs">
          {(["booked", "covered"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 font-medium capitalize transition ${tab === t ? "bg-stone-900 text-white" : "text-stone-500 hover:text-stone-800"}`}>{t}</button>
          ))}
        </div>
        {tab === "booked" && <span className="font-mono text-xs text-stone-500">{items.length}</span>}
      </div>
      {tab === "covered" ? (
        <ul data-lenis-prevent className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3"><Covered refreshKey={`${status}:${outcome ?? ""}`} /></ul>
      ) : (
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
      )}
    </aside>
  );
}
