"use client";

import { useEffect, useRef, useState } from "react";

export default function CountUp({ value, digits = 0, prefix = "$" }: { value: number; digits?: number; prefix?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min((t - start) / 900, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(a + (value - a) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className="tabular-nums">{prefix}{shown.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}</span>;
}
