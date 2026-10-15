import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { outputFileName, renderPublication } from "@/lib/render/service";

export const dynamic = "force-dynamic";

const TOKEN = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.pdf|(-kids)\.png)$/i;

/**
 * Files linked from the email, for readers who aren't signed in:
 * /n/<week token>.pdf is the printable newsletter, /n/<week token>-kids.png
 * the Children's Poster. The token is random and unique to the week. Shows
 * only approved content, the same as the outputs.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const m = TOKEN.exec((await params).file);
  if (!m) return new Response("Not found", { status: 404 });
  const [week] = await db.select().from(schema.week).where(eq(schema.week.publicToken, m[1].toLowerCase()));
  if (!week) return new Response("Not found", { status: 404 });
  const [key, format] = m[2] ? (["poster_kids", "png"] as const) : (["newsletter", "pdf"] as const);
  const result = await renderPublication(week, key, format);
  return new Response(new Uint8Array(result.data), {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `inline; filename="${outputFileName(week, key, format)}"`,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
