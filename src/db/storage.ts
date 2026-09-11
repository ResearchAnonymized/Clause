import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function useLocalFs() {
  const driver = String(process.env.STORAGE_DRIVER || "").trim().toLowerCase();
  if (driver === "fs" || driver === "file" || driver === "local") return true;
  return !String(process.env.STORAGE_ENDPOINT || "").trim();
}

/** Walk up from a starting directory until package.json is found. */
function findPackageRoot(start: string): string | null {
  let dir = path.resolve(start);
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Vite SSR workers do not always share the repo cwd. Resolve relative
 * STORAGE_LOCAL_PATH against the app root so uploads and later reads hit
 * the same folder.
 */
function projectRoot(): string {
  for (const candidate of [process.env.CLAUSE_ROOT, process.env.INIT_CWD, process.cwd()]) {
    if (!candidate) continue;
    const hit = findPackageRoot(candidate);
    if (hit) return hit;
  }
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const hit = findPackageRoot(here);
    if (hit) return hit;
  } catch {
    /* bundled without a filesystem URL */
  }
  return process.cwd();
}

function localRoot() {
  const configured = process.env.STORAGE_LOCAL_PATH || "storage";
  if (path.isAbsolute(configured)) return configured;
  return path.resolve(projectRoot(), configured);
}

function getS3() {
  const endpoint = process.env.STORAGE_ENDPOINT;
  const region = process.env.STORAGE_REGION || "us-east-1";
  const accessKeyId = process.env.STORAGE_ACCESS_KEY || "";
  const secretAccessKey = process.env.STORAGE_SECRET_KEY || "";
  return new S3Client({
    region,
    endpoint,
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE !== "false",
    credentials: { accessKeyId, secretAccessKey },
  });
}

function bucket() {
  return process.env.STORAGE_BUCKET || "contracts";
}

async function bodyToUint8Array(body: any): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  if (body instanceof Uint8Array) return body;
  if (typeof body.transformToByteArray === "function") {
    return await body.transformToByteArray();
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function createStorageBucket(bucketName = bucket()) {
  return {
    async upload(objectPath: string, file: File | Blob | ArrayBuffer | Buffer | Uint8Array, _opts?: { upsert?: boolean }) {
      try {
        let bytes: Uint8Array;
        if (file instanceof ArrayBuffer) bytes = new Uint8Array(file);
        else if (Buffer.isBuffer(file) || file instanceof Uint8Array) bytes = new Uint8Array(file);
        else if (typeof (file as Blob).arrayBuffer === "function") {
          bytes = new Uint8Array(await (file as Blob).arrayBuffer());
        } else {
          bytes = new Uint8Array();
        }

        if (useLocalFs()) {
          const full = path.join(localRoot(), bucketName, objectPath);
          await mkdir(path.dirname(full), { recursive: true });
          await writeFile(full, bytes);
          return { data: { path: objectPath }, error: null };
        }

        await getS3().send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: objectPath,
            Body: Buffer.from(bytes),
          }),
        );
        return { data: { path: objectPath }, error: null };
      } catch (err: any) {
        return { data: null, error: { message: String(err?.message ?? err) } };
      }
    },

    async download(objectPath: string) {
      try {
        if (useLocalFs()) {
          const full = path.join(localRoot(), bucketName, objectPath);
          const buf = await readFile(full);
          return { data: new Blob([buf]), error: null };
        }
        const res = await getS3().send(
          new GetObjectCommand({ Bucket: bucketName, Key: objectPath }),
        );
        const bytes = await bodyToUint8Array(res.Body);
        return { data: new Blob([bytes]), error: null };
      } catch (err: any) {
        return { data: null, error: { message: String(err?.message ?? err) } };
      }
    },

    async remove(paths: string[]) {
      try {
        if (useLocalFs()) {
          const { unlink } = await import("node:fs/promises");
          for (const p of paths) {
            await unlink(path.join(localRoot(), bucketName, p)).catch(() => undefined);
          }
          return { data: paths, error: null };
        }
        for (const Key of paths) {
          await getS3().send(new DeleteObjectCommand({ Bucket: bucketName, Key }));
        }
        return { data: paths, error: null };
      } catch (err: any) {
        return { data: null, error: { message: String(err?.message ?? err) } };
      }
    },
  };
}
