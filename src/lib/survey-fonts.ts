/**
 * Curated font choices for survey templates/questions (23 Sep client
 * meeting — there was no font choice at all before this). Deliberately
 * limited to the three families the app already loads via next/font in
 * src/app/layout.tsx (--font-sans/--font-display/--font-serif) rather than
 * pulling in arbitrary Google Fonts at runtime — that would mean a dynamic
 * stylesheet <link>, flash-of-unstyled-text handling, and a much bigger
 * surface, for a request that just wants something to switch between.
 *
 * Stored as a stable `key`, never the raw CSS stack — so re-theming a font
 * later only touches this file, not every survey_templates/config row that
 * picked it.
 */
export interface SurveyFontOption {
  key: string;
  label: string;
  /** CSS font-family value — the var(...) is one of the --font-* custom
   *  properties defined in globals.css's @theme block. */
  stack: string;
}

export const SURVEY_FONT_OPTIONS: SurveyFontOption[] = [
  { key: "sans", label: "Sans-serif (default)", stack: "var(--font-sans)" },
  { key: "display", label: "Display (bold, modern)", stack: "var(--font-display)" },
  { key: "serif", label: "Serif (elegant, editorial)", stack: "var(--font-serif)" },
];

/** Resolves a stored font key to its CSS stack, or undefined for an unset/
 *  unknown key — undefined rather than a default stack, so callers can spread
 *  it into an inline style and let it fall through to whatever font-family
 *  the element would otherwise inherit (the platform default, or a
 *  template-level choice for a question that doesn't override one). */
export function surveyFontStack(key: string | null | undefined): string | undefined {
  if (!key) return undefined;
  return SURVEY_FONT_OPTIONS.find((f) => f.key === key)?.stack;
}
