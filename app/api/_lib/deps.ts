// Single place where the agent's dependencies are chosen. Owner: Jay.
// When Akshaya's / Advika's modules land, swap the dev pieces for the real imports here.

import type { ToolDeps } from "@/lib/tools";
import { devDeps, devTms } from "./devDeps";

export const deps: ToolDeps = devDeps;
export const tms = devTms;

/**
 * TMS writes stay OFF until the team flips TMS_WRITES=1 in .env.local (AGENTS.md rule 5:
 * no shipment writes before 1:20 PM). With writes off, write tools return a dry-run result.
 */
export const writesEnabled = () => process.env.TMS_WRITES === "1";
