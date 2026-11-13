// Single place where the agent's dependencies are chosen. Owner: Jay.

import type { ToolDeps } from "@/lib/tools";
import { loadBriefResult } from "@/lib/intel";
import { tms } from "@/lib/tms";
import { devRespond } from "./devDeps";

export { tms };

export const deps: ToolDeps = {
  // shortcut: hero fixture only — live loadBriefResult 404s (intel reads delivery_facility_id; TMS has stops[].facility_id). Drop `fixture` once Akshaya fixes it.
  loadBrief: (id) => loadBriefResult(id, { fixture: true }),
  carrier: { respond: devRespond }, // swap for lib/carrierSim.ts when Advika lands it
  tms,
};

/** TMS writes stay OFF until TMS_WRITES=1 in .env.local (rule 5); write tools return a dry-run result. */
export const writesEnabled = () => process.env.TMS_WRITES === "1";
