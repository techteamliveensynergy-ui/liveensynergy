import {
  fillMergeFields,
  whyReceived,
  type BrandTokens,
  type CampaignContent,
  type ContentBlock,
} from "./blocks";

/**
 * Renders a marketing email from blocks + brand tokens (plan: "Rendering
 * rules"): table-based HTML, max width 600px, absolute https image URLs with
 * alt text, preview text set, and a plain-text twin. Every string from an
 * admin or a brand is HTML-escaped; links and images must be https.
 *
 * The header (brand logo, optional partner) and footer (brand, legal line, why
 * you got this, physical address, unsubscribe) are always added here, so no
 * campaign can leave them out.
 *
 * Pure: no database, no env — the worker, the preview and the tests all call it.
 */

export interface RenderInput {
  subject: string;
  previewText: string;
  content: CampaignContent;
  tokens: BrandTokens;
  firstName?: string | null;
  unsubscribeUrl: string;
  /** Preview only: render with the dark palette regardless of the inbox. */
  forceDark?: boolean;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function safeUrl(u: string | undefined | null): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Black or white text, whichever reads better on the accent colour. */
export function textOn(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? "#1c1917" : "#ffffff";
}

interface Palette {
  outer: string;
  card: string;
  text: string;
  soft: string;
  line: string;
  promoBg: string;
}
const LIGHT: Palette = { outer: "#f4f1ec", card: "#ffffff", text: "#1c1917", soft: "#57534e", line: "#e7e2da", promoBg: "#faf7f2" };
const DARK: Palette = { outer: "#0f0f10", card: "#1b1b1d", text: "#f2f0ec", soft: "#b8b2aa", line: "#2e2e31", promoBg: "#232326" };

function paragraphs(text: string, p: Palette, font: string): string {
  return text
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map(
      (para) =>
        `<p class="les-text" style="margin:0 0 14px;font-family:${font};font-size:16px;line-height:24px;color:${p.text};">${esc(para).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

function blockHtml(b: ContentBlock, t: BrandTokens, p: Palette, first: string | null | undefined): string {
  const font = esc(t.font_stack);
  const fill = (s: string) => fillMergeFields(s, { first_name: first });
  switch (b.type) {
    case "hero": {
      const img = safeUrl(b.image_url);
      return `<tr><td style="padding:0 32px 8px;">
        ${img ? `<img src="${esc(img)}" alt="${esc(b.image_alt ?? "")}" width="536" style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:8px;margin:0 0 20px;">` : ""}
        <h1 class="les-text" style="margin:0 0 12px;font-family:${font};font-size:28px;line-height:34px;font-weight:700;color:${p.text};">${esc(fill(b.headline))}</h1>
        ${paragraphs(fill(b.body), p, font)}
      </td></tr>`;
    }
    case "steps": {
      const steps = b.steps.filter((s) => s.lead.trim() || s.text.trim());
      const rows = steps
        .map(
          (s, i) => `<tr>
            <td valign="top" width="36" style="padding:0 12px 14px 0;">
              <div style="width:28px;height:28px;border-radius:14px;background:${t.accent_color};color:${textOn(t.accent_color)};font-family:${font};font-size:14px;font-weight:700;line-height:28px;text-align:center;">${i + 1}</div>
            </td>
            <td valign="top" class="les-text" style="padding:2px 0 14px;font-family:${font};font-size:16px;line-height:24px;color:${p.text};"><strong>${esc(fill(s.lead))}</strong> ${esc(fill(s.text))}</td>
          </tr>`,
        )
        .join("");
      return `<tr><td style="padding:8px 32px 8px;">
        ${b.title ? `<h2 class="les-text" style="margin:0 0 14px;font-family:${font};font-size:20px;line-height:26px;color:${p.text};">${esc(fill(b.title))}</h2>` : ""}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      </td></tr>`;
    }
    case "promo":
      return `<tr><td style="padding:8px 32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="les-promo" style="background:${p.promoBg};border:2px dashed ${t.accent_color};border-radius:10px;">
          <tr><td align="center" style="padding:18px 16px;">
            <p class="les-soft" style="margin:0 0 6px;font-family:${font};font-size:13px;letter-spacing:1px;text-transform:uppercase;color:${p.soft};">${esc(b.discount)}</p>
            <p class="les-text" style="margin:0;font-family:'Courier New',monospace;font-size:26px;font-weight:700;letter-spacing:3px;color:${p.text};">${esc(b.code.trim())}</p>
            ${b.expiry ? `<p class="les-soft" style="margin:6px 0 0;font-family:${font};font-size:13px;color:${p.soft};">${esc(b.expiry)}</p>` : ""}
          </td></tr>
        </table>
      </td></tr>`;
    case "cta": {
      const href = safeUrl(b.url);
      if (!href) return "";
      if (b.style === "link") {
        return `<tr><td style="padding:4px 32px 16px;font-family:${font};font-size:16px;">
          <a href="${esc(href)}" style="color:${t.accent_color};text-decoration:underline;font-weight:700;">${esc(b.label)}</a>
        </td></tr>`;
      }
      return `<tr><td style="padding:8px 32px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="border-radius:8px;background:${t.accent_color};">
            <a href="${esc(href)}" style="display:inline-block;padding:14px 26px;font-family:${font};font-size:16px;font-weight:700;color:${textOn(t.accent_color)};text-decoration:none;border-radius:8px;">${esc(b.label)}</a>
          </td>
        </tr></table>
      </td></tr>`;
    }
  }
}

function blockText(b: ContentBlock, first: string | null | undefined): string {
  const fill = (s: string) => fillMergeFields(s, { first_name: first });
  switch (b.type) {
    case "hero":
      return `${fill(b.headline)}\n\n${fill(b.body)}`;
    case "steps":
      return [
        b.title ? fill(b.title) : null,
        ...b.steps.filter((s) => s.lead.trim() || s.text.trim()).map((s, i) => `${i + 1}. ${fill(s.lead)} ${fill(s.text)}`),
      ]
        .filter(Boolean)
        .join("\n");
    case "promo":
      return `${b.discount}: ${b.code.trim()}${b.expiry ? ` (${b.expiry})` : ""}`;
    case "cta":
      return safeUrl(b.url) ? `${b.label}: ${safeUrl(b.url)}` : "";
  }
}

export function renderCampaignEmail(input: RenderInput): { html: string; text: string } {
  const t = input.tokens;
  const dark = input.forceDark || t.background === "dark";
  const p = dark ? DARK : LIGHT;
  const font = esc(t.font_stack);
  const logo = safeUrl(t.logo_url);
  const partnerLogo = safeUrl(input.content.partner_logo_url);
  const partner = input.content.partner_name?.trim();
  const unsub = esc(input.unsubscribeUrl);

  const header = `<tr><td style="padding:28px 32px 20px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td valign="middle">${
        logo
          ? `<img src="${esc(logo)}" alt="${esc(t.brand_name)}" height="40" style="display:block;height:40px;width:auto;border:0;">`
          : `<span class="les-text" style="font-family:${font};font-size:20px;font-weight:700;color:${p.text};">${esc(t.brand_name)}</span>`
      }</td>
      ${
        partner
          ? `<td valign="middle" class="les-soft" style="padding:0 12px;font-family:${font};font-size:18px;color:${p.soft};">×</td>
             <td valign="middle">${
               partnerLogo
                 ? `<img src="${esc(partnerLogo)}" alt="${esc(partner)}" height="40" style="display:block;height:40px;width:auto;border:0;">`
                 : `<span class="les-text" style="font-family:${font};font-size:20px;font-weight:700;color:${p.text};">${esc(partner)}</span>`
             }</td>`
          : ""
      }
    </tr></table>
  </td></tr>`;

  const body = input.content.blocks.map((b) => blockHtml(b, t, p, input.firstName)).join("");

  const footer = `<tr><td class="les-line" style="padding:20px 32px 28px;border-top:1px solid ${p.line};">
    <p class="les-soft" style="margin:0 0 8px;font-family:${font};font-size:12px;line-height:18px;color:${p.soft};"><strong>${esc(t.brand_name)}</strong>${t.footer_legal ? ` · ${esc(t.footer_legal)}` : ""}</p>
    <p class="les-soft" style="margin:0 0 8px;font-family:${font};font-size:12px;line-height:18px;color:${p.soft};">${esc(whyReceived(t.brand_name))}</p>
    ${t.physical_address ? `<p class="les-soft" style="margin:0 0 8px;font-family:${font};font-size:12px;line-height:18px;color:${p.soft};">${esc(t.physical_address)}</p>` : ""}
    <p class="les-soft" style="margin:0;font-family:${font};font-size:12px;line-height:18px;color:${p.soft};">
      Sent by Live·En·Synergy on behalf of ${esc(t.brand_name)}. <a href="${unsub}" style="color:${p.soft};text-decoration:underline;">Unsubscribe</a>
    </p>
  </td></tr>`;

  const preview = esc(fillMergeFields(input.previewText || "", { first_name: input.firstName }));
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="${dark ? "dark" : "light dark"}"><meta name="supported-color-schemes" content="light dark">
<title>${esc(fillMergeFields(input.subject, { first_name: input.firstName }))}</title>
${
  dark
    ? ""
    : `<style>@media (prefers-color-scheme: dark){.les-outer{background:${DARK.outer}!important}.les-card{background:${DARK.card}!important}.les-text{color:${DARK.text}!important}.les-soft{color:${DARK.soft}!important}.les-line{border-color:${DARK.line}!important}.les-promo{background:${DARK.promoBg}!important}}</style>`
}
</head>
<body style="margin:0;padding:0;background:${p.outer};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preview}${"&#8199;&#65279;&#847;".repeat(30)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="les-outer" style="background:${p.outer};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" class="les-card" style="width:100%;max-width:600px;background:${p.card};border-radius:12px;">
${header}${body}${footer}
</table>
</td></tr></table>
</body></html>`;

  const text = [
    partner ? `${t.brand_name} × ${partner}` : t.brand_name,
    "",
    ...input.content.blocks.map((b) => blockText(b, input.firstName)).filter(Boolean).flatMap((s) => [s, ""]),
    "—",
    `${t.brand_name}${t.footer_legal ? ` · ${t.footer_legal}` : ""}`,
    whyReceived(t.brand_name),
    t.physical_address ?? "",
    `Unsubscribe: ${input.unsubscribeUrl}`,
  ]
    .filter((l) => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { html, text };
}
