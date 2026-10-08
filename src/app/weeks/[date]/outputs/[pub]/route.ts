import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { isCivilDate } from "@/lib/calendar/dates";
import { hasTemplate } from "@/lib/render/templates";
import { outputFileName, renderPublication } from "@/lib/render/service";
import { getWeekByDate } from "@/lib/weeks";

export const dynamic = "force-dynamic";

/** GET /weeks/2026-08-29/outputs/whatsapp_shabbos?format=png&download=1 */
export async function GET(req: Request, { params }: { params: Promise<{ date: string; pub: string }> }) {
  if (!(await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { date, pub } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "png";
  if (!isCivilDate(date) || !hasTemplate(pub)) return new Response("Not found", { status: 404 });
  const week = await getWeekByDate(date);
  if (!week) return new Response("Not found", { status: 404 });

  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const result = await renderPublication(week, pub, format, page);
  const headers: Record<string, string> = {
    "Content-Type": result.contentType,
    "Cache-Control": "private, no-store",
  };
  if (url.searchParams.has("download")) {
    const name = format === "png" && url.searchParams.has("page") ? `${pub}-page${page}` : pub;
    headers["Content-Disposition"] = `attachment; filename="${outputFileName(week, name, format)}"`;
  }
  return new Response(new Uint8Array(result.data), { headers });
}
