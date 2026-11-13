# TASKS — Facility-Aware Coverage Agent

Snapshot: **Fri Nov 13, 1:07 PM** — from `main`, `jay/queue-click`, and the hero load's activity log in the TMS.
Checkpoints: ~~1:00 read-only end-to-end~~ ✅ · ~~2:30 hero load live end-to-end~~ ✅ (done at 12:39) · **3:15 code freeze** · **4:00 done**.

Legend: `[x]` done · `[ ]` to do · ⚠️ needs attention

---

## Verified status (1:07 PM)

- `npm run typecheck`, `npm run lint`, `npm run build`: **pass**
- `fixtures/backend.test.ts`: **10/10 pass**
- **Live run succeeded on 7300176 at 12:39:** covered with LAKESHORE at $2,327 after human approval → FSC $527.25 + LUM $241.25 cost lines → rate con RC-7300176-1 → appointment REQUESTED 11/19 06:00–14:00 → agent note + sales escalation, all attributed to `API`
- **Reset worked at 12:47:** uncovered, agent FSC/LUM lines cancelled
- **Reject path worked at 12:59:** load left open, note + sales escalation written
- Hero load is **BOOKED** again

### Numbers the system actually computes (use these in the pitch, not the PRD estimates)
| | PRD estimate | Live system |
|---|---|---|
| Max linehaul at 18% floor | ≈ $2,063 | **$2,084.28** |
| Expected lumper | ≈ $262 | **$241.25** |
| Lane history margin | 12–13% | **14.76%** avg |
| Winning carrier (12:39 run) | — | LAKESHORE **$2,327** → GP ≈ **11.0%** |

---

## Branch status

| Branch | State |
|---|---|
| `main` | Everything through PR #11 (queue click) |
| `jay/queue-click` | ⚠️ **1 commit not on `main`:** `12132ea` carriers panel — no PR open |

---

## Jay — agent, tools, API routes

