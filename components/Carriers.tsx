import type { AgentEvent, CarrierCandidate, LoadBrief } from "@/lib/types";
import { usd } from "./format";

type Status = { t: string; c: string };

// Live status per carrier, derived only from the agent's events (no money math here).
function statuses(events: AgentEvent[]): Record<string, Status> {
  const out: Record<string, Status> = {};
  let lastBroker: Record<string, number | undefined> = {};
  let pendingCover: string | null = null;
  for (const e of events) {
    if (e.type === "negotiation") {
      if (e.from === "broker") lastBroker = { ...lastBroker, [e.carrierId]: e.amount };
      else if (e.amount != null && e.amount === lastBroker[e.carrierId]) out[e.carrierId] = { t: `accepted ${usd(e.amount)}`, c: "text-emerald-300" };
      else if (e.amount != null) out[e.carrierId] = { t: `wants ${usd(e.amount)}`, c: "text-slate-300" };
    } else if (e.type === "tool_call" && e.name === "cover") {
      pendingCover = (e.args as { carrier_id?: string })?.carrier_id ?? null;
    } else if (e.type === "tool_result" && e.name === "cover" && pendingCover) {
      out[pendingCover] = e.ok ? { t: "COVERED", c: "text-emerald-300 font-semibold" } : { t: "409 · cover rejected", c: "text-rose-300 font-semibold" };
      pendingCover = null;
    } else if (e.type === "approval_needed") {
      const id = e.reason.split(":")[0];
      if (id) out[id] = { t: "needs approval", c: "text-amber-300 font-semibold" };
    }
  }
  return out;
}

function Row({ c, s }: { c: CarrierCandidate; s?: Status }) {
  const rejected = s?.t.startsWith("409");
  return (
    <li className={`rounded-lg border px-3 py-2 ${rejected ? "border-rose-500/50 bg-rose-500/10" : c.eligible ? "border-white/10 bg-white/[0.02]" : "border-white/5 opacity-50"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{c.name}</span>
        <span className={`shrink-0 text-xs ${s?.c ?? "text-slate-500"}`}>{s?.t ?? (c.eligible ? "not contacted" : "blocked")}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-slate-400">
        <span className="font-mono">{c.vendorId}</span>
        <span>{c.onTimeDeliveryPct ?? "—"}% on-time · {c.claims ?? 0} claims</span>
      </div>
      {c.warnings.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {c.warnings.map((w) => <span key={w} className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] text-amber-200">⚠ {w}</span>)}
        </div>
      )}
    </li>
  );
}

export default function Carriers({ brief, events }: { brief: LoadBrief; events: AgentEvent[] }) {
  const st = statuses(events);
  return (
    <div>
      <h3 className="mb-2 text-[10px] uppercase tracking-widest text-slate-500">Carriers (ranked by reliability)</h3>
      <ul className="space-y-1.5">{brief.carriers.map((c) => <Row key={c.vendorId} c={c} s={st[c.vendorId]} />)}</ul>
    </div>
  );
}
