import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { env } from "~/modules/core/env.server";

/**
 * Private file storage on a persistent volume. Storage keys are random and server-generated
 * (`uploads/ab/<uuid>` or `generated/<appId>/<uuid>.pdf`); no part of a key ever comes from the
 * user. Files are written atomically (temp + rename) with owner-only permissions. The directory is
 * never served by Nginx or the web server; downloads go through authorised routes.
 */
export type Area = "uploads" | "generated";

function root(): string {
  return resolve(env().STORAGE_DIR);
}

export function newKey(area: Area, ext: string, group?: string): string {
  const id = randomUUID();
  const safeExt = ext.replace(/[^a-z0-9]/g, "").slice(0, 5);
  return area === "uploads"
    ? `uploads/${id.slice(0, 2)}/${id}.${safeExt}`
    : `generated/${group ?? "misc"}/${id}.${safeExt}`;
}

export function pathFor(key: string): string {
  if (!/^(uploads|generated)\/[a-z0-9-]+\/[a-f0-9-]{36}\.[a-z0-9]{1,5}$/.test(key))
    throw new Error("Invalid storage key");
  const p = resolve(root(), key);
  if (!p.startsWith(root() + sep)) throw new Error("Storage key escapes storage root");
  return p;
}

export const sha256Hex = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

export async function putFile(key: string, data: Uint8Array): Promise<{ sha256: string; size: number }> {
  const p = pathFor(key);
  await mkdir(dirname(p), { recursive: true, mode: 0o700 });
  const tmp = join(dirname(p), `.${randomUUID()}.tmp`);
  await writeFile(tmp, data, { mode: 0o600, flag: "wx" });
  await rename(tmp, p);
  return { sha256: sha256Hex(data), size: data.byteLength };
}

export async function getFile(key: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(pathFor(key)));
}

/** Reads a stored file and verifies its checksum; throws if the bytes do not match the record. */
export async function getVerifiedFile(key: string, expectedSha256: string): Promise<Uint8Array> {
  const data = await getFile(key);
  if (sha256Hex(data) !== expectedSha256) throw new Error(`Checksum mismatch for stored file ${key}`);
  return data;
}

export function streamFile(key: string) {
  return createReadStream(pathFor(key));
}

export async function fileSize(key: string): Promise<number> {
  return (await stat(pathFor(key))).size;
}

/** Storage health for readiness checks: the root exists and is writable. */
export async function storageWritable(): Promise<boolean> {
  try {
    await mkdir(root(), { recursive: true });
    const probe = join(root(), `.probe-${process.pid}`);
    await writeFile(probe, "ok");
    return true;
  } catch {
    return false;
  }
}
