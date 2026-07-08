/** One-off latency probe for the real hosted dependencies (Neon DB, R2, OpenAI). */
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { getLLMProvider } from "@/lib/ai";
import { rasterizePages } from "@/lib/ifrs/raster";
import { readFile } from "node:fs/promises";

const t = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
  const s = Date.now();
  try {
    const r = await fn();
    console.log(`${label.padEnd(34)} ${`${Date.now() - s}ms`.padStart(8)}`);
    return r;
  } catch (e) {
    console.log(`${label.padEnd(34)} ${"ERR".padStart(8)}  ${e instanceof Error ? e.message : e}`);
    return null;
  }
};

async function main() {
  console.log("=== DB round-trips (Neon) ===");
  await t("warmup SELECT 1", () => prisma.$queryRaw`SELECT 1`);
  await t("SELECT 1 (warm)", () => prisma.$queryRaw`SELECT 1`);
  await t("SELECT 1 (warm)", () => prisma.$queryRaw`SELECT 1`);
  const aCase = await prisma.underwritingCase.findFirst({ include: { documents: true } });
  await t("findFirst case + relations", () =>
    prisma.underwritingCase.findFirst({
      include: { processing: true, contractDetails: true, financialStatements: true },
    }),
  );

  console.log("\n=== R2 storage read ===");
  if (aCase?.documents[0]) {
    await t("storage.read (warm)", () => storage.read(aCase.documents[0].storageKey));
    await t("storage.read (warm)", () => storage.read(aCase.documents[0].storageKey));
  } else {
    console.log("(no document to read)");
  }

  console.log("\n=== OpenAI text call (memo-sized) ===");
  const provider = getLLMProvider();
  console.log(`provider=${provider.name} model=${provider.model}`);
  await t("completeJSON ~1.6k tok out", () =>
    provider.completeJSON({
      system: "You are a credit underwriting assistant. Return strict JSON.",
      user:
        "Given a company with revenue 120000000, net income 18000000, current ratio 1.8, " +
        "return a JSON object: {\"summary\": string (3 sentences), \"strengths\": string[], " +
        "\"risks\": string[], \"recommendation\": string}. Be thorough and realistic.",
      maxOutputTokens: 1600,
      temperature: 0.2,
      timeoutMs: 45000,
    }),
  );

  console.log("\n=== OpenAI vision call (rasterize + extract) ===");
  const localPdf = "uploads/cases/cmr8slghd0000geomgunjnz89/44ff64e1-9bb3-4d4f-826a-c9e1d5b25f02.pdf";
  const bytes = await readFile(localPdf).catch(() => null);
  if (bytes && provider.completeVisionJSON) {
    const raster = await t("rasterize 1 page @150dpi", () => rasterizePages(bytes, [1], 150));
    if (raster) {
      const images = raster.map((p) => `data:image/png;base64,${p.png.toString("base64")}`);
      await t("completeVisionJSON (1 img)", () =>
        provider.completeVisionJSON!({
          system: "Extract financial figures as strict JSON.",
          user: "Return {\"years\":[{\"fiscalYear\":2025,\"revenue\":null}]}",
          images,
          maxOutputTokens: 1500,
          temperature: 0,
          timeoutMs: 45000,
        }),
      );
    }
  } else {
    console.log("(no local pdf or provider has no vision)");
  }

  await prisma.$disconnect();
}

void main();
