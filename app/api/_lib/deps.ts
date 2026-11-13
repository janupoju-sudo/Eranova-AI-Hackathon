// Single place where the agent's dependencies are chosen. Owner: Jay.

import type { ToolDeps } from "@/lib/tools";
import { loadBriefResult } from "@/lib/intel";
import { tms } from "@/lib/tms";
import { respond, type SimCarrier } from "@/lib/carrierSim";

export { tms };

const STYLES: SimCarrier["style"][] = ["blunt", "friendly", "formal"];

export const deps: ToolDeps = {
  loadBrief: (id) => loadBriefResult(id),
  carrier: {
    respond: async (carrierId, offer, history, brief) => {
      const c = brief.carriers.find((x) => x.vendorId === carrierId)!; // negotiate tool already checked it exists
      const style = STYLES[carrierId.length % STYLES.length];
      const turns = history.filter((t) => t.amount != null).map((t) => ({ from: t.from, amount: t.amount! }));
      // shortcut: no market quote → PRD lane-history target; fine for the hero lane, revisit for others.
      const target = brief.market?.target ?? (brief.laneHistory.avgLinehaulPerMile ?? 2.47) * brief.lane.miles;
      return respond({ vendorId: c.vendorId, name: c.name, score: c.score, style }, offer, turns, target);
    },
  },
  tms,
};

/** TMS writes stay OFF until TMS_WRITES=1 in .env.local (rule 5); write tools return a dry-run result. */
export const writesEnabled = () => process.env.TMS_WRITES === "1";
