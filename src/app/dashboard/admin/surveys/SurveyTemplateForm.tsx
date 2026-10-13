"use client";

import { useActionState, useState, type CSSProperties } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/OnboardingShell";
import { ErrorBanner, SuccessBanner } from "@/components/onboarding/parts";
import type {
  SurveyMediaType,
  SurveyQuestionFontSize,
  SurveyTemplate,
  SurveyTemplateKind,
  SurveyTemplateLayoutMode,
  SurveyVideoFormat,
} from "@/lib/types";
import { SURVEY_FONT_OPTIONS } from "@/lib/survey-fonts";
import {
  DEFAULT_BACKGROUND_IMAGE_OPACITY,
  QUESTION_FONT_SIZE_OPTIONS,
  RECOMMENDED_IMAGE_SIZES,
  SURVEY_THEME_PRESETS,
  videoEmbedUrl,
  videoFormatFor,
} from "@/lib/survey-media";
import {
  createSurveyTemplate,
  updateSurveyTemplate,
  uploadSurveyBackground,
  uploadSurveyCoverMedia,
  uploadSurveyLogo,
  type SurveyState,
} from "./actions";

const DEFAULT_ACCENT = "#ed9a4e";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export interface CampaignOption {
  id: string;
  reference: string;
  brand_name: string | null;
}

