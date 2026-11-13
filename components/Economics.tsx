import type { LoadBrief } from "@/lib/types";
import { gpPctAt, usd } from "./format";

function Row({ k, v, strong, tone }: { k: string; v: string; strong?: boolean; tone?: "bad" | "ok" }) {
  return (
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-slate-400">{k}</span>
      <span className={`font-mono ${strong ? "font-semibold" : ""} ${tone === "bad" ? "text-rose-300" : tone === "ok" ? "text-emerald-300" : "text-slate-100"}`}>{v}</span>
    </div>
  );
}

function MarginMeter({ gp, floor }: { gp: number | null; floor: number }) {
  const max = 25;
  const pos = (n: number) => `${Math.min(Math.max(n / max, 0), 1) * 100}%`;
  const ok = gp != null && Number(gp.toFixed(1)) >= floor; // compare at displayed precision
  return (
    <div>
      <div className="mb-2 flex items-end justify-between">
        <span className="text-[10px] uppercase tracking-widest text-slate-500">Gross margin on sell</span>
        <span className={`font-mono text-2xl font-semibold ${gp == null ? "text-slate-600" : ok ? "text-emerald-300" : "text-rose-300"}`}>{gp == null ? "—" : `${gp.toFixed(1)}%`}</span>
      </div>
      <div className="relative h-3 rounded-full bg-white/10">
        <div className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${ok ? "bg-emerald-400" : "bg-rose-400"}`} style={{ width: gp == null ? 0 : pos(gp) }} />
        <div className="absolute -inset-y-1.5 w-0.5 bg-white" style={{ left: pos(floor) }} />
      </div>
      <div className="relative mt-1.5 h-4 text-[10px] text-slate-500">
        <span className="absolute -translate-x-1/2 text-white" style={{ left: pos(floor) }}>{floor}% floor</span>
        <span className="absolute left-0">0%</span><span className="absolute right-0">{max}%</span>
      </div>
    </div>
  );
}

export default function Economics({ brief, offer }: { brief: LoadBrief | null; offer: number | null }) {
  if (!brief) {
    return (
      <aside className="flex min-h-0 flex-col border-l border-white/10">
        <div className="px-5 py-3"><h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Load economics</h2></div>
        <p className="px-5 text-sm text-slate-500">Appears when the agent reads the load brief.</p>
      </aside>
    );
  }
  const gp = offer == null ? null : gpPctAt(brief, offer);
  const over = offer != null ? offer - brief.margin.maxLinehaul : 0;
  return (
    <aside className="flex min-h-0 flex-col border-l border-white/10">
      <div className="px-5 py-3"><h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Load economics · #{brief.shipmentId}</h2>{process.env.NEXT_PUBLIC_TMS_UI_URL && <a href={process.env.NEXT_PUBLIC_TMS_UI_URL} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-sky-300 hover:underline">Open in TMS ↗</a>}</div>
      <div data-lenis-prevent className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-sm font-medium">{brief.lane.origin} → {brief.lane.destination}</div>
          <div className="mt-0.5 text-xs text-slate-400">{brief.customerId} · {brief.equipment} · {brief.lane.miles} mi · {brief.facility.id}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><MarginMeter gp={gp} floor={brief.margin.floorPct} /></div>
        <div className="divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2">
          <Row k="Customer sell" v={usd(brief.sell.total)} />
          <Row k="Max buy at floor" v={usd(brief.margin.maxBuyTotal, 2)} />
          <Row k="Carrier fuel" v={usd(brief.margin.carrierFuel$, 2)} />
          <Row k="Expected lumper" v={usd(brief.risk.expectedLumper$)} />
          <Row k="Max linehaul (ceiling)" v={usd(brief.margin.maxLinehaul)} strong />
          <Row k="Current offer" v={offer == null ? "—" : usd(offer)} strong tone={offer == null ? undefined : over > 0 ? "bad" : "ok"} />
          {over > 0 && <Row k="Over ceiling by" v={usd(over)} tone="bad" />}
          <Row k="Expected detention" v={`${usd(brief.risk.expectedDetention$, 2)} · ${brief.risk.expectedDwellH.toFixed(1)} h dwell`} />
          {brief.market && <Row k="Market target" v={`${usd(brief.market.target)}  (${usd(brief.market.low)}–${usd(brief.market.high)})`} />}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {brief.flags.map((f) => (
            <span key={f} className={`rounded-full px-2.5 py-1 text-xs ${f.toLowerCase().includes("unreachable") ? "bg-rose-500/15 text-rose-200" : "bg-white/5 text-slate-300"}`}>{f}</span>
          ))}
        </div>
      </div>
    </aside>
  );
}
