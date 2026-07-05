import { prisma } from "@/lib/prisma";

// A health probe must reflect live state — never prerendered or cached.
export const dynamic = "force-dynamic";

export async function GET() {
  let database = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    // reported below
  }
  return Response.json(
    { status: database ? "ok" : "degraded", database },
    { status: database ? 200 : 503 },
  );
}
