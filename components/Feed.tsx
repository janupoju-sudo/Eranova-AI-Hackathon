"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentEvent, LoadBrief } from "@/lib/types";
import { usd } from "./format";

function Json({ value }: { value: unknown }) {
  return <pre data-lenis-prevent className="max-h-48 overflow-auto rounded-md bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-slate-300">{JSON.stringify(value, null, 2)}</pre>;
}

/** Strip Markdown markers (**bold**, ### headings) the model sometimes puts in its reasoning. */
const plain = (t: string) => t.replace(/\*\*/g, "").replace(/(^|\s)#{1,6}\s+/g, "$1");

type Call = Extract<AgentEvent, { type: "tool_call" }>;
type Result = Extract<AgentEvent, { type: "tool_result" }>;

/** Plain-language label for a tool step: what the agent is doing now, and what it did. */
function stepLabel(e: Call, names: Record<string, string>): { doing: string; done: string | null } {
  const a = (e.args ?? {}) as { carrier_id?: string; charge_code?: string };
  const who = a.carrier_id ? names[a.carrier_id] ?? a.carrier_id : "the carrier";
  switch (e.name) {
    case "get_load_brief": return { doing: "Reading the load, the dock and the carriers", done: "Read the load, the dock and the carriers" };
    case "negotiate": return { doing: `Negotiating with ${who}`, done: null }; // the chat bubbles are the record
    case "cover": return { doing: `Booking ${who} in the TMS`, done: `Booked ${who} in the TMS` };
    case "add_cost": return a.charge_code === "LUM"
      ? { doing: "Adding the dock lumper fee", done: "Added the dock lumper fee" }
      : { doing: "Adding carrier fuel", done: "Added carrier fuel" };
    case "generate_rate_con": return { doing: "Generating the rate confirmation", done: "Generated the rate confirmation" };
    case "request_appointment": return { doing: "Requesting the delivery appointment", done: "Requested the delivery appointment" };
    case "add_note": return { doing: "Writing the decision note", done: "Saved the decision note to the load" };
    case "request_approval": return { doing: "Preparing the approval request", done: null }; // the approval card is the record
    case "escalate_to_sales": return { doing: "Sending sales the repricing case", done: "Sent sales the repricing case" };
    default: return { doing: `Running ${e.name}`, done: `Finished ${e.name}` };
  }
}

/** One quiet line per finished step. Click to see exactly what was sent and what came back. */
function Step({ call, result, names }: { call: Call; result: Result; names: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const label = stepLabel(call, names).done;
  if (!label) return null;
  const dry = typeof result.result === "object" && result.result !== null && (result.result as { dryRun?: boolean }).dryRun === true;
  return (
    <div className="animate-[fadein_.35s_ease-out] motion-reduce:animate-none">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="group flex w-full items-center gap-2 rounded-md py-0.5 text-left text-sm text-slate-400 transition-colors hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
        <span aria-hidden className="text-emerald-400">✓</span>
        <span>{label}</span>
        {dry && <span className="rounded bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">dry run · not sent to TMS</span>}
        <span className="ml-auto text-xs text-slate-600 group-hover:text-slate-400">{open ? "hide" : "details"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <p className="font-mono text-[11px] text-slate-500">{call.name} · sent</p><Json value={call.args} />
          <p className="font-mono text-[11px] text-slate-500">{call.name} · returned</p><Json value={result.result} />
        </div>
      )}
    </div>
  );
}

/** What the agent is doing right now, as one shimmering line at the bottom of the feed. */
function Working({ text }: { text: string }) {
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-2 pl-0.5 text-sm">
      <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-emerald-400 motion-reduce:animate-none" />
      <span className="shimmer-text">{text}…</span>
    </p>
  );
}

