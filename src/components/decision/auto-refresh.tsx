"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * While the AI underwriting memo is being generated in the background (an
 * officer just opened the case), gently re-fetch this server component so the
 * memo appears on its own — no manual refresh, no dead moment. Bounded so it
 * can never poll forever; once the memo exists the parent stops rendering this.
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

  useEffect(() => {
    const id = setInterval(() => {
      count.current += 1;
      router.refresh();
      if (count.current >= maxRefreshes) clearInterval(id);
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs, maxRefreshes]);

  return null;
}
