# Backend handoff

`loadBrief.hero.json` is the PRD hero fixture. `events.sample.json` is a simulated event stream that ends at approval; it is not evidence of a real booking. Market is null because no real quote has been obtained.

## Imports for Jay

- `loadBrief(id)` returns `Promise<LoadBrief>` as specified in the PRD. Wrap failures in your tool handler, or use `loadBriefResult(id)` directly for the non-throwing `{ ok, result }` / `{ ok: false, status, error, detail }` contract.
- `loadBriefResult(id, { fixture: true })` explicitly selects fixture mode. Live failures never silently fall back to fake data.
- All `lib/tms.ts` helpers are named exports and also available on `tms`. Write helpers take `(shipmentId, body)` except `generateRateCon(id)`, `uncover(id, body?)`, notes `(id, text)`, and appointments `(id, stopSeq, body)`.
- `priceImpact(brief, linehaul)` supplies approval-panel numbers, GP including detention, approval requirement, and a suggested sell at the floor. Prices and GP must not be calculated in the LLM or UI.
- Prefix agent-created FSC/LUM cost descriptions with `[coverage-agent]`. Reset cancels only these tagged costs; it preserves unrelated costs. FRT cancellation belongs to `/uncover`.

## Reset

Use `npm run reset -- <shipment-id>` to preview; append `--execute` to uncover and cancel tagged FSC/LUM costs. It only accepts BOOKED/COVERED loads, stops on the first failed mutation, and verifies the result. The transport blocks mutations before 2026-11-13 13:20 America/New_York. No live write is part of the automated checks.

## Live verification still required

The PRD specifies routes but not full JSON wire schemas. The exported `Shipment`, `Facility`, `Vendor`, and `IntelSource` interfaces in `lib/intel.ts` document the current expected response shapes. Pagination expects `{ items, next_cursor }`; quotes expect `{ rate_id, market_context: { low_linehaul, target_linehaul, high_linehaul } }`. Validate these against the Meridian OpenAPI documentation and update Akshaya's adapters before claiming live compatibility. No portal credentials are needed.

TMS base URL/key must be loaded from `.env.local` by Next.js or Node's `--env-file` option. Tests inject a fake transport. Network/HTTP failures remain structured, pagination is capped, and request starts are separated by at least 150 ms per client (use the shared singleton for production).

Run offline checks: `node --import tsx --test fixtures/backend.test.ts`.
