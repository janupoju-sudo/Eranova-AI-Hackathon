# Backend handoff

`loadBrief.hero.json` is a live read-only snapshot of shipment 7300176 from November 13, 2026. `loadBrief.prd.json` preserves the original two-load PRD example for arithmetic regression tests. `events.sample.json` is a simulated event stream that ends at approval; its brief and economics match the live snapshot, but it is not evidence of a real booking or 409.

## Imports for Jay

- `loadBrief(id)` returns `Promise<LoadBrief>` as specified in the PRD. Wrap failures in your tool handler, or use `loadBriefResult(id)` directly for the non-throwing `{ ok, result }` / `{ ok: false, status, error, detail }` contract.
- `loadBriefResult(id, { fixture: true })` explicitly selects fixture mode. Live failures never silently fall back to fake data.
- All `lib/tms.ts` helpers are named exports and also available on `tms`. Write helpers take `(shipmentId, body)` except `generateRateCon(id)`, `uncover(id, body?)`, notes `(id, text)`, and appointments `(id, stopSeq, body)`.
- `priceImpact(brief, linehaul)` supplies approval-panel numbers, GP including detention, approval requirement, and a suggested sell at the floor. Prices and GP must not be calculated in the LLM or UI.
- Prefix agent-created FSC/LUM cost descriptions with `[coverage-agent]`. Reset cancels only these tagged costs; it preserves unrelated costs. FRT cancellation belongs to `/uncover`.

## Reset

Use `npm run reset -- <shipment-id>` to preview; append `--execute` to uncover and cancel tagged FSC/LUM costs. It only accepts BOOKED/COVERED loads, stops on the first failed mutation, and verifies the result. The transport blocks mutations before 2026-11-13 13:20 America/New_York. No live write is part of the automated checks.

## Live verification

Reviewed Jay's live adapters against the organizer packet's `API_DOCS.md` and verified read-only calls. `Shipment`, `Facility`, `Vendor`, and `IntelSource` are normalized internal interfaces. Wire pagination is `{ items, next_cursor }`; shipment costs are `vendor_costs[]` keyed by `cost_id`. Quotes return `{ rate_id, lines, market_context: { low, target, high } }`; the market band is all-in, so the adapter subtracts quote FSC to produce the linehaul-only band. Shipment notes use `{ note }`, facility notes use `{ text }`. No portal credentials are needed.

The latest eight same-origin/customer, completed loads yield $2.29/mi average linehaul and $241.25 average lumper. At the 18% company minimum, the hero's total-buy ceiling is $2,852.78, fuel is $527.25, and linehaul ceiling is $2,084.28. Expected dwell is 3.1 hours and detention is $82.50. The margin floor remains unreachable at historical rates. These differ from the PRD's illustrative two-load $2,063.03 ceiling because the required newest-eight history is larger. Market linehaul band: $2,076.17 / $2,270.00 / $2,444.42.

Live reset preview succeeded with no tagged costs to cancel. No mutation was performed. A real `--execute` reset still needs a covered hero load after the team's live run and after 1:20 PM Eastern. RUSTYRIG remains eligible with its expired-cargo warning; BADWOLF is ineligible. The effective floor is the greater of the customer floor and the 18% company minimum in Jay's adapter.

TMS base URL/key must be loaded from `.env.local` by Next.js or Node's `--env-file` option. Tests inject a fake transport. Network/HTTP failures remain structured, pagination is capped, and request starts are separated by at least 150 ms per client (use the shared singleton for production).

Run offline checks: `node --import tsx --test fixtures/backend.test.ts`.
