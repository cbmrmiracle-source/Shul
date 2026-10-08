import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { storage } from "@/lib/storage";

/**
 * Public, unguessable image links for the email newsletter (Mailchimp and
 * readers' inboxes can't sign in). Only files recorded as uploaded assets
 * are served; keys contain a random UUID.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const storageKey = (await params).key.join("/");
  const [asset] = await db.select().from(schema.asset).where(eq(schema.asset.storageKey, storageKey));
  if (!asset) return new Response("Not found", { status: 404 });
  const data = await storage.get(asset.storageKey).catch(() => null);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": asset.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
