/**
 * Next.js server-boot hook. Its one job: WARM THE DATABASE POOL before the
 * first request arrives.
 *
 * The demo database is a remote Neon instance (us-east-1). Establishing the
 * first pooled connection + TLS handshake to it measured ~2.5s cold — a penalty
 * that would otherwise land on whoever submits the first case (i.e. the judge).
 * Running one trivial query at boot pays that cost once, off the critical path,
 * so every real request sees a warm ~175ms/round-trip connection instead.
 *
 * Best-effort: a failed warmup never blocks startup (the query simply runs
 * again, cold, on first use).
 */
export async function register(): Promise<void> {
  // Only the Node.js server runtime talks to Postgres (not Edge). The import
  // must sit INSIDE this positive guard: NEXT_RUNTIME is statically replaced
  // per compiler, and webpack only drops the pg driver from the edge bundle
  // when the import lives in a statically-false branch.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { prisma } = await import("@/lib/prisma");
      // Pre-open SEVERAL pooled connections, not one: Stage-1 fires a handful of
      // queries concurrently, and each would otherwise open its own cold
      // connection on the judge's first request. Firing N warmups in parallel
      // forces the pool to establish N connections now (idle-timeout is disabled,
      // so they stay warm). ~175ms/round-trip Stage 1 instead of ~2s of handshakes.
      const WARM_CONNECTIONS = 5;
      const started = Date.now();
      await Promise.all(
        Array.from({ length: WARM_CONNECTIONS }, () => prisma.$queryRaw`SELECT 1`),
      );
      console.log(`[instrumentation] warmed ${WARM_CONNECTIONS} DB connections in ${Date.now() - started}ms`);
    } catch (error) {
      console.warn(
        "[instrumentation] pool warmup skipped:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
