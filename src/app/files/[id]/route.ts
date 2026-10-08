import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "@/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { storage } from "@/lib/storage";

/** Serve an uploaded file to the signed-in user. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response("Not found", { status: 404 });
  const [asset] = await db.select().from(schema.asset).where(eq(schema.asset.id, id));
  if (!asset) return new Response("Not found", { status: 404 });
  const data = await storage.get(asset.storageKey).catch(() => null);
  if (!data) return new Response("File missing", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": asset.mime,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