function ToolResult({ e, recovered }: { e: Extract<AgentEvent, { type: "tool_result" }>; recovered: boolean }) {
  const [open, setOpen] = useState(false);
  const detail = !e.ok && typeof e.result === "object" && e.result ? (e.result as { status?: number; error?: string; detail?: string }) : null;
  if (!e.ok) {
    return (
      <div className="rounded-xl border border-rose-500/50 bg-rose-500/10 p-4">
        <div className="flex items-center gap-2">
          <span className="rounded bg-rose-500 px-2 py-0.5 font-mono text-xs font-bold text-white">{detail?.status ?? detail?.error ?? "ERR"}</span>
          <span className="text-sm font-semibold text-rose-200">The system refused this step ({e.name})</span>
          {recovered && <span className="ml-auto rounded bg-emerald-400/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">agent recovered →</span>}
        </div>
        {detail?.detail && <p className="mt-2 text-sm text-rose-100">{detail.detail}</p>}
        <p className="mt-2 text-xs text-rose-300/80">The agent reads this, explains it, and adapts.</p>
        <button onClick={() => setOpen(!open)} className="mt-2 text-xs text-rose-300 underline-offset-2 hover:underline">{open ? "hide raw" : "raw response"}</button>
        {open && <div className="mt-2"><Json value={e.result} /></div>}
      </div>
    );
  }
  return null; // successful steps are shown by <Step>
}

function Bubble({ e, name }: { e: Extract<AgentEvent, { type: "negotiation" }>; name?: string }) {
  const broker = e.from === "broker";
  return (
    <div className={`flex ${broker ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${broker ? "rounded-br-sm bg-emerald-400/15 text-emerald-50" : "rounded-bl-sm bg-white/[0.07] text-slate-100"}`}>
        <div className="mb-0.5 flex items-center justify-between gap-4 text-[10px] uppercase tracking-widest text-slate-400">
          <span>{broker ? `Broker agent → ${name ?? e.carrierId}` : name ? `${name} · ${e.carrierId}` : e.carrierId}</span>
          {e.amount != null && <span className="font-mono text-sm font-semibold normal-case tracking-normal text-white">{usd(e.amount)}</span>}
        </div>
        <p className="text-sm leading-snug">{e.text}</p>
      </div>
    </div>
  );
}

/**
 * The moment the TMS refuses a carrier. Shows who was blocked and why (the TMS's own sentence),
 * then fills in what the agent did next once it happens.
 */
function Blocked({ e, events, i, names }: { e: Extract<AgentEvent, { type: "tool_result" }>; events: AgentEvent[]; i: number; names: Record<string, string> }) {
  const call = [...events.slice(0, i)].reverse().find((x) => x.type === "tool_call" && x.name === "cover");
  const carrierId = call?.type === "tool_call" ? (call.args as { carrier_id?: string }).carrier_id ?? "?" : "?";
  const r = (e.result ?? {}) as { error?: string; detail?: string };
  const status = r.error?.split(" ")[0] ?? "ERR";
  const name = (id: string) => names[id] ?? id;
  let next: string | null = null;
  for (const x of events.slice(i + 1)) {
    if (x.type === "approval_needed") { const id = x.reason.split(":")[0]; next = `Asked you to approve ${name(id)} at ${usd(Number(x.numbers.offer))}.`; break; }
    if (x.type === "tool_call" && x.name === "cover") { const id = (x.args as { carrier_id?: string }).carrier_id ?? "?"; next = `Covering with ${name(id)} instead.`; break; }
    if (x.type === "negotiation" && x.from === "broker") { next = `Went back to ${name(x.carrierId)} to negotiate.`; break; }
  }
  return (
    <div className="animate-[shake_.5s_ease-in-out_1] overflow-hidden rounded-xl border-2 border-rose-500/70 bg-rose-500/10 motion-reduce:animate-none">
      <div className="flex items-center gap-3 bg-rose-500/20 px-4 py-2">
        <span className="rounded bg-rose-500 px-2 py-0.5 font-mono text-sm font-bold text-white">{status}</span>
        <span className="font-semibold text-rose-100">The TMS blocked this carrier</span>
      </div>
      <div className="px-4 py-3">
        <p className="text-lg font-semibold text-white">{name(carrierId)}</p>
        <p className="mt-1 text-sm text-rose-100">{r.detail ?? "Cover rejected."}</p>
      </div>
      <div className={`border-t px-4 py-2.5 text-sm ${next ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-rose-500/30 text-rose-200/80"}`}>
        {next ? <><b>Recovered.</b> {next}</> : "The agent is reading the rejection and choosing another carrier…"}
      </div>
    </div>
  );
}

