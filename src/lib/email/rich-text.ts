/**
 * The small, safe formatting admins can use in an email's body and footer:
 *
 *   [link text](https://example.com)   a hyperlink
 *   **bold**   *italic*                inline formatting
 *   ## Heading                         a heading line
 *   - item                             bullet list (consecutive lines)
 *   ![Button text](https://example.com) a button, on a line of its own
 *   ---                                a divider line
 *
 * Everything else is plain text. This is deliberately NOT free HTML: the text is
 * HTML-escaped first and only these shapes are turned into tags, so nothing
 * typed here (or substituted into a template) can inject markup or script.
 * No "server-only" import: the editor preview runs the very same code.
 */

const ZWSP = "​";

/** `[label](url)` — label on one line, url without spaces or `)`. */
const LINK = /\[([^\]\n]{1,200})\]\(([^)\s]{1,1000})\)/g;
const BOLD = /\*\*([^*\n]+?)\*\*/g;
/** *italic* — not next to another * or a letter, and never around a space or a zero-width space. */
const ITALIC = /(?<![*\w])\*(?![\s\u200B*])([^*\n]*?[^*\s\u200B])\*(?![*\w])/g;
const BUTTON_LINE = /^!\[([^\]\n]{1,200})\]\(([^)\s]{1,1000})\)$/;
const HEADING_LINE = /^#{1,3}\s+(.+)$/;
const BULLET_LINE = /^[-•]\s+(.+)$/;
const RULE_LINE = /^-{3,}$/;

export function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Addresses a link may point at: web, mail and phone only — never `javascript:`. */
export function isSafeHref(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "mailto:" || u.protocol === "tel:";
  } catch {
    return false;
  }
}

/**
 * Values substituted into a template (a brand name, a reason) are typed by other
 * people. A zero-width space breaks `](` and `**` so such a value can never turn
 * into a link or bold of its own — invisible to the reader.
 */
export function neutraliseMarkup(value: string): string {
  return value.replace(/\]\(/g, `]${ZWSP}(`).replace(/\*/g, `*${ZWSP}`);
}

/** The first link in `text` that can't be used, as a sentence for the admin; null when all are fine. */
export function richLinkProblem(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const m of text.matchAll(LINK)) {
    if (!isSafeHref(m[2])) {
      return `The link “${m[1]}” goes to “${m[2]}”, which isn't a usable address. Start it with https:// (or mailto: for an email address).`;
    }
  }
  return null;
}

function inline(chunk: string, linkify?: (escaped: string) => string): string {
  let out = escapeText(chunk).replace(BOLD, "<strong>$1</strong>").replace(ITALIC, "<em>$1</em>");
  if (linkify) out = linkify(out);
  return out;
}

/**
 * Text → email-safe HTML (inline only; the caller wraps paragraphs). Line breaks
 * inside a chunk are left for the caller. `linkStyle` is the inline style for
 * links; `linkify` optionally auto-links bare addresses in the plain stretches.
 */
export function richToHtml(
  text: string,
  opts: { linkStyle: string; linkify?: (escaped: string) => string },
): string {
  let html = "";
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    const start = m.index ?? 0;
    html += inline(text.slice(last, start), opts.linkify);
    if (isSafeHref(m[2])) {
      html += `<a href="${escapeText(m[2])}" style="${opts.linkStyle}">${inline(m[1])}</a>`;
    } else {
      html += inline(m[0], opts.linkify); // unusable address: leave it as visible text
    }
    last = start + m[0].length;
  }
  return html + inline(text.slice(last), opts.linkify);
}

/** Text → plain-text email part: `label (url)`, markers removed, bullets as •, buttons as `label: url`. */
export function richToText(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const t = line.trim();
      const btn = t.match(BUTTON_LINE);
      if (btn && isSafeHref(btn[2])) return `${btn[1]}: ${btn[2]}`;
      if (RULE_LINE.test(t)) return "--------------------";
      const h = t.match(HEADING_LINE);
      if (h) return h[1];
      const b = t.match(BULLET_LINE);
      return b ? `• ${b[1]}` : line;
    })
    .join("\n")
    .replace(LINK, (whole, label: string, url: string) => (isSafeHref(url) ? `${label} (${url})` : whole))
    .replace(BOLD, "$1")
    .replace(ITALIC, "$1");
}

export interface RichStyles {
  /** Style of every paragraph-level element (margin, size, colour). */
  p: string;
  link: string;
  buttonBg: string;
  buttonFg: string;
  linkify?: (escaped: string) => string;
}

/**
 * Whole text → email-safe HTML blocks: paragraphs (blank-line separated), headings,
 * bullet lists, buttons and dividers. Inline formatting inside each.
 */
export function richBlocksToHtml(text: string, st: RichStyles): string {
  const inl = (s: string) => richToHtml(s, { linkStyle: st.link, linkify: st.linkify });
  const out: string[] = [];
  for (const para of text.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const lines = para.split("\n").map((l) => l.trim()).filter(Boolean);
    let run: string[] = [];
    let bullets: string[] = [];
    const flushText = () => {
      if (run.length) out.push(`<p style="${st.p}">${run.map(inl).join("<br>")}</p>`);
      run = [];
    };
    const flushBullets = () => {
      if (bullets.length) {
        out.push(
          `<ul style="margin:0 0 16px;padding-left:20px;${st.p.replace(/margin:[^;]+;?/, "")}">${bullets
            .map((b) => `<li style="margin:0 0 4px;">${inl(b)}</li>`)
            .join("")}</ul>`,
        );
      }
      bullets = [];
    };
    for (const line of lines) {
      const btn = line.match(BUTTON_LINE);
      const h = line.match(HEADING_LINE);
      const b = line.match(BULLET_LINE);
      if (btn && isSafeHref(btn[2])) {
        flushText();
        flushBullets();
        out.push(
          `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;"><tr><td style="background:${st.buttonBg};border-radius:10px;"><a href="${escapeText(
            btn[2],
          )}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:${st.buttonFg};text-decoration:none;">${inl(btn[1])}</a></td></tr></table>`,
        );
      } else if (RULE_LINE.test(line)) {
        flushText();
        flushBullets();
        out.push(`<hr style="border:0;border-top:1px solid #e7e5e4;margin:16px 0;">`);
      } else if (h) {
        flushText();
        flushBullets();
        out.push(`<p style="${st.p}font-size:18px;font-weight:700;">${inl(h[1])}</p>`);
      } else if (b) {
        flushText();
        bullets.push(b[1]);
      } else {
        flushBullets();
        run.push(line);
      }
    }
    flushText();
    flushBullets();
  }
  return out.join("");
}
