import type { CSSProperties } from "react";
import { surveyFontStack } from "@/lib/survey-fonts";
import type { SurveyQuestionConfig, SurveyQuestionFontSize, SurveyTemplate, SurveyVideoFormat } from "@/lib/types";

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

/** Default for SurveyTemplate.background_image_opacity (0062) — also what a
 *  template row read before 0062 is applied falls back to. */
export const DEFAULT_BACKGROUND_IMAGE_OPACITY = 30;

/**
 * Page-level decorative background for a survey — a single-page survey's
 * template-wide background_image_url, or a stepped survey's current
 * question's background image. A cream wash on top keeps the image from
 * competing with the (opaque, `.card`-backed) content sitting on it; how much
 * of the image shows through is the template's background_image_opacity
 * (0-100). It used to be a fixed 86% wash (≈14% visible) — the 13 Oct client
 * notes asked for more, hence the setting and its default of 30.
 */
export function backgroundImageStyle(
  url: string | null | undefined,
  opacity: number | null | undefined = DEFAULT_BACKGROUND_IMAGE_OPACITY,
): CSSProperties | undefined {
  if (!url) return undefined;
  const visible = Math.min(100, Math.max(0, opacity ?? DEFAULT_BACKGROUND_IMAGE_OPACITY));
  const wash = ((100 - visible) / 100).toFixed(2);
  return {
    backgroundImage: `linear-gradient(rgba(252,247,240,${wash}), rgba(252,247,240,${wash})), url("${url}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    borderRadius: "1rem",
  };
}

/**
 * The template-wide presentation settings every survey renderer needs on top
 * of typographyVars() — grouped into one prop so a new setting doesn't mean
 * threading another prop through four renderers and three pages.
 */
export interface SurveyAppearance {
  questionFontSize: SurveyQuestionFontSize;
  cardBackgroundColor: string | null;
  backgroundImageOpacity: number;
  coverVideoFormat: SurveyVideoFormat | null;
}

export const DEFAULT_SURVEY_APPEARANCE: SurveyAppearance = {
  questionFontSize: "md",
  cardBackgroundColor: null,
  backgroundImageOpacity: DEFAULT_BACKGROUND_IMAGE_OPACITY,
  coverVideoFormat: null,
};

/** Reads a template row's 0062 columns, tolerating a row read before 0062
 *  was applied (every field undefined) by falling back to the defaults. */
export function surveyAppearance(
  tpl: Partial<
    Pick<SurveyTemplate, "question_font_size" | "card_background_color" | "background_image_opacity" | "cover_video_format">
  >,
): SurveyAppearance {
  return {
    questionFontSize: tpl.question_font_size ?? DEFAULT_SURVEY_APPEARANCE.questionFontSize,
    cardBackgroundColor: tpl.card_background_color ?? null,
    backgroundImageOpacity: tpl.background_image_opacity ?? DEFAULT_BACKGROUND_IMAGE_OPACITY,
    coverVideoFormat: tpl.cover_video_format ?? null,
  };
}

/** Fill for a survey card: the question's own override, else the template's,
 *  else nothing (the `.card` white). */
export function cardBackgroundStyle(
  appearance: SurveyAppearance | undefined,
  config?: Pick<SurveyQuestionConfig, "card_background_color">,
): CSSProperties | undefined {
  const color = config?.card_background_color || appearance?.cardBackgroundColor;
  return color ? { backgroundColor: color } : undefined;
}

/** Labels for the four prompt sizes, shared by the template form and the
 *  question inspector. */
export const QUESTION_FONT_SIZE_OPTIONS: { value: SurveyQuestionFontSize; label: string }[] = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium (default)" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra large" },
];

/**
 * One-click colour themes for the template form (13 Oct client notes: "can
 * you upload a theme or change the colour background of the survey card").
 * A preset only fills the existing colour fields — nothing new is stored, and
 * every field stays editable afterwards. `null` means "platform default".
 */
export interface SurveyThemePreset {
  key: string;
  label: string;
  accent: string | null;
  card: string | null;
  question: string | null;
  body: string | null;
}

export const SURVEY_THEME_PRESETS: SurveyThemePreset[] = [
  { key: "classic", label: "Classic", accent: null, card: null, question: null, body: null },
  { key: "sunset", label: "Sunset", accent: "#e8692c", card: "#fff4e8", question: "#7a2e0e", body: "#8f4f33" },
  { key: "forest", label: "Forest", accent: "#2f7d4f", card: "#eef4ec", question: "#1f3d2b", body: "#46604f" },
  { key: "lavender", label: "Lavender", accent: "#8a63d2", card: "#f3eefc", question: "#3b2a5e", body: "#5f5180" },
  { key: "ocean", label: "Ocean", accent: "#1f7fb6", card: "#e9f3f8", question: "#0f3550", body: "#41627a" },
  { key: "midnight", label: "Midnight", accent: "#a58cff", card: "#1f2233", question: "#ffffff", body: "#d3d5e8" },
];

/**
 * Recommended upload sizes per placement (13 Oct client notes: "if autofit
 * doesn't work, we can know specific image sizes"). Each placement renders
 * in a fixed-shape box, so an image at this ratio is shown uncropped.
 */
export const RECOMMENDED_IMAGE_SIZES = {
  topBottom: "1600 × 800 px (2:1, landscape)",
  side: "1080 × 1350 px (4:5, portrait)",
  background: "1920 × 1080 px (16:9)",
  cover: "1600 × 900 px (16:9)",
  option: "800 × 800 px (square)",
  logo: "400 × 400 px (square, transparent PNG)",
} as const;

/**
 * Turns a YouTube/Vimeo/Loom/Instagram/TikTok share link into an embeddable player URL.
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
  // Reels (13 Oct client notes). Instagram serves an embeddable player at
  // /<kind>/<id>/embed; TikTok at /embed/v2/<id>. Short share links
  // (vm.tiktok.com/…) hide the id behind a redirect we can't follow from
  // here, so they return null and the builder says so.
  if (host === "instagram.com") {
    const [kind, id] = url.pathname.split("/").filter(Boolean);
    if ((kind === "reel" || kind === "reels" || kind === "p" || kind === "tv") && id) {
      return `https://www.instagram.com/${kind === "reels" ? "reel" : kind}/${id}/embed`;
    }
    return null;
  }
  if (host === "tiktok.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    const i = parts.indexOf("video");
    const id = i >= 0 ? parts[i + 1] : parts[0] === "embed" ? parts[parts.length - 1] : undefined;
    return id && /^\d+$/.test(id) ? `https://www.tiktok.com/embed/v2/${id}` : null;
  }

  return null;
}

/** Platforms whose links are reels/shorts — portrait 9:16 by default. */
function looksPortrait(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") return url.pathname.startsWith("/shorts/");
    return host === "instagram.com" || host === "tiktok.com";
  } catch {
    return false;
  }
}

/** The admin's explicit choice wins; otherwise a Shorts/Reels/TikTok link is
 *  portrait and anything else landscape. */
export function videoFormatFor(
  url: string | null | undefined,
  explicit: SurveyVideoFormat | null | undefined,
): SurveyVideoFormat {
  if (explicit) return explicit;
  return url && looksPortrait(url) ? "portrait" : "landscape";
}
