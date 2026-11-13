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
      else if (e.amount != null && e.amount === lastBroker[e.carrierId]) out[e.carrierId] = { t: `accepted ${usd(e.amount)}`, c: "text-emerald-700" };
      else if (e.amount != null) out[e.carrierId] = { t: `wants ${usd(e.amount)}`, c: "text-stone-700" };
    } else if (e.type === "tool_call" && e.name === "cover") {
      pendingCover = (e.args as { carrier_id?: string })?.carrier_id ?? null;
    } else if (e.type === "tool_result" && e.name === "cover" && pendingCover) {
      out[pendingCover] = e.ok ? { t: "COVERED", c: "text-emerald-700 font-semibold" } : { t: "409 · cover rejected", c: "text-rose-700 font-semibold" };
      pendingCover = null;
    } else if (e.type === "approval_needed") {
      const id = e.reason.split(":")[0];
      if (id) out[id] = { t: "needs approval", c: "text-amber-700 font-semibold" };
    }
  }
  return out;
}

const light = { GREEN: "bg-emerald-500", YELLOW: "bg-amber-400", RED: "bg-rose-600" } as const;

/** Compact row used beside the economics while the agent runs: who, live status, the two numbers that matter. */
function Row({ c, s }: { c: CarrierCandidate; s?: Status }) {
  const rejected = s?.t.startsWith("409");
  return (
    <li className={`rounded-xl border px-3.5 py-2.5 ${rejected ? "border-rose-300 bg-rose-50" : c.eligible ? "border-stone-200 bg-white" : "border-stone-100 opacity-50"}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden className={`size-2 shrink-0 rounded-full ${light[c.complianceLight]}`} />
          <span className="shrink-0 font-mono text-xs font-semibold tracking-wide text-stone-900">{c.vendorId}</span>
        </span>
        <span className={`shrink-0 text-sm ${s?.c ?? "text-stone-500"}`}>{s?.t ?? (c.eligible ? "not contacted" : "blocked")}</span>
      </div>
      <p className="mt-1 text-sm leading-snug text-stone-700">{c.name}</p>
      <p className="mt-1 text-xs text-stone-500">
        {c.onTimeDeliveryPct ?? "—"}% on time
        {c.expectedChargeback$ != null && <span className="text-amber-800" title="(1 − on-time %) × OTIF chargeback % × PO value"> · OTIF risk {usd(c.expectedChargeback$)}</span>}
      </p>
      {c.warnings.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {c.warnings.map((w) => <span key={w} className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">⚠ {w}</span>)}
        </div>
      )}
    </li>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: "warn" }) {
  return (
    <div>
      <div className="text-xs text-stone-500">{k}</div>
      <div className={`mt-0.5 font-mono text-xl font-semibold tabular-nums ${tone === "warn" ? "text-amber-800" : "text-stone-900"}`}>{v}</div>
    </div>
  );
}

/** Full card used before a run: everything the TMS knows about the carrier, readable from the back of a room. */
function Card({ c }: { c: CarrierCandidate }) {
  const verdict = !c.eligible ? { t: "Do not use", c: "bg-rose-100 text-rose-800" }
    : c.warnings.length ? { t: "Check compliance", c: "bg-amber-100 text-amber-800" }
    : { t: "Eligible", c: "bg-emerald-100 text-emerald-800" };
  return (
    <li className={`flex flex-col rounded-2xl border p-5 ${c.eligible ? "border-stone-200 bg-white" : "border-stone-100 bg-white opacity-60"}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-md bg-stone-100 px-2 py-1 font-mono text-sm font-semibold tracking-wide text-stone-900">{c.vendorId}</span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${verdict.c}`}>{verdict.t}</span>
      </div>
      <p className="mt-3 text-base font-medium leading-snug text-stone-900">{c.name}</p>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat k="On-time delivery" v={c.onTimeDeliveryPct != null ? `${c.onTimeDeliveryPct}%` : "—"} />
        <Stat k="Claims" v={String(c.claims ?? 0)} />
        <Stat k="OTIF risk" v={c.expectedChargeback$ != null ? usd(c.expectedChargeback$) : "—"} tone="warn" />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-stone-100 pt-3 text-sm">
        <dt className="text-stone-500">On-time pickup</dt><dd className="text-right text-stone-700">{c.onTimePickupPct ?? "—"}%</dd>
        <dt className="text-stone-500">Loads hauled</dt><dd className="text-right text-stone-700">{c.loads ?? 0}</dd>
        <dt className="text-stone-500">Cargo insurance</dt><dd className="text-right text-stone-700">{c.cargoExpires ? `to ${c.cargoExpires}` : "not on file"}</dd>
        <dt className="text-stone-500">Equipment</dt><dd className="text-right text-stone-700">{c.equipment.join(", ") || "—"}</dd>
      </dl>
      {c.warnings.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {c.warnings.map((w) => <span key={w} className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-800">⚠ {w}</span>)}
        </div>
      )}
    </li>
  );
}

export default function Carriers({ brief, events, detailed }: { brief: LoadBrief; events: AgentEvent[]; detailed?: boolean }) {
  const st = statuses(events);
  const note = brief.risk.chargebackPct != null
    ? `OTIF risk = late rate × ${brief.risk.chargebackPct}% of ${brief.risk.poValueAssumed ? "assumed " : ""}PO value ${usd(brief.risk.poValue$)}`
    : null;
  if (detailed) {
    return (
      <div>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold tracking-tight text-stone-900">{brief.carriers.length} carriers on file</h3>
          {note && <p className="text-sm text-stone-500">{note}</p>}
        </div>
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{brief.carriers.map((c) => <Card key={c.vendorId} c={c} />)}</ul>
      </div>
    );
  }
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold text-stone-800">Carriers</h3>
      {note && <p className="mb-3 text-xs text-stone-500">{note}</p>}
      <ul className="space-y-2">{brief.carriers.map((c) => <Row key={c.vendorId} c={c} s={st[c.vendorId]} />)}</ul>
    </div>
  );
}
