import "server-only";

/**
 * Wraps an admin-editable plain-text notification body in a simple,
 * email-client-safe HTML layout (tables + inline styles).
 *
 * The body is untrusted-ish: templates are admin-edited but their {{tokens}}
 * carry user-supplied text (a brand name, a rejection reason). So it is
 * HTML-escaped FIRST, and a URL is only made clickable when it points at our
 * own origin — a brand called "https://evil.example" stays inert text.
 */

const BRAND = "#e8590c"; // --color-brand
const INK = "#1c1917"; // --color-ink
const INK_SOFT = "#57534e";
const MIST = "#f7f3ec"; // --color-mist

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function siteOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/** Escapes a line, then links any URL that is on our own origin. */
function linkifyOwnOrigin(escapedLine: string): string {
  const origin = siteOrigin();
  if (!origin) return escapedLine;
  // Operates on already-escaped text, so `&amp;` in a query string is fine.
  return escapedLine.replace(/https?:\/\/[^\s<]+/g, (match) => {
    const raw = match.replace(/&amp;/g, "&");
    try {
      if (new URL(raw).origin !== origin) return match;
    } catch {
      return match;
    }
    return `<a href="${match}" style="color:${BRAND};">${match}</a>`;
  });
}

export function renderEmailHtml(input: { subject: string; body: string }): string {
  const origin = siteOrigin();
  const paragraphs = input.body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${INK};">${linkifyOwnOrigin(
          escapeHtml(p),
        ).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

  const settingsLink = origin
    ? ` &middot; <a href="${origin}/dashboard/settings" style="color:${INK_SOFT};">Notification settings</a>`
    : "";

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(
    input.subject,
  )}</title></head>
<body style="margin:0;padding:0;background:${MIST};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MIST};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
<tr><td style="background:${BRAND};padding:18px 28px;color:#ffffff;font-size:16px;font-weight:700;letter-spacing:.2px;">Live&middot;En&middot;Synergy</td></tr>
<tr><td style="padding:28px 28px 12px;">${paragraphs}</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #eee;font-size:12px;line-height:1.5;color:${INK_SOFT};">You&rsquo;re receiving this because of activity on your Live&middot;En&middot;Synergy account${settingsLink}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
