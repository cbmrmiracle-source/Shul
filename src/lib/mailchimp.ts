/**
 * Minimal Mailchimp Marketing API client: list audiences, create or update a
 * draft campaign with our HTML, send a test. It never sends a campaign to the
 * list; that stays a deliberate click inside Mailchimp.
 *
 * The API key comes from the MAILCHIMP_API_KEY environment variable (kept out
 * of the database). Keys end in the data centre, e.g. "abc123…-us13".
 */

export class MailchimpError extends Error {}

type Fetch = typeof fetch;

export interface MailchimpClient {
  /** Data centre, e.g. "us13". */
  dc: string;
  request<T>(method: string, path: string, body?: unknown): Promise<T>;
}

export function mailchimpConfigured(): boolean {
  return Boolean(process.env.MAILCHIMP_API_KEY?.trim());
}

export function createClient(apiKey = process.env.MAILCHIMP_API_KEY ?? "", fetchImpl: Fetch = fetch): MailchimpClient {
  const key = apiKey.trim();
  const dc = /-([a-z]+\d+)$/.exec(key)?.[1];
  if (!key) throw new MailchimpError("Mailchimp isn't connected. Add MAILCHIMP_API_KEY in Railway → Variables.");
  if (!dc) throw new MailchimpError("The Mailchimp API key looks wrong: it should end with something like -us13.");
  const base = `https://${dc}.api.mailchimp.com/3.0`;
  const auth = `Basic ${Buffer.from(`shul:${key}`).toString("base64")}`;

  return {
    dc,
    async request<T>(method: string, path: string, body?: unknown): Promise<T> {
      let res: Response;
      try {
        res = await fetchImpl(`${base}${path}`, {
          method,
          headers: { Authorization: auth, "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
          cache: "no-store",
        });
      } catch (e) {
        throw new MailchimpError(`Couldn't reach Mailchimp: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (res.status === 204) return undefined as T;
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const detail = (data.detail as string) || (data.title as string) || res.statusText;
        if (res.status === 401) throw new MailchimpError("Mailchimp rejected the API key. Check MAILCHIMP_API_KEY.");
        throw new MailchimpError(`Mailchimp: ${detail}`);
      }
      return data as T;
    },
  };
}

export interface Audience {
  id: string;
  name: string;
  memberCount: number;
}

export async function listAudiences(client: MailchimpClient): Promise<Audience[]> {
  const res = await client.request<{ lists: { id: string; name: string; stats?: { member_count?: number } }[] }>(
    "GET",
    "/lists?count=100&fields=lists.id,lists.name,lists.stats.member_count",
  );
  return res.lists.map((l) => ({ id: l.id, name: l.name, memberCount: l.stats?.member_count ?? 0 }));
}

export interface CampaignInput {
  audienceId: string;
  /** Internal campaign name in Mailchimp. */
  title: string;
  subject: string;
  previewText: string;
  html: string;
  /** Draft made earlier for this week; reused if it hasn't been sent. */
  existingCampaignId?: string;
}

export interface CampaignResult {
  campaignId: string;
  webId: number;
  /** Link to the campaign in Mailchimp. */
  editUrl: string;
  created: boolean;
}

interface Campaign {
  id: string;
  web_id: number;
  status: string;
}

/**
 * Create a draft campaign (or update this week's existing draft) with the
 * subject, preview text and HTML. From name and reply-to come from the
 * audience's defaults in Mailchimp.
 */
export async function pushCampaign(client: MailchimpClient, input: CampaignInput): Promise<CampaignResult> {
  const settings = { subject_line: input.subject, preview_text: input.previewText, title: input.title };

  let campaign: Campaign | null = null;
  if (input.existingCampaignId) {
    try {
      const existing = await client.request<Campaign>(
        "GET",
        `/campaigns/${encodeURIComponent(input.existingCampaignId)}?fields=id,web_id,status`,
      );
      // Only drafts can be changed; a sent or scheduled campaign is left alone.
      if (existing.status === "save" || existing.status === "paused") campaign = existing;
    } catch (e) {
      if (!(e instanceof MailchimpError)) throw e; // deleted in Mailchimp: make a new one
    }
  }

  let created = false;
  if (campaign) {
    await client.request("PATCH", `/campaigns/${campaign.id}`, {
      recipients: { list_id: input.audienceId },
      settings,
    });
  } else {
    const list = await client.request<{ campaign_defaults?: { from_name?: string; from_email?: string } }>(
      "GET",
      `/lists/${encodeURIComponent(input.audienceId)}?fields=campaign_defaults`,
    );
    const defaults = list.campaign_defaults ?? {};
    if (!defaults.from_name || !defaults.from_email) {
      throw new MailchimpError(
        "This Mailchimp audience has no default From name / email. Set them in Mailchimp: Audience → Settings → Audience name and defaults.",
      );
    }
    campaign = await client.request<Campaign>("POST", "/campaigns", {
      type: "regular",
      recipients: { list_id: input.audienceId },
      settings: { ...settings, from_name: defaults.from_name, reply_to: defaults.from_email },
    });
    created = true;
  }

  await client.request("PUT", `/campaigns/${campaign.id}/content`, { html: input.html });

  return {
    campaignId: campaign.id,
    webId: campaign.web_id,
    editUrl: campaignUrl(client.dc, campaign.web_id),
    created,
  };
}

export function campaignUrl(dc: string, webId: number): string {
  return `https://${dc}.admin.mailchimp.com/campaigns/edit?id=${webId}`;
}

export async function sendTestEmail(client: MailchimpClient, campaignId: string, emails: string[]): Promise<void> {
  await client.request("POST", `/campaigns/${encodeURIComponent(campaignId)}/actions/test`, {
    test_emails: emails,
    send_type: "html",
  });
}
