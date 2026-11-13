"use client";

import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import "@/components/anim.css";

// Inner scroll panels (feed, queue, JSON viewers) carry data-lenis-prevent so they scroll natively.
export default function Providers({ children }: { children: React.ReactNode }) {
  return <ReactLenis root>{children}</ReactLenis>;
}
