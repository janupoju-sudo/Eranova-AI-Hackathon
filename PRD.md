# PRD — Facility-Aware Coverage Agent

**Event:** Eranova AI Hackathon · Fri Nov 13, 2026 · **Code freeze 3:15 PM · Done by 4:00 PM**
**Team:** Jay (agent lead) · Akshaya (backend: data & rules) · Advika (UI)
**Environment:** Meridian TMS demo environment (team01) · OpenAI API keys provided
**Judging:** creativity · technical understanding · coolness · must use an agentic AI system

---

## 1. One-liner

> An AI agent that covers freight loads the way your best carrier rep would: it prices the **whole load** (including what the receiving dock will cost you), negotiates with carriers inside a **margin limit it cannot break**, recovers from business-rule errors on its own, and **escalates to a human** when the math doesn't work.

**Pitch close:** *"Code enforces the limits, AI makes the calls, humans approve the exceptions."*

---

## 2. Problem

A freight broker (Meridian Logistics) sells a load to a customer, then must hire a carrier to haul it ("covering" the load). Carrier reps price **the truck**, not **the dock**:

- Receiving facilities add costs that aren't in the linehaul rate: **lumper fees**, **detention** (paid to the carrier after 2 free hours of waiting), and **retailer chargebacks** for late or early delivery.
- Those costs land after the carrier is booked, so the broker's margin quietly disappears.
- Example in our data: the Northstar **Chicago → Big-Box DC135 (Dallas)** lane has run at **12–13% margin** against an **18% floor** across dozens of loads.

## 3. Why this, why Eranova

- Eranova's own 20-agent library covers quoting, tracking, POD, AP/AR, and Detention *Detection* — but has **no carrier-coverage agent**.
- Existing AI carrier-sales tools (Parade, HappyRobot, Lanesurf) negotiate the **linehaul rate**. We negotiate against the **full cost of the load**, using the TMS's own facility data and lane history.

---

## 4. Users & goals

**User:** carrier sales / dispatch rep at a brokerage (role `DISPATCH` in the TMS).

**Goals for the demo**
1. Cover BOOKED loads end-to-end through the real TMS API.
2. Never commit a carrier price above the computed margin ceiling without human approval.
3. Show self-correction on a real business-rule rejection (409).
4. Leave an auditable explanation on every load (visible in the TMS web app, attributed to `API`).
5. Surface lane-level repricing recommendations to sales.

**Non-goals (today)**
- Real phone/email to carriers (carriers are simulated agents).
- Booking appointments inside the facility portal (we request, a human books).
- Deploying to the cloud (run locally).

---

## 5. Hero load (demo anchor)

Find it by details, not ID (environment resets can change IDs): **customer NORTHSTAR, Chicago IL → Dallas TX, status BOOKED, pickup 11/17**. Currently **file 7300176**.

| Field | Value |
|---|---|
| Mode / equipment | TL · 53' dry van (`V`) |
| Freight | 22 pallets, 36,938 lb, machined steel |
| Pickup | NORTHSTAR-CHI, 11/17 08:00–14:00 CT, no appt |
| Delivery | **BBR-DC135**, 11/19 06:00–14:00 CT, **appt needed**, **MABD 11/19** |
| Miles | 925 |
| Sell (customer) | **$3,479.00** = FRT $2,691.75 + FSC $527.25 (0.57/mi) + LUM $260.00 |
| Buy (carrier) | $0 — not covered yet |
| Reference | PO-606428 |

**Facility BBR-DC135 (from the TMS)**
- Avg unload **150 min**; driver assist = **LUMPER**; lumper **required, $150–300**
- Note 11/04: *"Door 17-22 under repair; expect 30-45 min extra dwell"*
- Appointments via portal only; **48 h lead time**; **30 min grace**; reschedule < 24 h forfeits slot; 06:00–08:00 slots go 3+ days out
- **MABD/OTIF program:** chargeback **3% of PO value** for late arrival; **early delivery also non-compliant**
- Receiving Mon–Fri 06:00–14:00 CT; **seal required**, **photo ID required**, **CHEP** pallets
- Portal login: *"never store in TMS"* → agent must never request or handle credentials

