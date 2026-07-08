import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

/** Singleton Prisma client (survives dev hot-reload without leaking pools). */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Pool tuned for a REMOTE database (the demo runs against Neon in us-east-1,
    // ~175ms/round-trip). Establishing a connection costs a full TLS handshake
    // (~0.6–2s), so the Stage-1 critical path — which fires several queries
    // concurrently — must NOT keep paying that. We therefore keep a warm pool:
    //  • keepAlive       — TCP keepalive so idle sockets are not silently dropped
    //  • idleTimeoutMillis: 0 — never close idle clients (they stay warm between
    //    requests; instrumentation.ts pre-opens several at boot)
    //  • max: 10         — headroom for the concurrent Stage-1 reads/writes
    adapter: new PrismaPg({
      connectionString: env.DATABASE_URL,
      max: 10,
      keepAlive: true,
      idleTimeoutMillis: 0,
    }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
