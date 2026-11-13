# AGENTS.md — rules for coding agents in this repo

Read `PRD.md` before doing anything. Build only the section your human assigns you.

## Ownership — edit only your own files
| Human | Files |
|---|---|
| Jay | `lib/agent.ts`, `lib/tools.ts`, `app/api/*` |
| Akshaya | `lib/tms.ts`, `lib/intel.ts`, `scripts/reset.ts`, `fixtures/*` |
| Advika | `app/page.tsx`, `app/providers.tsx`, `components/*`, `lib/carrierSim.ts` |

If you need a change in someone else's file, stop and tell your human.

## Rules
1. `lib/types.ts` is the shared contract. Read it; never modify it without your human confirming the team agreed.
2. Until real modules exist, build against `fixtures/loadBrief.hero.json` and `fixtures/events.sample.json`.
3. Secrets come from `.env.local` only (`OPENAI_API_KEY`, `OPENAI_MODEL`, `TMS_API_BASE`, `TMS_API_KEY`). Never hardcode, log or commit them. Never use the `NEXT_PUBLIC_` prefix for them.
4. TMS calls go through `lib/tms.ts`, throttled ~150 ms. No uncapped loops over all records. No load testing.
5. Before 1:20 PM, call only read routes (GET, `POST /rate-engine/quotes`, `POST /quotes/price-preview`). No writes to shipments.
6. TMS errors are returned as `{ ok: false, status, error, detail }`, never thrown into the agent loop.
7. All money math lives in `lib/intel.ts` (plain code). The LLM never computes prices or margins.
8. Never request, store or handle facility portal credentials.
9. Times: system timestamps are UTC; stop windows are facility-local with an IANA timezone.
10. Small commits on your own branch; run the code before saying it works.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
