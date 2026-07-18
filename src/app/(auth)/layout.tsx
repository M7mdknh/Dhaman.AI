import Link from "next/link";

import { Logo } from "@/components/brand/logo";

/**
 * Auth shell — split-screen: a deep-emerald brand panel carrying the product's
 * voice (display serif, same Casca register as the site), and a clean form
 * pane. The panel collapses on small screens where the form stands alone.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ---- Brand panel */}
      <aside className="relative hidden overflow-hidden bg-[oklch(0.27_0.045_170)] lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        {/* Watermark — ضمان (“guarantee”), the platform's namesake. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -right-6 select-none font-serif text-[16rem] leading-none text-white/[0.05]"
        >
          ضمان
        </span>

        <Link href="/" aria-label="Daman home" className="relative">
          <Logo inverse />
        </Link>

        <div className="relative max-w-md">
          <h2 className="font-display text-4xl font-light leading-[1.12] tracking-tight text-white xl:text-5xl">
            Every guarantee is a promise made in{" "}
            <em className="text-emerald-200/90">minutes</em> — and kept for
            years.
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-white/70">
            Daman prepares the underwriting package: deterministic financial
            intelligence, an AI-drafted memo, and a clean decision trail. Your
            Risk Officer makes the call.
          </p>
        </div>

        <dl className="relative grid max-w-md grid-cols-3 gap-6 border-t border-white/15 pt-6">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/55">
              Analysis
            </dt>
            <dd className="font-display mt-1 text-2xl font-light text-white">
              &lt;5s
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/55">
              Scoring
            </dt>
            <dd className="font-display mt-1 text-2xl font-light text-white">
              Deterministic
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/55">
              Decisions
            </dt>
            <dd className="font-display mt-1 text-2xl font-light text-white">
              Human
            </dd>
          </div>
        </dl>
      </aside>

      {/* ---- Form pane */}
      <main className="flex min-h-screen flex-col px-6 py-8 sm:px-10">
        <div className="flex justify-between lg:justify-end">
          <Link href="/" aria-label="Daman home" className="lg:hidden">
            <Logo />
          </Link>
          <Link
            href="/"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Back to site
          </Link>
        </div>

        <div className="flex flex-1 items-center">
          <div className="rise-in mx-auto w-full max-w-sm py-12">{children}</div>
        </div>

        <p className="text-center text-xs leading-relaxed text-muted-foreground lg:text-left">
          AI-powered underwriting. The final decision always rests with the
          bank&apos;s Risk Officer.
        </p>
      </main>
    </div>
  );
}
