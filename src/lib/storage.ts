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
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/lib/env";

export interface FileStorage {
  save(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  /**
   * Short-lived URL for a DIRECT browser upload (PUT) of one object — the
   * bytes bypass the app server entirely, which is what makes uploads above
   * the host's request-body cap (Vercel: 4.5 MB) possible. Returns null when
   * the backend cannot presign (local disk) — callers fall back to the
   * through-the-server multipart upload.
   */
  presignPut(key: string, contentType: string): Promise<string | null>;
  /**
   * Short-lived URL for a DIRECT browser download (GET) of one object, with a
   * content-disposition filename. Bypasses the host's RESPONSE-body cap the
   * same way. Null when unsupported (local disk) — callers stream instead.
   */
  presignGet(key: string, fileName: string): Promise<string | null>;
}

/**
 * Infrastructure failure talking to the storage backend (bad credentials,
 * missing object, network). Distinct from a document problem: callers must
 * NOT tell the user to fix their file when this is thrown. The underlying
 * SDK/OS error is preserved as `cause` for logging.
 */
export class StorageError extends Error {
  constructor(
    readonly op: "save" | "read" | "remove",
    readonly key: string,
    options?: { cause?: unknown },
  ) {
    super(`Storage ${op} failed for key "${key}"`, options);
    this.name = "StorageError";
  }
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
      // The SDK's default flexible checksums are not accepted by all
      // S3-compatible stores (Cloudflare R2 included) and, worse, get SIGNED
      // into presigned PUT URLs — a browser that doesn't send the matching
      // checksum header then fails the signature. Only checksum when the
      // operation requires it.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      // Fall back to the provider's ambient credential chain (e.g. an
      // instance role) when explicit keys are not supplied.
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
          : undefined,
    });
  }

  async save(key: string, data: Buffer): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: data,
          ContentType: "application/pdf",
        }),
      );
    } catch (cause) {
      throw new StorageError("save", key, { cause });
    }
  }

  async read(key: string): Promise<Buffer> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!result.Body) throw new Error("Empty object body");
      const bytes = await result.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (cause) {
      throw new StorageError("read", key, { cause });
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (cause) {
      throw new StorageError("remove", key, { cause });
    }
  }

  /** 10-minute PUT URL. Signing binds the exact key and content type; the
   * bucket stays private — only this one object can be written, briefly.
   * NOTE: browser PUTs additionally require a CORS rule on the bucket
   * (AllowedMethods PUT from the app origin) — see docs/UPLOADS.md. */
  async presignPut(key: string, contentType: string): Promise<string | null> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: 600 },
    );
  }

  /** 60-second GET URL with a download filename; access control happened in
   * the route before this is minted, and the audit is already recorded. */
  async presignGet(key: string, fileName: string): Promise<string | null> {
    const safeName = fileName.replace(/[^\w.\- ]/g, "_");
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${safeName}"`,
      }),
      { expiresIn: 60 },
    );
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
    try {
      const full = this.resolve(key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, data);
    } catch (cause) {
      throw new StorageError("save", key, { cause });
    }
  }

  async read(key: string): Promise<Buffer> {
    try {
      return await readFile(this.resolve(key));
    } catch (cause) {
      throw new StorageError("read", key, { cause });
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await rm(this.resolve(key), { force: true });
    } catch (cause) {
      throw new StorageError("remove", key, { cause });
    }
  }

  /** Local disk cannot presign — callers use the through-the-server path. */
  async presignPut(): Promise<null> {
    return null;
  }

  async presignGet(): Promise<null> {
    return null;
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
