"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedNumberProps {
  value: number;
  /** Formats the in-flight value each frame; defaults to rounded integer. */
  format?: (value: number) => string;
  durationMs?: number;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Counts a number up from zero on first render (server HTML carries the
 * final value, so nothing shifts without JS). Respects reduced motion and
 * runs on requestAnimationFrame — no timers, no layout thrash.
 */
export function AnimatedNumber({
  value,
  format = (v) => String(Math.round(v)),
  durationMs = 650,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const animated = useRef(false);

  useEffect(() => {
    if (animated.current || !Number.isFinite(value)) {
      setDisplay(value);
      return;
    }
    animated.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame: number;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      setDisplay(value * easeOutCubic(progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return <>{format(display)}</>;
}
