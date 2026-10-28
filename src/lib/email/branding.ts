import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The admin-editable wrapper around every email (GitHub #66, 0093). Every
 * field is optional: unset means today's default, so a missing or unreadable
 * row renders the original design.
 */
export interface EmailBranding {
  logo_url?: string | null;
  header_bg?: string | null;
  header_text?: string | null;
  font?: EmailFontKey | null;
  footer_text?: string | null;
}

export const DEFAULT_HEADER_BG = "#e8590c";
export const DEFAULT_HEADER_TEXT = "#ffffff";

/** Email-safe stacks only. Web fonts don't load in Outlook and most Gmail,
 *  so each ends in a font every client has. */
export const EMAIL_FONTS = {
  system: { label: "System (default)", stack: "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif" },
  arial: { label: "Arial / Helvetica", stack: "Arial,Helvetica,sans-serif" },
  georgia: { label: "Georgia (serif)", stack: "Georgia,'Times New Roman',serif" },
  verdana: { label: "Verdana", stack: "Verdana,Geneva,sans-serif" },
} as const;
export type EmailFontKey = keyof typeof EMAIL_FONTS;

const HEX = /^#[0-9a-f]{6}$/i;

/** WCAG relative-luminance contrast ratio between two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  if (!HEX.test(a) || !HEX.test(b)) return 21;
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The branding row, or {} when there is none or it can't be read. */
export async function loadEmailBranding(supabase: SupabaseClient): Promise<EmailBranding> {
  try {
    const { data, error } = await supabase
      .from("email_branding")
      .select("logo_url, header_bg, header_text, font, footer_text")
      .maybeSingle<EmailBranding>();
    if (error || !data) return {};
    return data;
  } catch {
    return {};
  }
}

/** Plain-text part: the body, then the footer text when one is set. */
export function renderEmailText(body: string, branding: EmailBranding = {}): string {
  const footer = branding.footer_text?.trim();
  return footer ? `${body}\n\n--\n${footer}` : body;
}