export default function Feed({ events, error, busy }: { events: AgentEvent[]; error: string | null; busy?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // Carrier display names from the load brief, so bubbles read "Rusty Rig Transport Co. · RUSTYRIG".
  const brief = events.find((x) => x.type === "tool_result" && x.name === "get_load_brief" && x.ok);
  const names: Record<string, string> = Object.fromEntries(((brief?.type === "tool_result" ? (brief.result as LoadBrief).carriers : undefined) ?? []).map((c) => [c.vendorId, c.name]));
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" }); }, [events.length, error]);
  // The step in flight: the last tool call that has no result yet. Otherwise the model is deciding what to do next.
  let pending: Call | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const x = events[i];
    if (x.type === "tool_result") break;
    if (x.type === "tool_call") { pending = x; break; }
  }
  const working = busy ? (pending ? stepLabel(pending, names).doing : "Thinking") : null;
  return (
    <main className="flex min-h-0 flex-col border-l border-white/10">
      <div className="flex items-baseline justify-between px-5 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Live agent feed</h2>
        <span className="font-mono text-xs text-slate-500">{events.filter((x) => x.type === "tool_call").length} steps</span>
      </div>
      <div ref={ref} data-lenis-prevent className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-6">
        {events.length === 0 && (
          <div className="grid h-full place-items-center text-center text-slate-500">
            <div><p className="text-lg text-slate-300">Ready.</p><p className="mt-1 text-sm">Press “Run coverage agent” to start.</p></div>
          </div>
        )}
        {events.map((e, i) => {
          const k = `${i}-${e.type}`;
          switch (e.type) {
            case "thought":
              if (e.text.startsWith("🔎")) {
                return <p key={k} className="animate-[fadein_.35s_ease-out] rounded-lg bg-sky-400/10 px-3 py-2 text-sm font-medium text-sky-100">{e.text.replace(/^🔎\s*/u, "")}</p>;
              }
              if (/^[✅⛔]/u.test(e.text)) {
                const ok = e.text.startsWith("✅");
                return (
                  <p key={k} className={`animate-[fadein_.35s_ease-out] rounded-lg px-3 py-2 text-sm font-medium ${ok ? "bg-emerald-400/10 text-emerald-200" : "bg-rose-500/10 text-rose-200"}`}>
                    {e.text.replace(/^[✅⛔]\s*/u, ok ? "✓ " : "✕ ")}
                  </p>
                );
              }
              return <p key={k} className="animate-[fadein_.35s_ease-out] border-l-2 border-slate-600 pl-4 text-[15px] leading-relaxed text-slate-300">{plain(e.text)}</p>;
            case "tool_call": {
              const r = events.slice(i + 1).find((x) => x.type === "tool_result");
              return r?.type === "tool_result" && r.ok ? <Step key={k} call={e} result={r} names={names} /> : null;
            }
            case "tool_result":
              if (!e.ok && e.name === "cover") return <div key={k}><Blocked e={e} events={events} i={i} names={names} /></div>;
              if (e.ok) return null;
              return <div key={k} className="animate-[fadein_.35s_ease-out]"><ToolResult e={e} recovered={events.slice(i + 1).some((x) => x.type === "tool_call" || x.type === "negotiation")} /></div>;
            case "negotiation": return <div key={k} className="animate-[fadein_.35s_ease-out]"><Bubble e={e} name={names[e.carrierId]} /></div>;
            case "approval_needed":
              return <div key={k} className="rounded-xl border border-amber-400/50 bg-amber-400/10 p-4 text-sm text-amber-100"><b>Paused for human approval.</b> {e.reason}</div>;
            case "done":
              return <div key={k} className="rounded-xl border border-emerald-400/50 bg-emerald-400/10 p-4 text-sm text-emerald-100"><b>Done.</b> {e.summary}</div>;
          }
        })}
        {working && !error && <Working text={working} />}
        {error && <div className="rounded-xl border border-rose-500/60 bg-rose-500/10 p-4 text-sm text-rose-100"><b>Backend problem.</b> {error} Check that .env.local is filled in and the server is running, or switch to Demo.</div>}
      </div>
    </main>
  );
}
