/**
 * Marketing email content (plan: "Template system").
 *
 * A campaign email = layout + brand tokens + content JSON. No email is designed
 * from scratch: the content is a short list of blocks from this library, and
 * the header and footer are always added by the renderer — the footer can't be
 * edited away (brand name, physical address, why you got this, unsubscribe).
 *
 * Shared by the admin editor (client) and the renderer/worker (server), so it
 * holds no server-only imports.
 */

export type HeroBlock = { type: "hero"; headline: string; body: string; image_url?: string; image_alt?: string };
export type StepsBlock = { type: "steps"; title?: string; steps: { lead: string; text: string }[] };
export type PromoBlock = { type: "promo"; code: string; discount: string; expiry?: string };
export type CtaBlock = { type: "cta"; label: string; url: string; style: "button" | "link" };
export type ContentBlock = HeroBlock | StepsBlock | PromoBlock | CtaBlock;

export interface CampaignContent {
  /** Co-brand bar: the partner shown beside the brand ("Entourage Pro × JH Audio"). */
  partner_name?: string;
  partner_logo_url?: string;
  blocks: ContentBlock[];
}

/** Per-brand look and legal footer (brand_marketing_settings, falling back to the brand's profile). */
export interface BrandTokens {
  brand_name: string;
  logo_url: string | null;
  accent_color: string;
  background: "light" | "dark";
  font_stack: string;
  footer_legal: string | null;
  physical_address: string | null;
  reply_to: string | null;
}

export const DEFAULT_ACCENT = "#ed9a4e";
export const DEFAULT_FONT_STACK = "Helvetica, Arial, sans-serif";
export const MAX_STEPS = 5;
export const MIN_STEPS = 2;

/** Why the person is getting this — fixed wording, printed in every footer. */
export function whyReceived(brandName: string): string {
  return `You're receiving this because you agreed to hear from ${brandName} when you registered for one of their events on Live·En·Synergy.`;
}

export function emptyContent(): CampaignContent {
  return {
    blocks: [
      { type: "hero", headline: "", body: "" },
      { type: "cta", label: "", url: "", style: "button" },
    ],
  };
}

const isHttpsUrl = (s: string | undefined) => {
  if (!s) return false;
  try {
    const u = new URL(s);
    return u.protocol === "https:";
  } catch {
    return false;
  }
};

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Whatever is stored, coerced into the shape (unknown blocks dropped). Never throws. */
export function parseContent(raw: unknown): CampaignContent {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const blocks: ContentBlock[] = [];
  for (const b of Array.isArray(obj.blocks) ? obj.blocks : []) {
    const x = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
    switch (x.type) {
      case "hero":
        blocks.push({
          type: "hero",
          headline: clip(x.headline, 150),
          body: clip(x.body, 1500),
          image_url: clip(x.image_url, 1000) || undefined,
          image_alt: clip(x.image_alt, 200) || undefined,
        });
        break;
      case "steps":
        blocks.push({
          type: "steps",
          title: clip(x.title, 100) || undefined,
          steps: (Array.isArray(x.steps) ? x.steps : []).slice(0, MAX_STEPS).map((s) => {
            const y = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
            return { lead: clip(y.lead, 80), text: clip(y.text, 200) };
          }),
        });
        break;
      case "promo":
        blocks.push({ type: "promo", code: clip(x.code, 40), discount: clip(x.discount, 80), expiry: clip(x.expiry, 80) || undefined });
        break;
      case "cta":
        blocks.push({ type: "cta", label: clip(x.label, 60), url: clip(x.url, 1000), style: x.style === "link" ? "link" : "button" });
        break;
    }
  }
  return {
    partner_name: clip(obj.partner_name, 80) || undefined,
    partner_logo_url: clip(obj.partner_logo_url, 1000) || undefined,
    blocks,
  };
}

/**
 * What stops a campaign being scheduled. Drafts can be saved incomplete; a
 * send needs every one of these to be fine.
 */
export function campaignProblems(
  input: { subject: string; content: CampaignContent },
  tokens: Pick<BrandTokens, "physical_address" | "logo_url">,
): string[] {
  const problems: string[] = [];
  const { content } = input;
  if (!input.subject.trim()) problems.push("Add a subject line.");
  if (!tokens.physical_address?.trim()) {
    problems.push("The brand has no physical address for the footer — add one in Marketing → Brand settings (the law requires it).");
  }
  if (tokens.logo_url && !isHttpsUrl(tokens.logo_url)) problems.push("The brand logo must be an https:// image address.");
  if (content.partner_logo_url && !isHttpsUrl(content.partner_logo_url)) problems.push("The partner logo must be an https:// image address.");
  if (content.partner_logo_url && !content.partner_name?.trim()) problems.push("Name the partner whose logo is in the header (used as its alt text).");

  const heroes = content.blocks.filter((b) => b.type === "hero");
  if (heroes.length === 0) problems.push("Add a hero block — the email needs a headline.");
  content.blocks.forEach((b, i) => {
    const n = `Block ${i + 1}`;
    if (b.type === "hero") {
      if (!b.headline.trim()) problems.push(`${n} (hero): add a headline.`);
      if (b.image_url && !isHttpsUrl(b.image_url)) problems.push(`${n} (hero): the image must be an https:// address.`);
      if (b.image_url && !b.image_alt?.trim()) problems.push(`${n} (hero): describe the image (alt text) for people who can't see it.`);
    } else if (b.type === "steps") {
      const filled = b.steps.filter((s) => s.lead.trim() || s.text.trim());
      if (filled.length < MIN_STEPS || filled.length > MAX_STEPS) problems.push(`${n} (steps): use ${MIN_STEPS}–${MAX_STEPS} steps.`);
      if (filled.some((s) => !s.lead.trim())) problems.push(`${n} (steps): every step needs a bold lead.`);
    } else if (b.type === "promo") {
      if (!b.code.trim()) problems.push(`${n} (promo code): add the code.`);
      if (!/^[A-Za-z0-9_-]{3,40}$/.test(b.code.trim())) problems.push(`${n} (promo code): letters, numbers, - and _ only.`);
      if (!b.discount.trim()) problems.push(`${n} (promo code): say what it's worth, e.g. "20% off".`);
    } else if (b.type === "cta") {
      if (!b.label.trim()) problems.push(`${n} (button/link): add the text people click.`);
      if (!isHttpsUrl(b.url)) problems.push(`${n} (button/link): the address must start with https://.`);
    }
  });
  return [...new Set(problems)];
}

/** {{first_name}} with a fallback; any other {{…}} is removed, never shown raw. */
export function fillMergeFields(text: string, vars: { first_name?: string | null }): string {
  return text
    .replace(/\{\{\s*first_name\s*\}\}/gi, (vars.first_name ?? "").trim() || "there")
    .replace(/\{\{[^}]*\}\}/g, "");
}
