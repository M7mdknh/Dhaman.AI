/**
 * File storage adapter. Two backends behind one interface:
 *   - S3Storage        — used in any deployment (Vercel's filesystem is
 *                        read-only, so local disk cannot persist uploads).
 *   - LocalDiskStorage — used for local development when no bucket is set.
 *
 * The backend is chosen from the environment at module load (see bottom).
 * Buckets are PRIVATE: objects are read server-side and streamed through the
 * access-checked download route — never exposed via a public URL.
 *
 * Keys are ALWAYS server-generated (see document-service) — the client
 * filename is display metadata only, never a path.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { env } from "@/lib/env";

export interface FileStorage {
  save(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

/** S3-compatible object store (AWS S3, Cloudflare R2, MinIO). */
class S3Storage implements FileStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: {
    bucket: string;
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string;
    forcePathStyle: boolean;
  }) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      // Fall back to the provider's ambient credential chain (e.g. an
      // instance role) when explicit keys are not supplied.
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
          : undefined,
    });
  }

  async save(key: string, data: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: "application/pdf",
      }),
    );
  }

  async read(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!result.Body) throw new Error(`Empty object body for key: ${key}`);
    const bytes = await result.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

class LocalDiskStorage implements FileStorage {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  /** Defense in depth: reject any key that escapes the storage root. */
  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) {
      throw new Error("Invalid storage key");
    }
    return full;
  }

  async save(key: string, data: Buffer): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  read(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

/**
 * A configured S3 bucket takes precedence — required on read-only-filesystem
 * hosts (Vercel), where the local-disk adapter cannot persist uploads.
 *
 * In production the disk fallback is DISALLOWED: a missing bucket fails fast
 * at startup instead of silently accepting uploads that vanish. Self-hosted
 * deployments with a genuine persistent disk can opt back in with
 * ALLOW_LOCAL_STORAGE=true.
 */
function createStorage(): FileStorage {
  if (env.S3_BUCKET) {
    return new S3Storage({
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
  }

  if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_STORAGE !== "true") {
    throw new Error(
      "No document storage configured for production: set S3_BUCKET (and S3 credentials), " +
        "or set ALLOW_LOCAL_STORAGE=true only if this host has a persistent writable disk.",
    );
  }

  return new LocalDiskStorage(env.UPLOAD_DIR);
}

export const storage: FileStorage = createStorage();
