import type { LoadBrief } from "@/lib/types";

export const usd = (n: number, digits = 0) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });

// DISPLAY-ONLY helper for the live meter. The authoritative money math lives in lib/intel.ts;
// approval_needed events carry their own numbers and the UI prefers those.
export function gpPctAt(brief: LoadBrief, linehaul: number): number {
  const buy = linehaul + brief.margin.carrierFuel$ + brief.risk.expectedLumper$;
  return ((brief.sell.total - buy) / brief.sell.total) * 100;
}

// "2026-11-17" or "2026-11-17T08:00:00Z" -> "11/17"
export function shortDate(iso: string | null): string {
  const m = iso?.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${m[1]}/${m[2]}` : "—";
}
