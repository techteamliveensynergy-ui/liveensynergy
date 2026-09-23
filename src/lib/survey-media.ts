import type { CSSProperties } from "react";
import { surveyFontStack } from "@/lib/survey-fonts";

/** Darkens a #rrggbb hex colour by a fraction (0-1) — used for a custom
 *  accent colour's hover state, mirroring --color-brand-dark's relationship
 *  to --color-brand in globals.css. Returns the input unchanged if it isn't
 *  a plain 6-digit hex (the colour input only ever produces one, but admin
 *  data is still admin-typed data). */
function darken(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  const r = Math.max(0, Math.round(((num >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.round(((num >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.round((num & 0xff) * (1 - amount)));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * CSS custom-property override for a survey's accent colour, scoped to a
 * wrapping element (never applied globally) around just the Next/Submit
 * button. `.btn-primary` in globals.css reads `--color-brand` for its base
 * fill and `--color-brand-dark` on hover — overriding both here, rather
 * than an inline `backgroundColor`, means the hover state picks up the
 * custom colour too instead of reverting to the platform default orange.
 * `.btn-ghost` (the Back button) doesn't reference either variable, so it's
 * unaffected by design.
 */
export function accentColorVars(color: string | null | undefined): CSSProperties | undefined {
  if (!color) return undefined;
  return {
    ["--color-brand" as string]: color,
    ["--color-brand-dark" as string]: darken(color, 0.12),
  } as CSSProperties;
}

export interface SurveyTypography {
  fontScale?: number | null;
  fontFamily?: string | null;
  questionTextColor?: string | null;
  bodyTextColor?: string | null;
}

/**
 * Scoped typography overrides for a survey renderer — applied to the
 * outermost <form className="survey-scope">, never globally. font-size is
 * set as a CSS length (not a bare inline fontSize on a Tailwind-sized
 * element) so the .survey-scope em-based rules in globals.css cascade from
 * it; the two colour variables are read by those same rules, falling back to
 * --color-ink/--color-ink-soft when unset; font-family cascades to every
 * descendant the normal CSS way. Returns undefined when nothing is
 * customized, matching accentColorVars()'s "no override" contract.
 */
export function typographyVars(t: SurveyTypography): CSSProperties | undefined {
  const scale = t.fontScale != null ? Math.min(1.6, Math.max(0.8, t.fontScale)) : 1;
  const fontFamily = surveyFontStack(t.fontFamily);
  if (scale === 1 && !fontFamily && !t.questionTextColor && !t.bodyTextColor) return undefined;
  return {
    fontSize: `calc(1rem * ${scale})`,
    fontFamily,
    ["--survey-question-color" as string]: t.questionTextColor ?? undefined,
    ["--survey-body-color" as string]: t.bodyTextColor ?? undefined,
  } as CSSProperties;
}

export interface SurveyQuestionTypography {
  font_family?: string;
  question_text_color?: string;
  body_text_color?: string;
}

/**
 * Per-question override of typographyVars() above (23 Sep client meeting),
 * applied to that question's own wrapper (the `.card` div), never the whole
 * form. Takes SurveyQuestionConfig's own field names (a caller just passes
 * `q.config`) rather than mirroring typographyVars()'s camelCase shape.
 * Relies on plain CSS inheritance/custom-property shadowing to win over the
 * template-level style on the outer .survey-scope — no !important, no extra
 * selectors needed. Returns undefined (no style at all) when the question
 * doesn't override anything, so it inherits the template's choices exactly
 * as before this existed.
 */
export function questionTypographyStyle(t: SurveyQuestionTypography): CSSProperties | undefined {
  const fontFamily = surveyFontStack(t.font_family);
  if (!fontFamily && !t.question_text_color && !t.body_text_color) return undefined;
  return {
    fontFamily,
    ["--survey-question-color" as string]: t.question_text_color ?? undefined,
    ["--survey-body-color" as string]: t.body_text_color ?? undefined,
  } as CSSProperties;
}

/**
 * Page-level decorative background for a survey — a single-page survey's
 * template-wide background_image_url, or a stepped survey's current
 * question's config.background_image_url. The cream wash on top keeps the
 * image from competing with the (opaque, `.card`-backed) content sitting on
 * it — cards stay crisp, the image only really reads in the gaps around
 * them and behind plain text like the footer.
 */
export function backgroundImageStyle(url: string | null | undefined): CSSProperties | undefined {
  if (!url) return undefined;
  return {
    backgroundImage: `linear-gradient(rgba(252,247,240,0.86), rgba(252,247,240,0.86)), url("${url}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    borderRadius: "1.25rem",
  };
}

/**
 * Turns a YouTube/Vimeo/Loom share link into an embeddable player URL.
 * Anything else returns null rather than iframe-embedding an arbitrary
 * origin — most sites block that via X-Frame-Options anyway, and the 4 Sep
 * standup's "embed links, not uploads" decision was about known video
 * platforms, not arbitrary URLs.
 */
export function videoEmbedUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1);
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") {
      const id = url.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (url.pathname.startsWith("/embed/")) return url.toString();
    if (url.pathname.startsWith("/shorts/")) {
      const id = url.pathname.split("/")[2];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    return null;
  }
  if (host === "vimeo.com") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
  }
  if (host === "player.vimeo.com") {
    return url.toString();
  }
  if (host === "loom.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "share" || parts[0] === "embed") {
      const id = parts[1];
      return id ? `https://www.loom.com/embed/${id}` : null;
    }
    return null;
  }

  return null;
}
