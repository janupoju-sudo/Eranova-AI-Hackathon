import type { AgentEvent, LoadBrief } from "@/lib/types";
import Carriers from "./Carriers";
import { gpPctAt, usd } from "./format";

const TMS_UI = process.env.NEXT_PUBLIC_TMS_UI_URL?.replace(/\/$/, "");

function Row({ k, v, strong, tone }: { k: string; v: string; strong?: boolean; tone?: "bad" | "ok" }) {
  return (
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-slate-400">{k}</span>
      <span className={`font-mono tabular-nums ${strong ? "font-semibold" : ""} ${tone === "bad" ? "text-rose-300" : tone === "ok" ? "text-emerald-300" : "text-slate-100"}`}>{v}</span>
    </div>
  );
}

/**
 * Where the customer's dollar goes: the sell price split into what we pay out and what we keep.
 * The white tick is the margin floor; anything we pay out past it eats into the floor.
 */
function DollarBar({ brief, offer }: { brief: LoadBrief; offer: number | null }) {
  const sell = brief.sell.total;
  const linehaul = offer ?? brief.margin.maxLinehaul;
  const parts = [
    { k: "Linehaul", v: linehaul, c: offer == null ? "bg-slate-500/40 bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(255,255,255,.08)_6px_12px)]" : "bg-sky-400" },
    { k: "Carrier fuel", v: brief.margin.carrierFuel$, c: "bg-sky-300/70" },
    { k: "Lumper at dock", v: brief.risk.expectedLumper$, c: "bg-violet-400" },
  ];
  const paid = parts.reduce((t, p) => t + p.v, 0);
  const keep = Math.max(0, sell - paid);
  const gp = gpPctAt(brief, linehaul);
  const ok = Number(gp.toFixed(1)) >= brief.margin.floorPct;
  const pct = (n: number) => `${Math.min(100, Math.max(0, (n / sell) * 100))}%`;
  const floorAt = pct(brief.margin.maxBuyTotal);
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-400">{offer == null ? "At the ceiling we could pay" : "At the current offer we keep"}</p>
          <p className={`font-mono text-5xl font-semibold tabular-nums leading-none transition-colors duration-500 ${offer == null ? "text-slate-300" : ok ? "text-emerald-300" : "text-rose-300"}`}>
            {gp.toFixed(1)}%
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="text-slate-400">Margin floor</p>
          <p className="font-mono text-2xl tabular-nums text-white">{brief.margin.floorPct}%</p>
        </div>
      </div>

      <div className="relative mt-5">
        <div className="flex h-12 overflow-hidden rounded-lg ring-1 ring-white/10" role="img"
          aria-label={`Sell ${usd(sell)}: linehaul ${usd(linehaul)}, fuel ${usd(brief.margin.carrierFuel$)}, lumper ${usd(brief.risk.expectedLumper$)}, kept ${usd(keep)}`}>
          {parts.map((p) => <div key={p.k} className={`${p.c} transition-[width] duration-700 ease-out`} style={{ width: pct(p.v) }} />)}
          <div className={`flex-1 transition-colors duration-500 ${ok || offer == null ? "bg-emerald-400/80" : "bg-rose-500/80"}`} />
        </div>
        {/* floor tick */}
        <div className="pointer-events-none absolute -inset-y-2 w-0.5 bg-white" style={{ left: floorAt }} />
        <div className="absolute -top-6 -translate-x-1/2 whitespace-nowrap text-xs text-white" style={{ left: floorAt }}>pay up to {usd(brief.margin.maxBuyTotal)}</div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
        {[...parts.map((p) => ({ k: p.k, v: p.v, c: p.c })), { k: "We keep", v: keep, c: ok || offer == null ? "bg-emerald-400/80" : "bg-rose-500/80" }].map((p) => (
          <div key={p.k} className="flex items-start gap-1.5">
            <span className={`mt-1 size-2.5 shrink-0 rounded-sm ${p.c}`} />
            <span><span className="block text-slate-400">{p.k}</span><span className="font-mono tabular-nums text-slate-100">{usd(p.v)}</span></span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Sell {usd(sell)}. Expected detention {usd(brief.risk.expectedDetention$)} ({brief.risk.expectedDwellH.toFixed(1)} h dwell) is a risk on top, not priced into the sell.
      </p>
    </div>
  );
}

export default function Economics({ brief, offer, events }: { brief: LoadBrief | null; offer: number | null; events: AgentEvent[] }) {
  if (!brief) {
    return (
      <section className="grid min-h-0 place-items-center px-8 text-center">
        <div>
          <p className="text-lg text-slate-300">Pick a load and run the agent.</p>
          <p className="mt-1 text-sm text-slate-500">Its economics appear here the moment the agent reads the load brief.</p>
        </div>
      </section>
    );
  }
  const over = offer != null ? offer - brief.margin.maxLinehaul : 0;
  return (
    <section data-lenis-prevent className="min-h-0 overflow-y-auto px-8 py-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{brief.lane.origin} to {brief.lane.destination}</h2>
          <p className="mt-1 text-sm text-slate-400">
            Load {brief.shipmentId} for {brief.customerId}, {brief.lane.miles} miles, delivering to {brief.facility.id}
          </p>
        </div>
        {TMS_UI && (
          <a href={`${TMS_UI}/shipments/${encodeURIComponent(brief.shipmentId)}`} target="_blank" rel="noreferrer"
            className="rounded-lg border border-sky-400/40 px-3 py-2 text-sm font-medium text-sky-200 transition hover:bg-sky-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
            Open load {brief.shipmentId} in the TMS ↗
          </a>
        )}
      </header>

      <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <DollarBar brief={brief} offer={offer} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div>
          <div className="divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2">
            <Row k="Max linehaul we can pay" v={usd(brief.margin.maxLinehaul, 2)} strong />
            <Row k="Current offer" v={offer == null ? "none yet" : usd(offer, 2)} strong tone={offer == null ? undefined : over > 0 ? "bad" : "ok"} />
            {over > 0 && <Row k="Over the ceiling by" v={usd(over, 2)} tone="bad" />}
            {brief.market && <Row k="Market linehaul" v={`${usd(brief.market.target)} (${usd(brief.market.low)} to ${usd(brief.market.high)})`} />}
            {brief.laneHistory.avgLinehaulPerMile != null && (
              <Row k={`Lane history, ${brief.laneHistory.loads} loads`} v={`$${brief.laneHistory.avgLinehaulPerMile}/mi, ${brief.laneHistory.avgGpPct ?? "?"}% GP`} />
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {brief.flags.map((f) => (
              <span key={f} className={`rounded-full px-2.5 py-1 text-xs ${f.toLowerCase().includes("unreachable") ? "bg-rose-500/15 text-rose-200" : "bg-white/5 text-slate-300"}`}>{f}</span>
            ))}
          </div>
        </div>
        <Carriers brief={brief} events={events} />
      </div>
    </section>
  );
}
