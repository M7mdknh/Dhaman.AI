import Link from "next/link";
import {
  ArrowRight,
  FileCheck2,
  Gauge,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Public marketing landing page — the first screen an unauthenticated visitor
 * (or a hackathon judge) sees. Authenticated users are redirected to the
 * dashboard by the middleware before this ever renders. Its whole job is to
 * make the value proposition and the AI's role obvious in five seconds.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            Sign in
          </Link>
          <Link href="/register" className={cn(buttonVariants({ size: "sm" }))}>
            Get started
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="py-16 text-center sm:py-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="size-3.5" aria-hidden />
            AI-powered Corporate Underwriting for Saudi banks
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Underwrite Letters of Guarantee in minutes, not days.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Daman turns audited financial statements into a decision-ready underwriting
            package — a deterministic financial assessment in seconds, an AI-drafted credit
            memo, and a Risk Officer who always makes the final call.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
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
        </section>

        <section className="grid gap-4 pb-16 sm:grid-cols-3">
          <FeatureCard
            icon={Zap}
            title="Express assessment in seconds"
            body="Upload the latest audited statement and see Underwriting Capacity, a company rating, and a risk read almost immediately."
          />
          <FeatureCard
            icon={Gauge}
            title="Deterministic financial intelligence"
            body="Ratios, trends, and risk flags computed by a transparent, auditable engine. The AI never touches a number."
          />
          <FeatureCard
            icon={Sparkles}
            title="AI underwriting memo"
            body="The AI reads the documents and explains the analysis in a bank-grade credit memo — it explains, it never decides."
          />
        </section>

        <section className="border-t border-border py-14">
          <h2 className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            How it works
          </h2>
          <ol className="mx-auto mt-8 grid max-w-4xl gap-6 sm:grid-cols-4">
            <Step n={1} icon={ScanLine} title="Upload" body="Latest audited IFRS statement — earlier years optional." />
            <Step n={2} icon={Gauge} title="Financial intelligence" body="Capacity, rating, and risk score, computed deterministically." />
            <Step n={3} icon={Sparkles} title="AI memo" body="Strengths, weaknesses, and a policy recommendation." />
            <Step n={4} icon={FileCheck2} title="Decide & issue" body="The Risk Officer approves and issues the Letter of Guarantee." />
          </ol>
        </section>

        <section className="border-t border-border py-10 text-center">
          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">
              The AI assists the bank — it never replaces it.
            </span>{" "}
            Every figure is deterministic and auditable, and the final underwriting decision
            always rests with the Risk Officer.
          </p>
        </section>
      </main>

      <footer className="mx-auto max-w-5xl px-6 py-8 text-center text-xs text-muted-foreground">
        Daman — AI-powered Corporate Underwriting Platform
      </footer>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4.5" aria-hidden />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function Step({
  n,
  icon: Icon,
  title,
  body,
}: {
  n: number;
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <li className="text-center sm:text-left">
      <div className="flex items-center justify-center gap-2 sm:justify-start">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-xs font-semibold text-primary">
          {n}
        </span>
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
    </li>
  );
}
