import { describe, expect, it } from "vitest";
import { createClient, listAudiences, MailchimpError, pushCampaign, sendTestEmail } from "@/lib/mailchimp";

type Call = { method: string; url: string; body: unknown; auth: string | null };

/** A fake Mailchimp that answers like the real API and records calls. */
function fakeMailchimp(state: { campaignStatus?: string; defaults?: object; status401?: boolean } = {}) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url: u, body, auth: new Headers(init?.headers).get("Authorization") });
    const json = (status: number, data: unknown) =>
      new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    if (state.status401) return json(401, { title: "API Key Invalid" });
    if (u.includes("/lists?")) return json(200, { lists: [{ id: "L1", name: "Shul Members", stats: { member_count: 412 } }] });
    if (u.includes("/lists/L1?")) return json(200, { campaign_defaults: state.defaults ?? { from_name: "Chabad of Inverrary", from_email: "info@chabadofinverrary.com" } });
    if (method === "POST" && u.endsWith("/campaigns")) return json(200, { id: "NEW1", web_id: 555, status: "save" });
    if (method === "GET" && u.includes("/campaigns/OLD1")) return json(200, { id: "OLD1", web_id: 444, status: state.campaignStatus ?? "save" });
    if (method === "GET" && u.includes("/campaigns/GONE")) return json(404, { title: "Resource Not Found", detail: "not found" });
    if (method === "PATCH" || method === "PUT") return json(200, {});
    if (u.endsWith("/actions/test")) return json(204, null);
    return json(404, { title: "Unexpected", detail: `${method} ${u}` });
  }) as typeof fetch;
  return { client: createClient("abc123-us13", fetchImpl), calls };
}

const input = { audienceId: "L1", title: "T", subject: "The Shabbos Connection – Parshas Noach", previewText: "Candle Lighting 6:40PM", html: "<html>…</html>" };

describe("Mailchimp", () => {
  it("uses the data centre from the key and basic auth", async () => {
    const { client, calls } = fakeMailchimp();
    expect(await listAudiences(client)).toEqual([{ id: "L1", name: "Shul Members", memberCount: 412 }]);
    expect(calls[0].url.startsWith("https://us13.api.mailchimp.com/3.0/lists")).toBe(true);
    expect(calls[0].auth).toMatch(/^Basic /);
  });

  it("creates a draft with the audience's from name and puts the HTML", async () => {
    const { client, calls } = fakeMailchimp();
    const r = await pushCampaign(client, input);
    expect(r).toMatchObject({ campaignId: "NEW1", webId: 555, created: true, editUrl: "https://us13.admin.mailchimp.com/campaigns/edit?id=555" });
    const create = calls.find((c) => c.method === "POST")!;
    expect(create.body).toMatchObject({
      type: "regular",
      recipients: { list_id: "L1" },
      settings: { subject_line: input.subject, preview_text: input.previewText, from_name: "Chabad of Inverrary", reply_to: "info@chabadofinverrary.com" },
    });
    expect(calls.at(-1)).toMatchObject({ method: "PUT", body: { html: "<html>…</html>" } });
    expect(calls.some((c) => c.url.includes("/actions/send"))).toBe(false);
  });

  it("updates this week's existing draft instead of making another", async () => {
    const { client, calls } = fakeMailchimp();
    const r = await pushCampaign(client, { ...input, existingCampaignId: "OLD1" });
    expect(r).toMatchObject({ campaignId: "OLD1", created: false });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect(calls.some((c) => c.method === "PATCH" && c.url.endsWith("/campaigns/OLD1"))).toBe(true);
  });

  it("makes a new draft if last one was already sent or deleted", async () => {
    const sent = fakeMailchimp({ campaignStatus: "sent" });
    expect((await pushCampaign(sent.client, { ...input, existingCampaignId: "OLD1" })).created).toBe(true);
    const gone = fakeMailchimp();
    expect((await pushCampaign(gone.client, { ...input, existingCampaignId: "GONE" })).created).toBe(true);
  });

  it("explains problems in plain words", async () => {
    expect(() => createClient("")).toThrow(/isn't connected/);
    expect(() => createClient("no-datacentre-here!")).toThrow(/should end with/);
    await expect(listAudiences(fakeMailchimp({ status401: true }).client)).rejects.toThrow(/rejected the API key/);
    await expect(pushCampaign(fakeMailchimp({ defaults: {} }).client, input)).rejects.toThrow(MailchimpError);
  });

  it("sends a test", async () => {
    const { client, calls } = fakeMailchimp();
    await sendTestEmail(client, "OLD1", ["me@example.com"]);
    expect(calls[0]).toMatchObject({ method: "POST", body: { test_emails: ["me@example.com"], send_type: "html" } });
  });
});