**Lane history (same lane, same dock)**
| Load | Carrier linehaul | Lumper paid | GP |
|---|---|---|---|
| 7300105 (CLOSED) | $2,266.25 ($2.45/mi) · LAKESHORE | $290 · DOCKHANDS | 12.1% |
| 7300115 (POD_RECEIVED) | $2,303.25 ($2.49/mi) · CANYONFRT | $235 · DOCKHANDS | 13.3% |

**Expected math (intel module must reproduce)**
- Max total buy at 18% margin = 3,479 × 0.82 = **$2,852.78**
- − carrier fuel $527.25 − expected lumper ≈ $262 → **max linehaul ≈ $2,063 (≈ $2.23/mi)**
- Historical carriers take **$2.45–2.49/mi** → **floor unreachable at historical rates** → agent must escalate
- Expected dwell ≈ 150 min + 30–45 min = **3.0–3.25 h** → expected detention **≈ 1.0–1.25 h × $75 = $75–94** (not priced into sell)

**Carrier traps (planted in the data)**
- `RUSTYRIG` — status ACTIVE, but **cargo insurance expired 09/29/2026** → `POST /cover` returns **409**. Keep it visible as "eligible-looking" so the agent tries it and recovers.
- `BADWOLF` — **DO NOT USE**.
- Dry-van-capable TL carriers: ACMECARR, BLUERIDGE, CANYONFRT, GULFSTRMX, LAKESHORE, PRAIRIEHL, SUNRIDGE (+ RUSTYRIG, BADWOLF traps).

**Other planted data worth mentioning**
- Load 7300142 runs at 10.1% margin; its check-call note says "ETA 11:39" while the ETA field says 06:39 (UTC vs local mix-up).

---

## 6. Architecture

**Stack:** Next.js (App Router, TypeScript) · Tailwind + shadcn/ui · Vercel AI SDK (`ai`, `@ai-sdk/openai`) · `zod`
**Run locally** (`npm run build && npm start`). Do **not** deploy to Vercel today (serverless timeouts can kill a long agent run).

```
Browser (Advika)
  Queue · Live agent feed · Economics card · Negotiation chat · Approve/Reject
        │  fetch / stream
        ▼
Next.js API routes (Jay)
  /api/run       → runs the Coverage Agent, streams events
  /api/approve   → resumes a paused run with "approved" / "rejected"
  /api/queue     → BOOKED loads for the sidebar
  /api/reset     → uncovers the hero load for re-demo
        │
        ├── lib/agent.ts       Coverage Agent (OpenAI function calling)
        ├── lib/tools.ts       Tool definitions → TMS writes + intel + carrier sim
        ├── lib/intel.ts       ALL math and rules (Akshaya) — no LLM
        ├── lib/tms.ts         TMS API client (Akshaya)
        └── lib/carrierSim.ts  Simulated carrier agents (Advika)
```

**Principle:** plain code computes every number and enforces every rule; the LLM makes judgment calls, negotiates, recovers from errors and explains itself.

**Env (`.env.local`, server-only — never `NEXT_PUBLIC_`):**
```
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o          # or whatever model the organizers provide
TMS_API_BASE=...             # from secret.txt
TMS_API_KEY=...              # from secret.txt
```
Do not commit `.env.local` or `secret.txt`.

---

## 7. Team & ownership

| Person | Owns | Files | Definition of done |
|---|---|---|---|
| **Jay** — agent lead | Agent loop, system prompt, tool wiring, 409-to-model feedback, approval pause/resume, API routes | `lib/agent.ts`, `lib/tools.ts`, `app/api/*` | Agent covers the hero load end-to-end, recovers from RUSTYRIG 409, pauses for approval, writes notes |
| **Akshaya** — backend data & rules | TMS client, intel module, reset script, data correctness | `lib/tms.ts`, `lib/intel.ts`, `lib/types.ts`, `scripts/reset.ts` | `loadBrief(heroId)` returns the numbers in §5; carrier filter/score correct; reset works |
| **Advika** — UI | Page layout, live feed, economics card, negotiation chat, approval UI, carrier simulator, demo polish · **Lenis** smooth scroll + **React Bits** animated components (§9.7) | `app/page.tsx`, `app/providers.tsx`, `components/*`, `lib/carrierSim.ts`, `fixtures/*` | Judges can follow the agent's reasoning live; Approve button resumes the run; looks polished |

**First 15 minutes, all three together:** agree on `lib/types.ts` (below). After that, build in parallel.

---

## 8. Shared types (`lib/types.ts`) — agree first

