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

function Row({ c, s, detailed }: { c: CarrierCandidate; s?: Status; detailed?: boolean }) {
  const rejected = s?.t.startsWith("409");
  return (
    <li className={`rounded-lg border px-3 py-2 ${rejected ? "border-rose-500/50 bg-rose-500/10" : c.eligible ? "border-white/10 bg-white/[0.02]" : "border-white/5 opacity-50"}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-start gap-2">
          <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-slate-100">{c.vendorId}</span>
          <span className="text-sm font-medium leading-snug">{c.name}</span>
        </span>
        <span className={`shrink-0 text-xs ${s?.c ?? "text-slate-500"}`}>{s?.t ?? (c.eligible ? "not contacted" : "blocked")}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-slate-400">
        <span>{c.status === "ACTIVE" ? "Active" : c.status.replaceAll("_", " ")} · score {c.score}</span>
        <span>
          {c.onTimeDeliveryPct ?? "—"}% on-time · {c.claims ?? 0} claims
          {c.expectedChargeback$ != null && <span className="text-amber-200" title="(1 − on-time %) × OTIF chargeback % × PO value"> · OTIF risk {usd(c.expectedChargeback$)}</span>}
        </span>
      </div>
      {detailed && (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-400">
          <span>{c.onTimePickupPct ?? "—"}% on-time pickup</span>
          <span>{c.loads ?? 0} loads hauled</span>
          <span>cargo insurance {c.cargoExpires ? `to ${c.cargoExpires}` : "not on file"}</span>
          <span>equipment {c.equipment.join(", ") || "—"}</span>
        </div>
      )}
      {c.warnings.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {c.warnings.map((w) => <span key={w} className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] text-amber-200">⚠ {w}</span>)}
        </div>
      )}
    </li>
  );
}

export default function Carriers({ brief, events, detailed }: { brief: LoadBrief; events: AgentEvent[]; detailed?: boolean }) {
  const st = statuses(events);
  return (
    <div>
      <h3 className="mb-2 text-[10px] uppercase tracking-widest text-slate-500">Carriers (ranked by reliability)</h3>
      {brief.risk.chargebackPct != null && (
        <p className="mb-2 text-[10px] text-slate-500">OTIF risk = late rate × {brief.risk.chargebackPct}% of {brief.risk.poValueAssumed ? "assumed " : ""}PO value {usd(brief.risk.poValue$)}</p>
      )}
      <ul className="space-y-1.5">{brief.carriers.map((c) => <Row key={c.vendorId} c={c} s={st[c.vendorId]} detailed={detailed} />)}</ul>
    </div>
  );
}
