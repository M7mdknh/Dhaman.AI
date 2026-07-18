import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Public marketing landing page — the first screen an unauthenticated visitor
 * (or a hackathon judge) sees. Authenticated users are redirected to the
 * dashboard by the middleware before this ever renders.
 *
 * Organization & typography follow the Casca (cascading.ai) register: a slim
 * announcement bar, a centered nav, an oversized light SERIF display headline
 * over sans body copy, a statement section, numbered feature rows, and a
 * closing serif CTA. Colors stay 100% on the Dhaman theme tokens.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* ---- Announcement bar */}
      <div className="border-b border-border bg-muted/40">
        <p className="mx-auto max-w-6xl px-6 py-2.5 text-center text-xs text-muted-foreground">
          Deterministic engines. AI that explains.{" "}
          <span className="font-medium text-foreground">
            The final decision always rests with the Risk Officer.
          </span>{" "}
          <a href="#how-it-works" className="font-medium text-primary hover:underline">
            See how it works
          </a>
        </p>
      </div>

      {/* ---- Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#platform" className="transition-colors hover:text-foreground">
            Platform
          </a>
          <a href="#how-it-works" className="transition-colors hover:text-foreground">
            How it works
          </a>
          <a href="#principles" className="transition-colors hover:text-foreground">
            Principles
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            Sign in
          </Link>
          <Link href="/register" className={cn(buttonVariants({ size: "sm" }))}>
            Get started
          </Link>
        </div>
      </header>

      <main>
        {/* ---- Hero */}
        <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 text-center sm:pb-28 sm:pt-24">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            AI-powered corporate underwriting for Saudi banks
          </p>
          <h1 className="font-display mx-auto mt-6 max-w-4xl text-[clamp(2.9rem,7.5vw,6rem)] font-light leading-[1.02] tracking-tight text-foreground">
            Underwrite guarantees in <em className="text-primary">minutes</em>, not weeks.
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Dhaman turns audited financial statements into a decision-ready underwriting
            package — a deterministic financial assessment in seconds, an AI-drafted credit
            memo, and a Risk Officer who always makes the final call.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login" className={cn(buttonVariants({ size: "lg" }))}>
              View the platform
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              href="/register"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              Create an account
            </Link>
          </div>

          {/* ---- Trust strip (logo-strip rhythm, factual claims) */}
          <div className="mt-16 border-t border-border pt-8">
            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <span>Financial intelligence in seconds</span>
              <span className="hidden text-border sm:inline">·</span>
              <span>100% deterministic scoring</span>
              <span className="hidden text-border sm:inline">·</span>
              <span>Every figure auditable</span>
              <span className="hidden text-border sm:inline">·</span>
              <span>Final decision always human</span>
            </div>
          </div>
        </section>

        {/* ---- Statement section */}
        <section id="platform" className="border-t border-border bg-card">
          <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
            <h2 className="font-display max-w-3xl text-4xl font-light leading-[1.1] tracking-tight text-foreground sm:text-5xl">
              Letter of Guarantee underwriting can be effortless.
            </h2>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground">
              Dhaman works the way a bank does: transparent financial engines produce every
              number, the AI explains the analysis in bank-grade language, and the Risk
              Officer stays the only decision maker.
            </p>

            {/* ---- Numbered feature rows */}
            <div className="mt-14 grid gap-x-12 gap-y-12 sm:grid-cols-2">
              <Feature
                n="01"
                title="Assess a contractor in seconds"
                body="Upload the latest audited statement and see Underwriting Capacity, a company rating, and a risk read almost immediately — before the coffee arrives."
              />
              <Feature
                n="02"
                title="Deterministic financial intelligence"
                body="Ratios, trends, risk flags, and the composite grade are computed by a transparent, auditable engine. The AI never touches a number."
              />
              <Feature
                n="03"
                title="Reads the financial statements for you"
                body="Scanned or digital, IFRS statements are extracted into structured figures — every value traceable back to the page it came from."
              />
              <Feature
                n="04"
                title="Supercharges your Risk Officers"
                body="An AI-drafted credit memo explains strengths, weaknesses, and the policy recommendation — it explains, it never decides."
              />
            </div>
          </div>
        </section>

        {/* ---- How it works */}
        <section id="how-it-works" className="border-t border-border">
          <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
            <h2 className="font-display text-center text-4xl font-light tracking-tight text-foreground sm:text-5xl">
              How it works
            </h2>
            <ol className="mx-auto mt-14 grid max-w-4xl gap-10 sm:grid-cols-4">
              <Step
                n={1}
                title="Upload"
                body="Latest audited IFRS statement — earlier years optional."
              />
              <Step
                n={2}
                title="Financial intelligence"
                body="Capacity, rating, and risk score, computed deterministically."
              />
              <Step
                n={3}
                title="AI memo"
                body="Strengths, weaknesses, and a policy recommendation."
              />
              <Step
                n={4}
                title="Decide & issue"
                body="The Risk Officer approves and issues the Letter of Guarantee."
              />
            </ol>
          </div>
        </section>

        {/* ---- Principles */}
        <section id="principles" className="border-t border-border bg-card">
          <div className="mx-auto max-w-6xl px-6 py-16 text-center sm:py-20">
            <p className="font-display mx-auto max-w-2xl text-2xl font-light leading-snug text-foreground sm:text-3xl">
              The AI assists the bank —{" "}
              <em className="text-primary">it never replaces it.</em>
            </p>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Every figure is deterministic and auditable, every recommendation is
              reproducible, and the final underwriting decision always rests with the Risk
              Officer.
            </p>
          </div>
        </section>

        {/* ---- Final CTA */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-6 py-20 text-center sm:py-28">
            <h2 className="font-display mx-auto max-w-2xl text-4xl font-light leading-[1.1] tracking-tight text-foreground sm:text-5xl">
              It&apos;s time to underwrite with Dhaman.
            </h2>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/register" className={cn(buttonVariants({ size: "lg" }))}>
                Get started
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <Logo />
          <p className="text-xs text-muted-foreground">
            Dhaman — AI-powered Corporate Underwriting Platform
          </p>
        </div>
      </footer>
    </div>
  );
}

function Feature({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="border-t border-border pt-6">
      <span className="text-xs font-semibold tracking-wide text-primary">{n}</span>
      <h3 className="font-display mt-3 text-2xl font-light leading-snug text-foreground">
        {title}
      </h3>
      <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="text-center sm:text-left">
      <span className="flex size-7 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-xs font-semibold text-primary sm:mx-0 mx-auto">
        {n}
      </span>
      <h3 className="mt-4 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
    </li>
  );
}