### Done
- [x] PRD.md, AGENTS.md, CLAUDE.md, TASKS.md (PR #1, #2, #6)
- [x] Next.js scaffold, `lib/types.ts`, deps, scripts (PR #3)
- [x] Agent loop (AI SDK v7), system prompt, step cap, pause on `request_approval`, resume on approve/reject
- [x] 9 tools with code-enforced ceiling; cover only at an accepted amount; FSC/LUM amounts from the brief, tagged `[coverage-agent]`
- [x] `/api/run` (NDJSON), `/api/approve`, `/api/queue`; hero found by details
- [x] Wired to `lib/tms.ts` + `lib/intel.ts`; live API mapping; 18% company floor (PR #7)
- [x] Swapped in Advika's `lib/carrierSim.ts` (PR #7)
- [x] Fixed `scripts/reset.ts` for the live cost format (PR #7)
- [x] Feed ordering (thought before tool call), no duplicate summary (PR #8)
- [x] Removed the 1:20 write clock — team went live early (PR #10)
- [x] Queue cards selectable; Run covers the selected load (PR #11)
- [x] Carriers panel with live status + warnings (`12132ea`, not merged)
- [x] **Live end-to-end run with writes on the hero load** (12:39)

### To do
- [ ] ⚠️ **Open a PR for `12132ea` (carriers panel) and merge.** It touches `components/*` (Advika's files) — give her a heads-up
- [ ] ⚠️ **Make the RUSTYRIG 409 happen every run.** The prompt only tries a YELLOW "budget" carrier; RUSTYRIG is RED, so the 409 isn't guaranteed. Fix in `lib/carrierSim.ts` (Advika's file — ask her or agree first): RUSTYRIG accepts at/below the ceiling → agent covers → TMS 409 → recovery. Confirm it in one live run
- [ ] **Tighten agent notes** (`lib/agent.ts` prompt): notes state only facts from tool results; name every 409 and its `detail`; sales escalation quotes `recommendedSell`, `resultingGpPct`, `gpWithDetentionPct` from the approval numbers (the 12:40 note said "escalated due to insurance issues with other carriers" — inaccurate)
- [ ] **Autonomy dial** (matches the hallway pitch): `APPROVAL_MODE=all|exceptions` (env or UI toggle) checked in `cover` — `all` requests approval before every cover. ~20 min; only if time allows
- [ ] Add `TMS_WRITES` and `NEXT_PUBLIC_TMS_UI_URL` to `.env.example`
- [ ] Optional: run a second BOOKED load in the demo to show it isn't hero-only

---

## Akshaya — backend data & rules

### Done
- [x] `lib/tms.ts`: throttled client, non-throwing results, pagination, all helpers (PR #5)
- [x] `lib/intel.ts`: `computeBrief`, `loadBriefResult`, `loadBrief`, `scoreCarrier`, `priceImpact` (PR #5)
- [x] `scripts/reset.ts`: preview by default, `--execute`, tagged FSC/LUM only (PR #5; live-format fix in PR #7)
- [x] Fixtures + `backend.test.ts` (10/10 passing) + handoff README (PR #5)
- [x] Live brief verified in practice: ceiling $2,084.28, lumper $241.25, lane history 14.76%

### To do
- [ ] Move "margin protected" math from `lib/agent.ts` (`protectedDollars`) into `lib/intel.ts` — PRD rule: all money math in intel (TODO already in the code)
- [ ] Refresh `fixtures/loadBrief.hero.json` with the live brief (market no longer `null`, live numbers above) so **Demo mode** matches **Live mode**
- [ ] Re-run `backend.test.ts` after any intel change
- [ ] Before the final demo: `npm run reset -- <id>` preview → `--execute`, confirm BOOKED with no agent cost lines

---

## Advika — UI

### Done
- [x] Three-column console: Queue, Feed, Economics, ApprovalPanel, Header with count-up "margin protected" (PR #9)
- [x] Lenis smooth scroll + `data-lenis-prevent` on inner panels
- [x] Seeded `lib/carrierSim.ts` (deterministic rehearsals)
- [x] Wired to `/api/run` (NDJSON), `/api/approve`, `/api/queue` with **Live / Demo** toggle (PR #9)
- [x] Approval panel reads `overCeiling`, `resultingGpPct`; margin meter compares at displayed precision (PR #9)
- [x] Replay timers cleaned up; lint fixed

### To do
- [ ] ⚠️ **"Open in TMS" link never renders.** `components/Economics.tsx` reads `NEXT_PUBLIC_TMS_UI_URL`, but `.env.local` only has `TMS_UI_URL`. Add `NEXT_PUBLIC_TMS_UI_URL=https://d34un8lk4yzrp0.cloudfront.net` to everyone's `.env.local`, and change the link to `${url}/shipments/${brief.shipmentId}?tab=activity` so it opens the load's activity log (the proof moment)
- [ ] ⚠️ RUSTYRIG change in `lib/carrierSim.ts` (see Jay's task) — your file, so you or Jay with your OK
- [ ] Make the 409 → recovered moment visually obvious in the feed (red error card → green "recovered")
- [ ] Make the economics card the visual centerpiece; shrink the negotiation chat (differentiator = the dock, not the haggling)
- [ ] Optional polish: shadcn init + one React Bits effect on the title / 409 moment
- [ ] Slides (PRD §13): problem → live run → TMS proof → escalation → close

---

## Team — demo readiness

- [ ] ⚠️ **Clean activity log for the demo.** Test runs left notes on 7300176 that reset can't remove (the 12:59 rejected-run notes are visible). Pick one:
  - ask Yusuf to reset the environment right after the 3:15 freeze (code finds the hero load by details, so new IDs are fine), **or**
  - run the final demo on a different BOOKED load
- [ ] Update pitch numbers to the **live system** table above (14.76% lane history, $2,084.28 ceiling)
- [ ] Pitch wording: "Facility-Aware Coverage Agent" — prices the dock, books routine loads itself, stages exceptions for the broker with the math done, sends sales the repricing case. Don't lead with "negotiation"
- [ ] **3:15 code freeze**
- [ ] 3:15–3:45: reset → rehearse twice → **screen-record a full backup run** (Live mode, writes on)
- [ ] 3:45–4:00: submit
