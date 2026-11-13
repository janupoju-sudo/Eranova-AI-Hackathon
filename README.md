# Eranova-AI-Hackathon
## Setup

```bash
npm install
cp .env.example .env.local   # fill in keys — never commit .env.local
npm run dev                  # http://localhost:3000
```

| Script | Does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js app |
| `npm run typecheck` | Generates Next route types, then `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run reset` | Runs `scripts/reset.ts` with `.env.local` loaded (demo reset — owned by Akshaya) |

Shared contract: `lib/types.ts` (PRD §8). See `PRD.md` and `AGENTS.md`.
