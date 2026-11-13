# TASKS — Facility-Aware Coverage Agent

Snapshot: **Fri Nov 13, 12:06 PM** from `main`, `jay/agent`, `advika/ui`, `codex/assigned-work`.
Checkpoints: **1:00** read-only end-to-end · **1:20** writes allowed · **2:30** hero load live end-to-end · **3:15 code freeze** · **4:00** done.

Legend: `[x]` done · `[ ]` to do · ⚠️ needs attention

---

## Branch status

| Branch | State |
|---|---|
| `main` | Docs + scaffold + Akshaya's backend (PR #5) + Jay's first agent pass (PR #4) |
| `jay/agent` | **3 commits not on `main`** (wire to tms/intel, negotiation tuning, live API mapping) — no open PR |
| `advika/ui` | **1 commit not on `main`** (console UI, carrier sim) — no open PR; branched before #4/#5 merged |
| `codex/assigned-work` | Merged (PR #5) |

---

## Jay — agent, tools, API routes

### Done
- [x] PRD.md, AGENTS.md, CLAUDE.md (PR #1, #2)
- [x] Next.js scaffold, `lib/types.ts` (PRD §8), deps, `npm run reset` / `typecheck` (PR #3)
- [x] `lib/agent.ts`: Coverage Agent loop (AI SDK v7), system prompt, step cap, pauses on `request_approval`, resume on approve/reject, in-memory run store
- [x] `lib/tools.ts`: 9 tools — `get_load_brief`, `negotiate`, `cover`, `add_cost`, `generate_rate_con`, `request_appointment`, `add_note`, `request_approval`, `escalate_to_sales`
  - [x] Ceiling enforced in code; cover only at an amount a carrier actually accepted
  - [x] FSC/LUM amounts come from the brief, tagged `[coverage-agent]` (reset depends on this)
  - [x] Write gate: TMS writes only when `TMS_WRITES=1`, dry-run otherwise
- [x] API routes: `POST /api/run` (NDJSON stream), `POST /api/approve` (`{ runId, decision: "approved" | "rejected", note? }`), `GET /api/queue` (PR #4)
- [x] Hero load found by details (NORTHSTAR, Chicago → Dallas, BOOKED), fallback 7300176
- [x] Temporary carrier sim `app/api/_lib/devDeps.ts`
- [x] On `jay/agent` (unmerged): agent wired to `lib/tms.ts` + `lib/intel.ts`; one tool call per step; counter at ceiling, try top 3 carriers; live API mapping in intel; 18% company floor
- [x] `/api/reset` route added, then cut (reset stays a script)

### To do
- [ ] ⚠️ Open a PR for `jay/agent` → `main`. It changes `lib/intel.ts` and `lib/tms.ts` (Akshaya's files) — **get Akshaya's review before merging**
- [ ] **By 1:00:** live read-only run on the hero load (`TMS_WRITES` unset): brief → negotiation → approval → dry-run writes; share the event log with Advika
- [ ] Swap `devRespond` for `lib/carrierSim.ts` once `advika/ui` is on `main` (small adapter: `SimReply` → `CarrierReply`, keep the driver name/phone)
- [ ] **After 1:20:** `TMS_WRITES=1` end-to-end on the hero load, including the real RUSTYRIG 409 from `/cover` (target **2:30**)
- [ ] Check `request_appointment` output: facility-local window on **11/19**, inside **06:00–14:00 CT**, status `REQUESTED`, no `acknowledge_mabd`
- [ ] Verify in the TMS web app after a live run: FRT + FSC + LUM costs, rate con generated, appointment requested, agent note — all by `API`
- [ ] 2:30–3:15: run the rest of the BOOKED queue (cut line: hero only)

---

## Akshaya — backend data & rules

### Done
- [x] `lib/tms.ts`: throttled client (~150 ms), non-throwing `{ ok, result }` / `{ ok:false, status, error, detail }`, pagination, all PRD helpers, **writes blocked before 1:20 PM** (PR #5)
- [x] `lib/intel.ts`: `computeBrief`, `loadBriefResult`, `loadBrief`, `scoreCarrier`, `priceImpact` (approval-panel numbers, GP incl. detention, suggested sell)
- [x] `scripts/reset.ts`: preview by default, `--execute` to uncover + cancel only `[coverage-agent]` FSC/LUM costs; BOOKED/COVERED only; verifies after
- [x] Fixtures: `loadBrief.hero.json`, `events.sample.json`, `backend.test.ts`, handoff `README.md`

### To do
- [ ] ⚠️ Review Jay's edits to `lib/intel.ts` / `lib/tms.ts` on `jay/agent` (live API mapping, company floor) and approve/merge
- [ ] ⚠️ **Check `scripts/reset.ts` against the live API.** It reads the raw `getShipment` response but expects `costs[].id`; the live API returns `vendor_costs[].cost_id` (the mapping now lives in intel on `jay/agent`). Likely returns `INVALID_SHIPMENT` until it reuses that mapping. Run the preview now: `npm run reset -- 7300176`
- [ ] **By 1:00:** verify live `loadBrief` for the hero load matches PRD §5 — max linehaul ≈ **$2,063**, lane history ≈ **$2.45–2.49/mi**, expected dwell ≈ **3 h**, flag "margin floor unreachable at historical rates", RUSTYRIG warning (eligible-looking), BADWOLF ineligible
- [ ] Confirm the rate-engine `market_context` field names live (fixtures README marks them unverified)
- [ ] Refresh `fixtures/loadBrief.hero.json` with a real live brief (market no longer `null`) so the UI shows real numbers
- [ ] **After 1:20, before 3:15:** test `npm run reset -- <id> --execute` on the hero load after a live run

---

## Advika — UI

### Done
- [x] Three-column console on mock data: `Queue`, `Feed`, `Economics`, `ApprovalPanel`, `Header` with count-up "$ protected" (`advika/ui`)
- [x] Scripted replay (`useReplay`) with approve/reject flow
- [x] Lenis smooth scroll (`app/providers.tsx`), `data-lenis-prevent` on feed and JSON panels
- [x] `lib/carrierSim.ts`: seeded, deterministic carrier simulator (no LLM)

### To do
- [ ] ⚠️ Open a PR `advika/ui` → `main`; rebase on current `main` first (`app/page.tsx` changed on both sides)
- [ ] Wire `useReplay` to the real backend:
  - `POST /api/run` `{ shipmentId? }` → **NDJSON** (one `AgentEvent` JSON per line — read with `response.body.getReader()`, not EventSource/SSE)
  - `POST /api/approve` `{ runId, decision: "approved" | "rejected" }` using `runId` from the `approval_needed` event
  - Keep the mock replay behind a toggle as the demo fallback
- [ ] Queue from `GET /api/queue`
- [ ] Economics card from the `get_load_brief` tool result; approval numbers from the `approval_needed` event (no money math in the UI)
- [ ] "Open in TMS" link for the proof moment (web app URL is in `.env.local` as `TMS_UI_URL`; pass it through an API route or hardcode the non-secret UI URL)
- [ ] Make the RUSTYRIG 409 visually obvious in the feed (red error → "recovered")
- [ ] Optional polish: `npx shadcn@latest init`, then React Bits components (`@react-bits/<Name>-TS-TW`)
- [ ] Demo script + slides (PRD §13)

---

## Team

- [ ] **1:00 checkpoint** — live read-only run renders in the real UI
- [ ] Merge `jay/agent` and `advika/ui` into `main` right after 1:00
- [ ] **2:30 checkpoint** — hero load end-to-end with live writes
- [ ] **3:15 code freeze**
- [ ] 3:15–3:45 reset, rehearse twice, **screen-record a backup run**
- [ ] 3:45–4:00 submit
