"use client";

import type { AgentEvent } from "@/lib/types";
import { usd } from "./format";

type Approval = Extract<AgentEvent, { type: "approval_needed" }>;

export default function ApprovalPanel({ approval, onApprove, onReject, onSearch }: { approval: Approval; onApprove: () => void; onReject: () => void; onSearch?: () => void }) {
  const n = approval.numbers;
  return (
    <div className="border-t border-amber-300 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 shadow-[0_-8px_24px_-12px_rgba(180,83,9,0.25)] px-6 py-4">
      <div className="mx-auto w-full max-w-6xl animate-[rise_.4s_ease-out]">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-amber-700">Human approval required</div>
            <p className="mt-1 text-sm text-amber-900">{approval.reason}</p>
          </div>
          <div className="flex shrink-0 gap-6 text-right">
            {n.offer != null && <Stat k="Offer" v={usd(Number(n.offer))} />}
            {n.maxLinehaul != null && <Stat k="Ceiling" v={usd(Number(n.maxLinehaul))} />}
            {n.overCeiling != null && (Number(n.overCeiling) > 0 ? <Stat k="Over by" v={usd(Number(n.overCeiling))} bad /> : <Stat k="Under ceiling" v={usd(-Number(n.overCeiling))} />)}
            {n.resultingGpPct != null && <Stat k="Resulting GP" v={`${n.resultingGpPct}%`} bad />}
            {n.expectedChargeback != null && <Stat k="OTIF risk" v={usd(Number(n.expectedChargeback))} />}
            {n.riskAdjustedBuy != null && <Stat k="Risk-adj. linehaul" v={usd(Number(n.riskAdjustedBuy))} />}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-3">
          <button onClick={onReject} className="rounded-lg border border-stone-200 px-5 py-2 text-sm text-stone-800 transition active:scale-[0.97] motion-reduce:active:scale-100 hover:bg-stone-100">Reject · escalate to sales</button>
          {onSearch && (
            <button onClick={onSearch} className="rounded-lg border border-indigo-300 px-5 py-2 text-sm text-indigo-900 transition active:scale-[0.97] motion-reduce:active:scale-100 hover:bg-indigo-50">Look for another carrier</button>
          )}
          <button onClick={onApprove} className="rounded-lg bg-gradient-to-b from-amber-400 to-amber-500 px-5 py-2 text-sm font-semibold text-stone-950 shadow-sm transition active:scale-[0.97] motion-reduce:active:scale-100 hover:bg-amber-500">Approve and cover</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <div><div className="text-[10px] uppercase tracking-widest text-stone-500">{k}</div><div className={`font-mono text-lg font-semibold ${bad ? "text-rose-700" : "text-stone-900"}`}>{v}</div></div>
  );
}