export function SurveyTemplateForm({
  template,
  campaigns,
}: {
  template?: SurveyTemplate;
  campaigns: CampaignOption[];
}) {
  const editing = Boolean(template);
  const action = editing ? updateSurveyTemplate : createSurveyTemplate;
  const [state, formAction] = useActionState<SurveyState, FormData>(action, {});
  const [kind, setKind] = useState<SurveyTemplateKind>(template?.kind ?? "pre_event");

  const [layoutMode, setLayoutMode] = useState<SurveyTemplateLayoutMode>(
    template?.layout_mode ?? "single_page",
  );
  const [coverMediaType, setCoverMediaType] = useState<SurveyMediaType | "">(
    template?.cover_media_type ?? "",
  );
  const [coverMediaUrl, setCoverMediaUrl] = useState(template?.cover_media_url ?? "");
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverUploadError, setCoverUploadError] = useState<string | null>(null);
  const [accentColor, setAccentColor] = useState(template?.accent_color ?? "");
  const [fontScale, setFontScale] = useState(String(template?.font_scale ?? 1));
  const [fontFamily, setFontFamily] = useState(template?.font_family ?? SURVEY_FONT_OPTIONS[0].key);
  const [questionTextColor, setQuestionTextColor] = useState(template?.question_text_color ?? "");
  const [bodyTextColor, setBodyTextColor] = useState(template?.body_text_color ?? "");
  const [footerLogoUrl, setFooterLogoUrl] = useState(template?.footer_logo_url ?? "");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState(template?.background_image_url ?? "");
  const [bgUploading, setBgUploading] = useState(false);
  const [bgUploadError, setBgUploadError] = useState<string | null>(null);
  // 0062 presentation settings (13 Oct client notes).
  const [questionFontSize, setQuestionFontSize] = useState<SurveyQuestionFontSize>(
    template?.question_font_size ?? "md",
  );
  const [cardBackgroundColor, setCardBackgroundColor] = useState(template?.card_background_color ?? "");
  const [backgroundImageOpacity, setBackgroundImageOpacity] = useState(
    template?.background_image_opacity ?? DEFAULT_BACKGROUND_IMAGE_OPACITY,
  );
  const [coverVideoFormat, setCoverVideoFormat] = useState<SurveyVideoFormat | "">(
    template?.cover_video_format ?? "",
  );

  function applyTheme(key: string) {
    const theme = SURVEY_THEME_PRESETS.find((t) => t.key === key);
    if (!theme) return;
    setAccentColor(theme.accent ?? "");
    setCardBackgroundColor(theme.card ?? "");
    setQuestionTextColor(theme.question ?? "");
    setBodyTextColor(theme.body ?? "");
  }

  async function handleCoverImageSelect(file: File | undefined) {
    if (!file) return;
    setCoverUploading(true);
    setCoverUploadError(null);
    const form = new FormData();
    form.set("file", file);
    const result = await uploadSurveyCoverMedia(form);
    setCoverUploading(false);
    if (result.error) {
      setCoverUploadError(result.error);
      return;
    }
    setCoverMediaUrl(result.url ?? "");
  }

  async function handleLogoSelect(file: File | undefined) {
    if (!file) return;
    setLogoUploading(true);
    setLogoUploadError(null);
    const form = new FormData();
    form.set("file", file);
    const result = await uploadSurveyLogo(form);
    setLogoUploading(false);
    if (result.error) {
      setLogoUploadError(result.error);
      return;
    }
    setFooterLogoUrl(result.url ?? "");
  }

  async function handleBackgroundSelect(file: File | undefined) {
    if (!file) return;
    setBgUploading(true);
    setBgUploadError(null);
    const form = new FormData();
    form.set("file", file);
    const result = await uploadSurveyBackground(form);
    setBgUploading(false);
    if (result.error) {
      setBgUploadError(result.error);
      return;
    }
    setBackgroundImageUrl(result.url ?? "");
  }

  return (
    <form action={formAction} className="space-y-6">
      {editing && <input type="hidden" name="id" value={template!.id} />}
      <ErrorBanner error={state.error} />
      <SuccessBanner show={state.success} />

      <FormSection title="Survey details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" htmlFor="title" required>
            <input
              id="title"
              name="title"
              className="input"
              required
              defaultValue={template?.title ?? ""}
            />
          </Field>
          <Field label="Kind" htmlFor="kind" required>
            <select
              id="kind"
              name="kind"
              className="select"
              value={kind}
              onChange={(e) => setKind(e.target.value as SurveyTemplateKind)}
            >
              <option value="pre_event">Pre-event</option>
              <option value="post_event">Post-event</option>
            </select>
          </Field>
        </div>

        <Field
          label="Campaign"
          htmlFor="campaign_id"
          hint="Required before this survey can be published."
        >
          <select
            id="campaign_id"
            name="campaign_id"
            className="select"
            defaultValue={template?.campaign_id ?? ""}
          >
            <option value="">No campaign linked yet</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.reference}
                {c.brand_name ? ` · ${c.brand_name}` : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Description" htmlFor="description">
          <textarea
            id="description"
            name="description"
            className="textarea"
            defaultValue={template?.description ?? ""}
          />
        </Field>

        {kind === "pre_event" && (
          <label className="flex items-start gap-2.5 text-sm font-medium text-[var(--color-ink)]">
            <input
              type="checkbox"
              name="is_public"
              defaultChecked={template?.is_public ?? false}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              Public &amp; link-shareable — anyone with the link can answer, no account
              required.
            </span>
          </label>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Expected participants"
            htmlFor="expected_participants"
            hint="Responses stop at this number plus the buffer, then the survey shows as closed. Leave blank to use the campaign order form's figure (or no limit)."
          >
            <input
              id="expected_participants"
              name="expected_participants"
              type="number"
              min={1}
              className="input"
              defaultValue={template?.expected_participants ?? ""}
            />
          </Field>
          <Field label="Buffer (%)" htmlFor="response_buffer_pct" hint="Extra responses allowed on top — 10–15% is usual.">
            <input
              id="response_buffer_pct"
              name="response_buffer_pct"
              type="number"
              min={0}
              max={100}
              className="input"
              defaultValue={template?.response_buffer_pct ?? 10}
            />
          </Field>
        </div>

        <label className="flex items-start gap-2.5 text-sm font-medium text-[var(--color-ink)]">
          <input
            type="checkbox"
            name="show_intro_gate"
            defaultChecked={template?.show_intro_gate ?? true}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span>
            Show a welcome &amp; terms screen before the questions — off if consent was
            already taken elsewhere (e.g. an internal or post-event survey).
          </span>
        </label>

        <Field
          label="Intro message"
          htmlFor="intro_message"
          hint="Shown above the questions before someone starts — on the public page, in-app, and in preview."
        >
          <textarea
            id="intro_message"
            name="intro_message"
            className="textarea"
            defaultValue={template?.intro_message ?? ""}
          />
        </Field>

        <Field
          label="Thank-you message"
          htmlFor="thank_you_message"
          hint="Shown on the CTA screen after someone submits — on the public page, in-app, and in preview."
        >
          <textarea
            id="thank_you_message"
            name="thank_you_message"
            className="textarea"
            defaultValue={template?.thank_you_message ?? ""}
          />
        </Field>
      </FormSection>

      <FormSection title="Layout & branding">
        <Field
          label="Layout"
          htmlFor="layout_mode"
          hint={
            layoutMode === "single_page"
              ? "All questions on one page — one cover image/video for the whole survey."
              : "One question per screen, Typeform-style, with back/forward — each question can carry its own image/video."
          }
        >
          <select
            id="layout_mode"
            name="layout_mode"
            className="select"
            value={layoutMode}
            onChange={(e) => setLayoutMode(e.target.value as SurveyTemplateLayoutMode)}
          >
            <option value="single_page">Single page — all questions at once</option>
            <option value="stepped">Step by step — one question at a time</option>
          </select>
        </Field>

        {layoutMode === "single_page" && (
          <Field
            label="Cover image or video (optional)"
            htmlFor="cover_media_type"
            hint={`Shown once at the top of the survey and on the welcome slide. Best image size: ${RECOMMENDED_IMAGE_SIZES.cover}. For per-question media instead, switch to step-by-step layout.`}
          >
            <div className="space-y-2">
              <select
                id="cover_media_type"
                className="select"
                value={coverMediaType}
                onChange={(e) => {
                  setCoverMediaType(e.target.value as SurveyMediaType | "");
                  setCoverMediaUrl("");
                  setCoverUploadError(null);
                }}
              >
                <option value="">None</option>
                <option value="image">Image (upload)</option>
                <option value="video">Video (embed link)</option>
              </select>

              {coverMediaType === "image" && (
                <div className="space-y-2">
                  {coverMediaUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverMediaUrl} alt="" className="h-32 w-full rounded-lg object-cover" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={coverUploading}
                    onChange={(e) => handleCoverImageSelect(e.target.files?.[0])}
                    className="text-sm"
                  />
                  {coverUploading && <p className="field-hint">Uploading…</p>}
                  {coverUploadError && (
                    <p className="text-sm text-[var(--color-accent)]">{coverUploadError}</p>
                  )}
                </div>
              )}

              {coverMediaType === "video" && (
                <>
                  <input
                    type="url"
                    className="input"
                    placeholder="https://youtube.com/watch?v=…"
                    value={coverMediaUrl}
                    onChange={(e) => setCoverMediaUrl(e.target.value)}
                  />
                  {coverMediaUrl.trim() && !videoEmbedUrl(coverMediaUrl) && (
                    <p className="text-sm text-[var(--color-accent)]">
                      This link can&apos;t be embedded. Use a YouTube (incl. Shorts), Vimeo, Loom, Instagram
                      Reel or TikTok video link.
                    </p>
                  )}
                  <select
                    aria-label="Video shape"
                    className="select"
                    value={coverVideoFormat}
                    onChange={(e) => setCoverVideoFormat(e.target.value as SurveyVideoFormat | "")}
                  >
                    <option value="">
                      Video shape: detect from link (now{" "}
                      {videoFormatFor(coverMediaUrl, null) === "portrait" ? "reel" : "normal"})
                    </option>
                    <option value="landscape">Normal video (16:9, landscape)</option>
                    <option value="portrait">Reel / short (9:16, portrait)</option>
                  </select>
                </>
              )}
            </div>
          </Field>
        )}
        <input type="hidden" name="cover_media_type" value={coverMediaType} />
        <input type="hidden" name="cover_media_url" value={coverMediaUrl} />
        <input type="hidden" name="cover_video_format" value={coverVideoFormat} />

        {layoutMode === "single_page" && (
          <Field
            label="Background image (optional)"
            htmlFor="background_image_file"
            hint={`A decorative image behind the whole survey — one for the page. Best size: ${RECOMMENDED_IMAGE_SIZES.background}. For a different one per step instead, switch to step-by-step layout.`}
          >
            <div className="space-y-2">
              {backgroundImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={backgroundImageUrl}
                  alt=""
                  className="h-24 w-full rounded-lg object-cover"
                />
              )}
              <input
                id="background_image_file"
                type="file"
                accept="image/*"
                disabled={bgUploading}
                onChange={(e) => handleBackgroundSelect(e.target.files?.[0])}
                className="text-sm"
              />
              {bgUploading && <p className="field-hint">Uploading…</p>}
              {bgUploadError && <p className="text-sm text-[var(--color-accent)]">{bgUploadError}</p>}
              {backgroundImageUrl && (
                <button
                  type="button"
                  className="btn btn-ghost text-xs"
                  onClick={() => setBackgroundImageUrl("")}
                >
                  Remove background image
                </button>
              )}
            </div>
          </Field>
        )}
        <input type="hidden" name="background_image_url" value={backgroundImageUrl} />

        <Field
          label={`Background image visibility — ${backgroundImageOpacity}%`}
          htmlFor="background_image_opacity"
          hint="How strongly a background image shows through behind the cards — this survey's page background, or each step's own background in step-by-step layout. Question cards stay solid on top, so text stays readable."
        >
          <input
            id="background_image_opacity"
            name="background_image_opacity"
            type="range"
            min={0}
            max={100}
            step={5}
            className="range-slider"
            value={backgroundImageOpacity}
            style={{ ["--range-progress" as string]: `${backgroundImageOpacity}%` } as CSSProperties}
            onChange={(e) => setBackgroundImageOpacity(Number(e.target.value))}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Footer company name"
            htmlFor="footer_brand_name"
            hint="Shown at the bottom of every page/step."
          >
            <input
              id="footer_brand_name"
              name="footer_brand_name"
              className="input"
              defaultValue={template?.footer_brand_name ?? ""}
            />
          </Field>
          <Field label="Footer tagline" htmlFor="footer_tagline">
            <input
              id="footer_tagline"
              name="footer_tagline"
              className="input"
              defaultValue={template?.footer_tagline ?? ""}
            />
          </Field>
        </div>

        <Field
          label="Footer logo (optional)"
          htmlFor="footer_logo_file"
          hint={`Shown next to the footer text — both layout modes. Best size: ${RECOMMENDED_IMAGE_SIZES.logo}.`}
        >
          <div className="flex items-center gap-3">
            {footerLogoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={footerLogoUrl} alt="" className="h-10 w-10 rounded object-contain" />
            )}
            <div className="space-y-1">
              <input
                id="footer_logo_file"
                type="file"
                accept="image/*"
                disabled={logoUploading}
                onChange={(e) => handleLogoSelect(e.target.files?.[0])}
                className="text-sm"
              />
              {logoUploading && <p className="field-hint">Uploading…</p>}
              {logoUploadError && (
                <p className="text-sm text-[var(--color-accent)]">{logoUploadError}</p>
              )}
              {footerLogoUrl && (
                <button
                  type="button"
                  className="btn btn-ghost text-xs"
                  onClick={() => setFooterLogoUrl("")}
                >
                  Remove logo
                </button>
              )}
            </div>
          </div>
        </Field>
        <input type="hidden" name="footer_logo_url" value={footerLogoUrl} />

        <Field
          label="Colour theme"
          htmlFor="theme_preset"
          hint="Fills in the button, card and text colours below in one go — adjust any of them afterwards."
        >
          <div id="theme_preset" className="flex flex-wrap gap-2">
            {SURVEY_THEME_PRESETS.map((t) => (
              <button
                key={t.key}
                type="button"
                className="flex items-center gap-2 rounded-full border border-black/15 px-3 py-1.5 text-xs font-semibold hover:border-[var(--color-brand)]"
                style={{ backgroundColor: t.card ?? "#fff", color: t.question ?? "#2c2422" }}
                onClick={() => applyTheme(t.key)}
              >
                <span
                  aria-hidden
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: t.accent ?? DEFAULT_ACCENT }}
                />
                {t.label}
              </button>
            ))}
          </div>
        </Field>

        <Field
          label="Button colour (optional)"
          htmlFor="accent_color"
          hint="Applied to the Next / Submit button, the progress bar and selected answers. Leave blank to use the platform default."
        >
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Pick a button colour"
              value={accentColor || DEFAULT_ACCENT}
              onChange={(e) => setAccentColor(e.target.value)}
              className="h-9 w-12 shrink-0 cursor-pointer rounded border border-black/10 p-0.5"
            />
            <input
              id="accent_color"
              name="accent_color"
              type="text"
              className="input"
              placeholder={DEFAULT_ACCENT}
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
            />
            {accentColor && (
              <button type="button" className="btn btn-ghost shrink-0 text-xs" onClick={() => setAccentColor("")}>
                Reset
              </button>
            )}
          </div>
        </Field>

        <Field
          label="Text size"
          htmlFor="font_scale"
          hint="Scales every question, option and label together — button size is unaffected."
        >
          <select
            id="font_scale"
            name="font_scale"
            className="select"
            value={fontScale}
            onChange={(e) => setFontScale(e.target.value)}
          >
            <option value="0.9">Compact</option>
            <option value="1">Default</option>
            <option value="1.15">Large</option>
            <option value="1.3">Extra large</option>
            <option value="1.5">Maximum</option>
          </select>
        </Field>

        <Field
          label="Question size"
          htmlFor="question_font_size"
          hint="How big each question's text is. A question can override this for itself in the builder."
        >
          <select
            id="question_font_size"
            name="question_font_size"
            className="select"
            value={questionFontSize}
            onChange={(e) => setQuestionFontSize(e.target.value as SurveyQuestionFontSize)}
          >
            {QUESTION_FONT_SIZE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Font"
          htmlFor="font_family"
          hint="Applied to every question, option and label. A question can override this for itself in the builder."
        >
          <select
            id="font_family"
            name="font_family"
            className="select"
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
          >
            {SURVEY_FONT_OPTIONS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Question text colour (optional)"
          htmlFor="question_text_color"
          hint="Applied to question prompts and field labels. Leave blank to use the platform default."
        >
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Pick a question text colour"
              value={questionTextColor || "#2c2422"}
              onChange={(e) => setQuestionTextColor(e.target.value)}
              className="h-9 w-12 shrink-0 cursor-pointer rounded border border-black/10 p-0.5"
            />
            <input
              id="question_text_color"
              name="question_text_color"
              type="text"
              className="input"
              placeholder="#2c2422"
              value={questionTextColor}
              onChange={(e) => setQuestionTextColor(e.target.value)}
            />
            {questionTextColor && (
              <button
                type="button"
                className="btn btn-ghost shrink-0 text-xs"
                onClick={() => setQuestionTextColor("")}
              >
                Reset
              </button>
            )}
          </div>
        </Field>

        <Field
          label="Body text colour (optional)"
          htmlFor="body_text_color"
          hint="Applied to options, help text, intro copy and the footer. Leave blank to use the platform default."
        >
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Pick a body text colour"
              value={bodyTextColor || "#6f6360"}
              onChange={(e) => setBodyTextColor(e.target.value)}
              className="h-9 w-12 shrink-0 cursor-pointer rounded border border-black/10 p-0.5"
            />
            <input
              id="body_text_color"
              name="body_text_color"
              type="text"
              className="input"
              placeholder="#6f6360"
              value={bodyTextColor}
              onChange={(e) => setBodyTextColor(e.target.value)}
            />
            {bodyTextColor && (
              <button
                type="button"
                className="btn btn-ghost shrink-0 text-xs"
                onClick={() => setBodyTextColor("")}
              >
                Reset
              </button>
            )}
          </div>
        </Field>

        <Field
          label="Card colour (optional)"
          htmlFor="card_background_color"
          hint="Fill for the question, welcome and thank-you cards. With a dark colour, set light text colours above (or pick the Midnight theme)."
        >
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Pick a card colour"
              value={cardBackgroundColor || "#ffffff"}
              onChange={(e) => setCardBackgroundColor(e.target.value)}
              className="h-9 w-12 shrink-0 cursor-pointer rounded border border-black/10 p-0.5"
            />
            <input
              id="card_background_color"
              name="card_background_color"
              type="text"
              className="input"
              placeholder="#ffffff"
              value={cardBackgroundColor}
              onChange={(e) => setCardBackgroundColor(e.target.value)}
            />
            {cardBackgroundColor && (
              <button
                type="button"
                className="btn btn-ghost shrink-0 text-xs"
                onClick={() => setCardBackgroundColor("")}
              >
                Reset
              </button>
            )}
          </div>
        </Field>
      </FormSection>

      <div className="flex justify-end">
        <Submit label={editing ? "Save details" : "Create survey"} />
      </div>
    </form>
  );
}
