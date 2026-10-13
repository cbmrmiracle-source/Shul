import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { outputFileName, renderPublication } from "@/lib/render/service";

export const dynamic = "force-dynamic";

const TOKEN = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.pdf$/i;

/**
 * The week's printable newsletter for email readers: /n/<week token>.pdf.
 * No sign-in; the token is random and unique to the week. Shows only
 * approved content, the same as the printed newsletter.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const m = TOKEN.exec((await params).file);
  if (!m) return new Response("Not found", { status: 404 });
  const [week] = await db.select().from(schema.week).where(eq(schema.week.publicToken, m[1].toLowerCase()));
  if (!week) return new Response("Not found", { status: 404 });
  const result = await renderPublication(week, "newsletter", "pdf");
  return new Response(new Uint8Array(result.data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${outputFileName(week, "newsletter", "pdf")}"`,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