```ts
export type Money = number; // USD, 2 decimals

export interface CarrierCandidate {
  vendorId: string;
  name: string;
  equipment: string[];
  status: "ACTIVE" | "PENDING" | "INACTIVE" | "DO_NOT_USE";
  cargoExpires: string | null;      // YYYY-MM-DD
  complianceLight: "GREEN" | "YELLOW" | "RED";
  onTimePickupPct: number | null;
  onTimeDeliveryPct: number | null;
  claims: number | null;
  loads: number | null;
  score: number;                     // computed by intel
  warnings: string[];                // e.g. "cargo insurance expired 2026-09-29"
  eligible: boolean;                 // false for DO_NOT_USE / wrong equipment
}

export interface LoadBrief {
  shipmentId: string;
  customerId: string;
  lane: { origin: string; destination: string; miles: number };
  equipment: string;
  weightLb: number;
  pickupWindow: { start: string; end: string; tz: string };
  deliveryWindow: { start: string; end: string; tz: string };
  mabdDate: string | null;
  sell: { total: Money; lines: { code: string; amount: Money }[] };
  facility: {
    id: string;
    avgUnloadMin: number | null;
    graceMin: number | null;
    lumperPolicy: string | null;
    lumperFeeRange: [Money, Money] | null;
    leadTimeHours: number | null;
    mabdProgramNote: string | null;
    receivingHours: string | null;
    complianceFlags: string[];
    notes: string[];
  };
  risk: {
    expectedDwellH: number;
    expectedDetentionH: number;
    expectedDetention$: Money;
    expectedLumper$: Money;
  };
  laneHistory: { loads: number; avgLinehaulPerMile: number | null; avgLumper$: Money | null; avgGpPct: number | null };
  market: { low: Money; target: Money; high: Money; rateId: string } | null;
  margin: {
    floorPct: number;
    maxBuyTotal: Money;
    carrierFuel$: Money;
    maxLinehaul: Money;
    floorReachableAtHistory: boolean;
  };
  carriers: CarrierCandidate[];      // sorted by score desc
  flags: string[];                   // human-readable: "margin floor unreachable at historical rates", ...
}

export type AgentEvent =
  | { type: "thought"; text: string }
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "tool_result"; name: string; ok: boolean; result: unknown }
  | { type: "negotiation"; carrierId: string; from: "broker" | "carrier"; text: string; amount?: Money }
  | { type: "approval_needed"; runId: string; reason: string; numbers: Record<string, Money | number> }
  | { type: "done"; summary: string; protected$?: Money };
```

---

## 9. Functional spec

### 9.1 `lib/tms.ts` (Akshaya)
- Base URL + `x-api-key` from env; JSON in/out.
- **Throttle ~150 ms between requests** (organizers: no load testing).
- On HTTP ≥ 400 return `{ ok: false, status, error, detail }` — never throw into the agent.
- `paginate(path, params)` follows `next_cursor` until `null` (pages can be empty while a cursor is still set).
- Helpers: `getShipment`, `listShipments(filters)`, `getFacility`, `getFacilityShipments`, `getCustomer`, `listVendors`, `getVendor`, `rateEngine(body)`, `cover`, `uncover`, `addCost`, `generateRateCon`, `dispatch`, `setAppointment`, `addShipmentNote`, `addFacilityNote`.

### 9.2 `lib/intel.ts` (Akshaya) — `loadBrief(shipmentId): Promise<LoadBrief>`
1. **Load:** `GET /shipments/{id}` → lane, windows (facility-local + tz), MABD, freight, sell lines.
2. **Facility:** `GET /facilities/{deliveryFacilityId}` → fields in §8.
3. **Risk:**
   - `expectedDwellH = avgUnloadMin/60 + extraFromNotes` (start with +0.6 h if a note mentions repair / extra dwell; the agent can also read notes itself)
   - `expectedDetentionH = max(0, expectedDwellH − 2)`; `expectedDetention$ = expectedDetentionH × 75` (DET catalog rate)
   - `expectedLumper$ = laneHistory.avgLumper$ ?? midpoint(lumperFeeRange)`
