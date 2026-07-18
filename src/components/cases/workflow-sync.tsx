"use client";

import { startTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Invisible workflow-state watcher. Polls the sync endpoint (case-scoped
 * with `caseId`, dashboard-wide without) and refreshes the page the moment
 * the server token differs from the one this page was rendered with — so a
 * decision recorded by one role appears on every other role's open screen
 * within seconds, without anyone reloading.
 *
 * Refresh strategy: `router.refresh()` first (preserves all client state) —
 * but VERIFIED, because in this Next 15.5 production build a refresh can
 * RENDER the new payload yet never COMMIT it to the DOM (observed directly:
 * the component function re-runs with the new token while the rendered
 * attribute keeps the old one; same family as the searchParams
 * `router.replace` bug in TECH_DEBT.md). Commit is therefore tracked in a
 * useEffect — effects only run for renders that actually committed. If the
 * committed token is still stale after two soft attempts, fall back to a
 * full reload — deferred while the user is typing so an in-progress memo or
 * decision note is never destroyed.
 */
const POLL_MS = 5_000;
/** Quick recheck after a refresh attempt so convergence isn't poll-gated. */
const RECHECK_MS = 1_500;
const MAX_SOFT_ATTEMPTS = 2;

export function WorkflowSync({ caseId, token }: { caseId?: string; token: string }) {
  const router = useRouter();
  // The token of the page state the user actually SEES. Only a committed
  // render moves it (useEffect below) — never the render phase, which the
  // buggy refresh path executes and then discards.
  const committedRef = useRef(token);
  const attemptsRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    committedRef.current = token;
    attemptsRef.current = 0;
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    let recheck: ReturnType<typeof setTimeout> | null = null;

    async function check() {
      if (cancelled || inFlightRef.current) return;
      if (document.visibilityState === "hidden") return;
      inFlightRef.current = true;
      try {
        const query = caseId ? `?caseId=${encodeURIComponent(caseId)}` : "";
        const res = await fetch(`/api/workflow/sync${query}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data: { token?: string } = await res.json();
        if (!data.token || data.token === committedRef.current) return;

        // State moved. Soft refresh first; if it keeps failing to commit,
        // hard-reload — unless the user is mid-keystroke, in which case wait
        // for the next tick rather than destroying their input.
        attemptsRef.current += 1;
        if (attemptsRef.current <= MAX_SOFT_ATTEMPTS) {
          startTransition(() => router.refresh());
          if (recheck) clearTimeout(recheck);
          recheck = setTimeout(() => void check(), RECHECK_MS);
        } else {
          const el = document.activeElement;
          const editing =
            el instanceof HTMLElement &&
            (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
          if (!editing) window.location.reload();
        }
      } catch {
        // Transient network hiccup — the next tick retries.
      } finally {
        inFlightRef.current = false;
      }
    }

    const id = setInterval(() => void check(), POLL_MS);
    // Catch up immediately when the user returns to the tab.
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      if (recheck) clearTimeout(recheck);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [caseId, router]);

  // The rendered token doubles as the commit marker (used by E2E checks).
  return <span hidden data-workflow-token={token} />;
}
