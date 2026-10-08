import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { isCivilDate } from "@/lib/calendar/dates";
import { outputFileName, publicBaseUrl, renderEmailForWeek } from "@/lib/render/service";
import { getWeekByDate } from "@/lib/weeks";

export const dynamic = "force-dynamic";

/** The email newsletter HTML. ?download=1 saves it as a file. */
export async function GET(req: Request, { params }: { params: Promise<{ date: string }> }) {
  if (!(await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { date } = await params;
  if (!isCivilDate(date)) return new Response("Not found", { status: 404 });
  const week = await getWeekByDate(date);
  if (!week) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const { html } = await renderEmailForWeek(week, publicBaseUrl(url.origin));
  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, no-store",
    // The preview is shown in an iframe on our own page only.
    "Content-Security-Policy": "script-src 'none'; frame-ancestors 'self'",
  };
  if (url.searchParams.has("download")) {
    headers["Content-Disposition"] = `attachment; filename="${outputFileName(week, "email", "html")}"`;
  }
  return new Response(html, { headers });
}