4. **Lane history:** `GET /facilities/{id}/shipments` → keep same origin city + customer, status `CLOSED`/`POD_RECEIVED`, newest ~8 → `GET /shipments/{id}` each → average carrier `FRT` per mile, average `LUM` cost, average `gp_pct`.
5. **Market:** `POST /rate-engine/quotes` `{ mode: "TL", origin:{state}, destination:{state}, miles, pickup_date }` → low/target/high from `market_context`.
6. **Margin:** `floorPct = customer.margin_floor_pct ?? 18`;
   `maxBuyTotal = sell.total × (1 − floorPct/100)`;
   `carrierFuel$ = fscPerMile × miles` (match the sell FSC line);
   `maxLinehaul = maxBuyTotal − carrierFuel$ − expectedLumper$`;
   `floorReachableAtHistory = laneHistory.avgLinehaulPerMile × miles ≤ maxLinehaul`.
7. **Carriers:** `GET /vendors?type=TRUCKLOAD_CARRIER` →
   - `eligible = false` if `DO_NOT_USE` or equipment doesn't include the load's equipment
   - add warning (but keep eligible) if status ≠ ACTIVE or no CARGO policy valid through delivery date — **so the agent can hit the real 409 on RUSTYRIG**
   - `score = 0.4·OTD + 0.3·OTP − 5·claims + min(loads/50, 5)`
8. **Flags:** margin floor unreachable, lumper required, seal/ID/CHEP rules, OTIF chargeback, appointment lead time, "portal credentials: never store".

**Acceptance:** for the hero load, output matches §5 within a few dollars.

### 9.3 `lib/carrierSim.ts` (Advika)
- One simulated persona per carrier (short system prompt: name, style, hidden minimum).
- Hidden minimum = `market.target_linehaul × factor`, factor 0.95–1.15; carriers with lower scores accept less.
- `respond(carrierId, offer, history) → { accept: boolean, counter?: number, text, driver?: { name, phone } }` — max 3 rounds.
- On accept, return a fake driver name/phone (needed for dispatch).
- Deterministic option (seeded) for rehearsals so the demo is repeatable.

### 9.4 `lib/tools.ts` (Jay)
| Tool | Behavior |
|---|---|
| `get_load_brief(shipment_id)` | Returns `LoadBrief` |
| `negotiate(carrier_id, offer, message)` | Calls carrier sim. **Code rejects `offer > maxLinehaul` unless the run is approved** |
| `cover(shipment_id, carrier_id, amount, driver_name, driver_phone)` | `POST /shipments/{id}/cover` |
| `add_cost(shipment_id, vendor_id, charge_code, amount, description)` | `POST /shipments/{id}/costs` — used for **FSC** (carrier fuel) and **LUM** (vendor `DOCKHANDS`) |
| `generate_rate_con(shipment_id)` | `POST /shipments/{id}/documents/generate` `{doc_type:"RATE_CONFIRMATION"}` |
| `request_appointment(shipment_id, stop_seq, earliest_local, latest_local)` | `PUT /shipments/{id}/stops/{seq}/appointment` with `status:"REQUESTED"` and the window (facility-local) |
| `add_note(shipment_id, text)` | `POST /shipments/{id}/notes` — the agent's explanation |
| `request_approval(reason, numbers)` | Ends the run in `approval_needed` state; UI shows Approve/Reject |
| `escalate_to_sales(shipment_id, text)` | Stores the repricing recommendation (and adds it as a note) |

Every tool returns `{ ok: true, result }` or `{ ok: false, error, detail }`.

### 9.5 `lib/agent.ts` (Jay)
- `streamText` with the tools above and a step limit (~20; `maxSteps` or `stopWhen` depending on the installed AI SDK version). Low temperature.
- **System prompt rules:**
  1. Call `get_load_brief` first; reason from its numbers — never compute money yourself.
  2. Never offer above `maxLinehaul` without approval.
  3. At docks with chargeback programs, value reliability (on-time %) over the cheapest rate.
  4. On any tool error, read `detail`, explain what happened, and adapt (e.g. pick the next carrier).
  5. If the margin floor is unreachable, negotiate the best price, then `request_approval` with the numbers, and `escalate_to_sales` with a repricing recommendation.
  6. After covering: add carrier FSC and LUM cost lines, generate the rate con, request the delivery appointment (11/19, inside 06:00–14:00 CT, ≥ 48 h out, not early), and write a note explaining every decision.
  7. Never ask for or handle facility portal credentials.
- Emits `AgentEvent`s to the UI.

