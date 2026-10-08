import "server-only";
import { randomUUID } from "node:crypto";
import { imageSize } from "image-size";
import { db, schema } from "@/db";
import type { Asset } from "@/db/schema";
import { storage } from "./index";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/gif", ext: "gif", test: (b) => b.subarray(0, 4).toString("ascii") === "GIF8" },
  { mime: "image/webp", ext: "webp", test: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
];

/** Identify an image by its bytes (not the file name or browser-supplied type). */
export function sniffImage(data: Buffer): { mime: string; ext: string } | null {
  const hit = SIGNATURES.find((s) => s.test(data));
  return hit ? { mime: hit.mime, ext: hit.ext } : null;
}

/** Validate and store an uploaded image, returning its asset row. */
export async function saveImage(file: File): Promise<Asset> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Image is larger than 10 MB.");
  const data = Buffer.from(await file.arrayBuffer());
  const kind = sniffImage(data);
  if (!kind) throw new Error("Please upload a PNG, JPEG, GIF or WebP image.");
  let width: number | null = null;
  let height: number | null = null;
  try {
    const dims = imageSize(data);
    width = dims.width ?? null;
    height = dims.height ?? null;
  } catch {
    // Dimensions are informational; keep the upload.
  }
  const now = new Date();
  const storageKey = `images/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${kind.ext}`;
  await storage.put(storageKey, data);
  const [row] = await db
    .insert(schema.asset)
    .values({ storageKey, originalName: file.name.slice(0, 200), mime: kind.mime, size: data.length, width, height })
    .returning();
  return row;
}
