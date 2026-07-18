"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ArrowRight, CornerDownLeft, LayoutDashboard, Search } from "lucide-react";

import { CASE_STATUS_LABELS } from "@/lib/case-constants";
import { cn } from "@/lib/utils";

import type { CaseStatus } from "@/generated/prisma/enums";

interface PaletteHit {
  id: string;
  reference: string;
  company: string;
  status: CaseStatus;
}

interface NavAction {
  label: string;
  href: string;
}

const NAV_ACTIONS: NavAction[] = [
  { label: "Review queue — Pending", href: "/dashboard" },
  { label: "Review queue — All Cases", href: "/dashboard?tab=all" },
  { label: "Review queue — Decided", href: "/dashboard?tab=decided" },
];

/**
 * ⌘K command palette for bank staff — jump to any case by reference, company,
 * contract, or beneficiary, or navigate the queue. Keyboard-first: ⌘K opens,
 * ↑↓ move, ↵ opens, esc closes. Search hits the lightweight /api/cases/search.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PaletteHit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global ⌘K / Ctrl+K toggles the palette from anywhere in the app.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset transient state each time it opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  // Debounced search. An empty query still returns the most recent cases, so
  // the palette is useful the instant it opens.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cases/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { hits: PaletteHit[] };
        setHits(data.hits ?? []);
        setActive(0);
      } catch {
        /* aborted or offline — keep the last hits */
      }
    }, 140);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query, open]);

  const navActions = query
    ? NAV_ACTIONS.filter((a) => a.label.toLowerCase().includes(query.toLowerCase()))
    : NAV_ACTIONS;
  const flat: { kind: "case" | "nav"; href: string; key: string }[] = [
    ...hits.map((h) => ({ kind: "case" as const, href: `/review/${h.id}`, key: h.id })),
    ...navActions.map((a) => ({ kind: "nav" as const, href: a.href, key: a.href })),
  ];

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = flat[active];
      if (target) go(target.href);
    }
  }

  let index = -1; // running index across both groups for active highlighting

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
        aria-label="Open command palette"
      >
        <Search className="size-3.5" aria-hidden />
        <span>Search cases</span>
        <kbd className="ml-1 rounded border border-border bg-background px-1.5 font-sans text-[10px] font-medium">
          ⌘K
        </kbd>
      </button>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/20 duration-150 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
          <DialogPrimitive.Popup
            className={cn(
              "fixed top-[12vh] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/10 outline-none",
              "duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            )}
          >
            <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
            <div className="flex items-center gap-2.5 border-b border-border px-4">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Search cases by reference, company, contract…"
                className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-muted-foreground"
                aria-label="Command palette search"
              />
            </div>

            <div className="max-h-80 overflow-y-auto p-1.5">
              {flat.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No matches. Try a reference or company name.
                </p>
              ) : (
                <>
                  {hits.length > 0 && (
                    <div>
                      <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Cases
                      </p>
                      {hits.map((hit) => {
                        index++;
                        const isActive = index === active;
                        return (
                          <button
                            key={hit.id}
                            type="button"
                            onMouseEnter={() => setActive(hits.indexOf(hit))}
                            onClick={() => go(`/review/${hit.id}`)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                              isActive ? "bg-accent" : "hover:bg-accent/60",
                            )}
                          >
                            <span className="font-medium tabular-nums text-foreground">
                              {hit.reference}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                              {hit.company}
                            </span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              {CASE_STATUS_LABELS[hit.status]}
                            </span>
                            {isActive && (
                              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {navActions.length > 0 && (
                    <div>
                      <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Navigate
                      </p>
                      {navActions.map((action) => {
                        index++;
                        const isActive = index === active;
                        return (
                          <button
                            key={action.href}
                            type="button"
                            onClick={() => go(action.href)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                              isActive ? "bg-accent" : "hover:bg-accent/60",
                            )}
                          >
                            <LayoutDashboard className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="flex-1 text-foreground">{action.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-4 border-t border-border bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-background px-1">↑</kbd>
                <kbd className="rounded border border-border bg-background px-1">↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <CornerDownLeft className="size-3" aria-hidden /> open
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-background px-1">esc</kbd> close
              </span>
            </div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