### 9.6 Approval flow
- `request_approval` saves `{ runId, messages, shipmentId }` in a server-side `Map` and ends the run.
- UI shows the reason + numbers (offer, max linehaul, resulting GP %).
- `POST /api/approve { runId, decision }` → resumes the run with "Human approved/rejected: …" appended.
- Single local server process — in-memory map is fine.

### 9.7 UI (Advika)

**UI libraries**
- **Lenis** (smooth scrolling) — https://github.com/darkroomengineering/lenis
  - `npm i lenis`, import `lenis/dist/lenis.css`
  - React: wrap the app in a **client component** using `ReactLenis` from `lenis/react` with the `root` option (see `packages/react/README.md` in the repo for the exact API)
  - Scrollable inner panels (agent feed, negotiation chat, JSON viewers) need `data-lenis-prevent` so they scroll natively instead of being hijacked
- **React Bits** (animated components) — https://github.com/DavidHDev/react-bits · https://reactbits.dev
  - Install per component with the shadcn CLI, TypeScript + Tailwind flavor: `npx shadcn@latest add @react-bits/<Name>-TS-TW` (e.g. `SplitText-TS-TW`), or `npx jsrepo@latest add https://reactbits.dev/r/<Name>-TS-TW`
  - Agent setup: add the `@react-bits` registry (`https://reactbits.dev/r/{name}.json`) to `components.json` so your coding agent can pull components through the shadcn MCP server
  - Check each component's dependencies on reactbits.dev before installing (some use an animation library)
  - Suggested uses (confirm the exact names on reactbits.dev):
    - **Counter / count-up** → "$ margin protected" header counter and the margin meter number
    - **Animated list** → agent feed items sliding in as events stream
    - **Text effect (split / decrypt / shiny)** → hero title and the "409 → recovered" moment
    - **Spotlight / glow card** → economics card and the approval panel
    - **One subtle background** → landing/header only
  - **Performance rule:** no heavy WebGL backgrounds behind the live feed. The demo runs on a laptop while the agent streams; keep animations light and test with the real stream before 2:30.

**Layout**
- **Left:** queue of BOOKED loads (customer, lane, pickup, sell) with status chips as the agent works.
- **Center:** live agent feed — thoughts, tool calls (collapsible JSON), errors in red (the RUSTYRIG 409 should be visually obvious), negotiation as chat bubbles.
- **Right:** economics card — sell, max linehaul, offer, expected lumper, expected detention, **margin meter** vs floor, flags as badges.
- **Approval modal/panel** with Approve / Reject.
- **Header counter:** "$ margin protected" (sum of expected costs priced in + overpay avoided).
- Link to the load in the real TMS web app for the proof moment.

### 9.8 `scripts/reset.ts` (Akshaya)
- `POST /shipments/{id}/uncover` `{ reason: "OTHER", note: "demo reset" }` → back to BOOKED (carrier cost lines cancelled).
- Also cancel any FSC/LUM cost lines the agent added (`PUT /shipments/{id}/costs/{cost_id}` `{status:"CANCELLED"}`).
- **Test before 3:15.**

---

## 10. Timeline

| Time | Work | Checkpoint |
|---|---|---|
| 11:15–11:30 | Repo, `.env.local`, test OpenAI + TMS calls, agree on `types.ts` | Both APIs return data |
| 11:30–1:00 | Parallel build: Jay (agent loop + read-only tools) · Akshaya (`tms.ts`, `intel.ts`) · Advika (layout, feed, carrier sim) | **1:00:** `loadBrief(hero)` matches §5 · agent reads and *proposes* a carrier (no writes) · UI renders events |
| 1:00–1:20 | Lunch + wire pieces together | — |
| 1:20–2:30 | Write tools, negotiation, approval pause/resume, 409 recovery, reset script | **2:30:** hero load end-to-end: brief → negotiate → RUSTYRIG 409 → recover → approval → cover → FSC/LUM lines → rate con → appointment request → note |
| 2:30–3:15 | Run the full queue (9 loads), bug fixes, escalation note, UI polish, counter | **3:15 CODE FREEZE** |
| 3:15–3:45 | Reset, rehearse twice, **screen-record a full backup run** | Backup video saved |
| 3:45–4:00 | Buffer, submit | Done |

---

## 11. Cut lines (decide at each checkpoint)

Cut in this order if behind:
1. Full 9-load queue → hero load only
2. Appointment request
3. Lane history → rate engine only
4. Live negotiation → agent picks best carrier at market target
5. Live streaming → render events after the run finishes

