// Simulated carrier agents (PRD §9.3). Plain code, seeded, no LLM: every rehearsal replays identically.
// Each carrier has a hidden minimum linehaul derived from the market target and its scorecard score.

export interface SimCarrier {
  vendorId: string;
  name: string;
  score: number; // from intel; higher score = firmer carrier
  style: "blunt" | "friendly" | "formal";
}

export interface SimTurn {
  from: "broker" | "carrier";
  amount: number;
}

export interface SimReply {
  accept: boolean;
  counter?: number;
  final: boolean; // carrier will not move again
  text: string;
  driver?: { name: string; phone: string };
}

export const MAX_ROUNDS = 3;

// FNV-1a: small deterministic hash, enough for seeded jitter.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unit(seed: string): number {
  return (hash(seed) % 10000) / 10000;
}

const DRIVERS = ["Marcus Bell", "Dana Ortiz", "Terrence Cole", "Priya Nair", "Luis Herrera", "Jo Whitfield"];

export function hiddenMinimum(marketTarget: number, carrier: SimCarrier, seed = "demo"): number {
  // intel scores land around 50-80 (PRD §9.2 formula); map that band to 0..1. Lower score -> accepts less.
  const firmness = Math.min(Math.max((carrier.score - 50) / 30, 0), 1);
  const jitter = (unit(`${seed}:${carrier.vendorId}`) - 0.5) * 0.02;
  const factor = 0.95 + 0.2 * firmness + jitter; // 0.95 to 1.15 per PRD
  return Math.round(marketTarget * factor);
}

function say(style: SimCarrier["style"], kind: "accept" | "counter" | "final", amount: number): string {
  const a = `$${amount.toLocaleString("en-US")}`;
  const t = {
    blunt: {
      accept: `${a} works. Send the rate con.`,
      counter: `Can't do that. ${a} and I'll put a truck on it.`,
      final: `${a} is my floor. Take it or leave it.`,
    },
    friendly: {
      accept: `Deal at ${a}. Happy to haul it for you.`,
      counter: `Close! Could you meet me at ${a}? Fuel is rough this week.`,
      final: `I really can't go below ${a}, sorry. Let me know.`,
    },
    formal: {
      accept: `We accept ${a} linehaul. Please issue the rate confirmation.`,
      counter: `We can offer coverage at ${a} linehaul.`,
      final: `Our final linehaul rate is ${a}.`,
    },
  } as const;
  return t[style][kind];
}

export function respond(
  carrier: SimCarrier,
  offer: number,
  history: SimTurn[],
  marketTarget: number,
  seed = "demo",
): SimReply {
  const min = hiddenMinimum(marketTarget, carrier, seed);
  const round = history.filter((t) => t.from === "broker").length + 1; // this offer counts
  if (offer >= min) {
    const d = DRIVERS[hash(`${seed}:${carrier.vendorId}:driver`) % DRIVERS.length];
    const phone = `704-555-${String(1000 + (hash(`${seed}:${carrier.vendorId}:ph`) % 9000))}`;
    return { accept: true, final: true, text: say(carrier.style, "accept", offer), driver: { name: d, phone } };
  }
  if (round >= MAX_ROUNDS) {
    return { accept: false, counter: min, final: true, text: say(carrier.style, "final", min) };
  }
  const ask = Math.round(min * 1.08);
  const counter = Math.max(min, Math.round(ask - ((ask - min) * (round - 1)) / (MAX_ROUNDS - 1)));
  return { accept: false, counter, final: false, text: say(carrier.style, "counter", counter) };
}
