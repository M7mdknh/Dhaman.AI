"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

/**
 * While the AI underwriting memo is being generated in the background (an
 * officer just opened the case), gently re-fetch this server component so the
 * memo appears on its own — no manual refresh, no dead moment. Bounded so it
 * can never poll forever; once the memo exists the parent stops rendering this.
 *
 * If the bound is exhausted and the memo still hasn't appeared (a slow or
 * failed provider call), it says so honestly instead of pulsing forever —
 * the "Generate AI Analysis" button right below is the way forward.
 */
export function DecisionAutoRefresh({
  intervalMs = 3000,
  maxRefreshes = 8,
}: {
  intervalMs?: number;
  maxRefreshes?: number;
}) {
  const router = useRouter();
  const count = useRef(0);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      count.current += 1;
      router.refresh();
      if (count.current >= maxRefreshes) {
        clearInterval(id);
        setExhausted(true);
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs, maxRefreshes]);

  if (!exhausted) return null;
  return (
    <p className="mt-3 flex max-w-sm items-start gap-2 rounded-lg border border-amber-600/30 bg-amber-600/10 px-3 py-2 text-left text-xs leading-relaxed text-amber-700 dark:text-amber-400">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        The AI provider is taking longer than expected. Use{" "}
        <span className="font-medium">Generate AI Analysis</span> below to try again — the
        deterministic financial intelligence above is complete and unaffected.
      </span>
    </p>
  );
}