**Never cut:** margin ceiling enforcement · 409 recovery · approval step · explanation notes.

---

## 12. Gotchas

- `POST /cover` with `amount` adds **only** a confirmed FRT cost line. Add **FSC** (0.57/mi × miles, vendor = carrier) and **LUM** (vendor `DOCKHANDS`) separately or margin looks inflated.
- Covering requires status `BOOKED`, carrier `ACTIVE`, and an **unexpired CARGO policy** → otherwise 409.
- Dispatch (optional) requires a **generated** rate con for the current carrier + `driver_name` + `driver_phone`. An uploaded rate con does not count.
- Appointment windows are **facility-local** (America/Chicago). A window ending after MABD end-of-day needs `acknowledge_mabd: true` — don't; stay inside MABD.
- "Today" in the API is **UTC** (7 PM Eastern is already tomorrow).
- Everything done with the API key shows as `API` in the activity log — use that in the demo.
- Margin is **on sell**, not markup: sell = buy ÷ (1 − margin).
- Throttle requests; cap agent steps.

---

## 13. Demo script (~3 min)

1. **Problem (20 s):** "Carrier reps price the truck, not the dock. At DC135 the dock adds a lumper, ~3 hours of dwell, and a 3% chargeback risk."
2. **Run (90 s):** Start the queue → zoom into the hero load → brief appears with flag *"margin floor unreachable at historical rates"* → agent tries RUSTYRIG → **409: cargo insurance expired** → agent explains and moves on → negotiation in chat → approval panel → click **Approve**.
3. **Proof (40 s):** Open the real TMS web app: load COVERED, FRT/FSC/LUM cost lines, rate confirmation generated, appointment requested, agent notes — all attributed to `API`.
4. **Close (30 s):** Show the escalation: "This lane runs 12–13% vs an 18% floor; here's the repricing case for sales." → *"Code enforces the limits, AI makes the calls, humans approve the exceptions."*

---

## 14. Success criteria

- Hero load covered end-to-end via the API with correct ledgers.
- Visible self-correction on the RUSTYRIG 409.
- No carrier offer above `maxLinehaul` without a human click.
- Every agent action explained in a TMS note.
- Backup recording exists before 3:45.

## 15. Working with coding agents (all three of us)

Each of us is driving the build with a coding agent. To keep three agents from colliding:

1. **Give your agent this PRD first**, then tell it your name and section. Example: *"I'm Akshaya. Read PRD.md. Build §9.1 and §9.2 only."*
2. **Stay in your own files** (§7). Agents must not edit another person's files. If a change is needed elsewhere, tell that person.
3. **`lib/types.ts` is the contract.** Agents may read it, never change it alone. Changes are agreed out loud, then made once by Jay.
4. **Build against fixtures first.** Akshaya commits `fixtures/loadBrief.hero.json` (the §5 numbers, shaped as `LoadBrief`) and `fixtures/events.sample.json` (a fake `AgentEvent` run, including the RUSTYRIG 409 and an `approval_needed`) **by 11:45**. Advika's UI and Jay's prompt work run on fixtures until the real modules land.
5. **Small commits, pull often.** Commit each working piece; pull before asking your agent for a big change. Branch per person (`jay/agent`, `akshaya/data`, `advika/ui`), merge to `main` at each checkpoint.
6. **Secrets stay in `.env.local`.** Don't paste the API key or password into agent prompts or commit them. Agents read keys from env.
7. **Read-only until 1:20.** Agents should only call read routes (GET, `rate-engine`, `price-preview`) before the write phase, so the hero load stays BOOKED for testing.
8. **Verify, don't trust.** After an agent says something works, run it: the intel numbers must match §5, and the UI must render the fixtures.
9. **Don't let agents load-test.** Keep the 150 ms throttle; no loops over all shipments without a cap.

Recommended: put a short `AGENTS.md` at the repo root that repeats rules 2–9, so every coding agent picks them up automatically.

## 16. Risks

| Risk | Mitigation |
|---|---|
| Agent loop too slow / flaky live | Seeded carrier sim, low temperature, backup video |
| Environment reset changes IDs | Find hero load by customer + lane + status |
| Demo can only run once | `scripts/reset.ts`, tested before freeze |
| Streaming UI not ready | Fall back to rendering events after the run |
| Over-scoped | Cut lines in §11 at each checkpoint |
