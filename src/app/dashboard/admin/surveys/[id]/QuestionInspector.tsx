"use client";

import { useState } from "react";
import { Field } from "@/components/ui/Field";
import {
  HIDDEN_FIELD_SOURCES,
  OTHER_CAPABLE_TYPES,
  questionSpec,
  type SurveyQuestionDraft,
} from "@/lib/surveys";
import { SURVEY_FONT_OPTIONS } from "@/lib/survey-fonts";
import {
  QUESTION_FONT_SIZE_OPTIONS,
  RECOMMENDED_IMAGE_SIZES,
  videoEmbedUrl,
  videoFormatFor,
} from "@/lib/survey-media";
import type { SurveyMediaPosition, SurveyQuestionConfig, SurveyTemplateLayoutMode } from "@/lib/types";
import { OptionListEditor } from "./OptionListEditor";
import { uploadQuestionMedia } from "../actions";
import { uploadImageFile } from "@/lib/image-upload";

const NUMERIC_CONFIG_KEYS = new Set([
  "min",
  "max",
  "step",
  "min_select",
  "max_select",
  "max_length",
]);

export function QuestionInspector({
  question,
  editable,
  layoutMode,
  onChange,
  onAddGroupRow,
}: {
  question: SurveyQuestionDraft | null;
  editable: boolean;
  layoutMode: SurveyTemplateLayoutMode;
  onChange: (patch: Partial<SurveyQuestionDraft>) => void;
  /** Adds another item to this question's rating group (FB-00028). */
  onAddGroupRow?: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (!question) {
    return (
      <div className="card p-5 text-sm text-[var(--color-ink-soft)]">
        Select a question to edit it, or add one from the palette.
      </div>
    );
  }

  const spec = questionSpec(question.type);

  // config.background_image_url is the older, separately-uploaded "step
  // background" field the unified 5-option placement control below
  // replaced (23 Sep client meeting — two separate image controls read as
  // "the image always renders in the background no matter which position
  // I pick", since position only ever touched media_url). Any question that
  // already had one set (and nothing in media_url) is treated here as if it
  // had picked media_position "background" for the same image, so it still
  // shows up — and the moment the admin touches type/position/upload again,
  // it migrates onto media_url and the legacy field is dropped.
  const legacyBackground = !question.config.media_url && Boolean(question.config.background_image_url);
  const mediaType: "" | "image" | "video" = legacyBackground
    ? "image"
    : question.config.media_type ?? "";
  const mediaUrl = legacyBackground ? question.config.background_image_url : question.config.media_url;
  const mediaPosition: SurveyMediaPosition = legacyBackground
    ? "background"
    : question.config.media_position ?? "top";

  async function handleImageSelect(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const result = await uploadImageFile(file, uploadQuestionMedia);
    setUploading(false);
    if (result.error) {
      setUploadError(result.error);
      return;
    }
    const next = { ...question!.config } as Record<string, unknown>;
    delete next.background_image_url;
    next.media_type = "image";
    next.media_url = result.url;
    next.media_position = mediaPosition;
    onChange({ config: next as SurveyQuestionConfig });
  }

  function setConfig(name: string, value: string) {
    const next = { ...question!.config } as Record<string, unknown>;
    if (value === "") {
      delete next[name];
    } else if (NUMERIC_CONFIG_KEYS.has(name)) {
      const n = Number(value);
      if (Number.isFinite(n)) next[name] = n;
      else delete next[name];
    } else {
      next[name] = value;
    }
    onChange({ config: next as SurveyQuestionConfig });
  }

  return (
    <div className="card space-y-4 p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink-soft)]">
        <span aria-hidden>{spec.icon}</span>
        <span>{spec.label}</span>
      </div>

      {question.type === "scale" && question.config.group_id && (
        <div className="space-y-2 rounded-lg border border-[var(--color-brand)]/40 bg-[var(--color-brand)]/5 p-3">
          <p className="text-xs font-semibold text-[var(--color-ink-soft)]">
            📊 Rating group — this is one item. The question text, help text, scale and look below
            apply to every item in the group; the item label and &ldquo;Required&rdquo; are per item.
          </p>
          <Field label="Group question" htmlFor="q-group-prompt" required>
            <input
              id="q-group-prompt"
              className="input"
              disabled={!editable}
              value={question.config.group_prompt ?? ""}
              onChange={(e) => setConfig("group_prompt", e.target.value)}
            />
          </Field>
          {editable && onAddGroupRow && (
            <button type="button" className="btn btn-ghost text-sm" onClick={onAddGroupRow}>
              + Add another item
            </button>
          )}
          <p className="field-hint">
            Keep the items next to each other on the canvas — they show as one card only while they
            sit together. Remove an item with its ✕ on the canvas.
          </p>
        </div>
      )}

      {spec.hasPrompt && (
        <Field
          label={question.type === "scale" && question.config.group_id ? "Item label" : "Prompt"}
          htmlFor="q-prompt"
          required
        >
          <textarea
            id="q-prompt"
            className="textarea"
            disabled={!editable}
            value={question.prompt}
            onChange={(e) => onChange({ prompt: e.target.value })}
          />
        </Field>
      )}

      <Field label="Help text" htmlFor="q-help">
        <input
          id="q-help"
          className="input"
          disabled={!editable}
          value={question.help_text}
          onChange={(e) => onChange({ help_text: e.target.value })}
        />
      </Field>

      {question.type !== "hidden_field" && (
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            disabled={!editable}
            checked={question.required}
            onChange={(e) => onChange({ required: e.target.checked })}
          />
          Required
        </label>
      )}

      {question.type !== "hidden_field" && (
        <div className="space-y-3 rounded-lg border border-black/10 p-3">
          <p className="text-xs font-semibold text-[var(--color-ink-soft)]">
            Font &amp; colour (optional) — overrides the survey&apos;s own defaults for just this
            question.
          </p>

          <Field label="Question size" htmlFor="q-question-size">
            <select
              id="q-question-size"
              className="select"
              disabled={!editable}
              value={question.config.question_size ?? ""}
              onChange={(e) => setConfig("question_size", e.target.value)}
            >
              <option value="">Survey default</option>
              {QUESTION_FONT_SIZE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label.replace(" (default)", "")}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Font" htmlFor="q-font-family">
            <select
              id="q-font-family"
              className="select"
              disabled={!editable}
              value={question.config.font_family ?? ""}
              onChange={(e) => setConfig("font_family", e.target.value)}
            >
              <option value="">Survey default</option>
              {SURVEY_FONT_OPTIONS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Question text colour" htmlFor="q-question-text-color">
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Pick a question text colour"
                disabled={!editable}
                value={question.config.question_text_color || "#2c2422"}
                onChange={(e) => setConfig("question_text_color", e.target.value)}
                className="h-9 w-12 shrink-0 cursor-pointer rounded border border-black/10 p-0.5"
              />
              <input
                id="q-question-text-color"
                className="input"
                disabled={!editable}
                placeholder="Survey default"
                value={question.config.question_text_color ?? ""}
                onChange={(e) => setConfig("question_text_color", e.target.value)}
              />
              {question.config.question_text_color && (
                <button
                  type="button"
                  className="btn btn-ghost shrink-0 text-xs"
                  disabled={!editable}
                  onClick={() => setConfig("question_text_color", "")}
                >
                  Reset
                </button>
              )}
            </div>
          </Field>

          <Field label="Body text colour" htmlFor="q-body-text-color">
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Pick a body text colour"
                disabled={!editable}
                value={question.config.body_text_color || "#6f6360"}
                onChange={(e) => setConfig("body_text_color", e.target.value)}
                className="h-9 w-12 shrink-0 cursor-pointer rounded border border-black/10 p-0.5"
              />
              <input
                id="q-body-text-color"
                className="input"
                disabled={!editable}
                placeholder="Survey default"
                value={question.config.body_text_color ?? ""}
                onChange={(e) => setConfig("body_text_color", e.target.value)}
              />
              {question.config.body_text_color && (
                <button
                  type="button"
                  className="btn btn-ghost shrink-0 text-xs"
                  disabled={!editable}
                  onClick={() => setConfig("body_text_color", "")}
                >
                  Reset
                </button>
              )}
            </div>
          </Field>

          <Field label="Card colour" htmlFor="q-card-background-color">
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Pick a card colour"
                disabled={!editable}
                value={question.config.card_background_color || "#ffffff"}
                onChange={(e) => setConfig("card_background_color", e.target.value)}
                className="h-9 w-12 shrink-0 cursor-pointer rounded border border-black/10 p-0.5"
              />
              <input
                id="q-card-background-color"
                className="input"
                disabled={!editable}
                placeholder="Survey default"
                value={question.config.card_background_color ?? ""}
                onChange={(e) => setConfig("card_background_color", e.target.value)}
              />
              {question.config.card_background_color && (
                <button
                  type="button"
                  className="btn btn-ghost shrink-0 text-xs"
                  disabled={!editable}
                  onClick={() => setConfig("card_background_color", "")}
                >
                  Reset
                </button>
              )}
            </div>
          </Field>
        </div>
      )}

      {question.type !== "hidden_field" && layoutMode === "single_page" && (
        <p className="field-hint">
          Per-question media is only available in step-by-step layout — this survey shows one
          cover image/video for the whole page instead (set it under "Layout &amp; branding"
          above).
        </p>
      )}

      {question.type !== "hidden_field" && layoutMode === "stepped" && (
        <Field label="Image / video (optional)" htmlFor="q-media-type">
          <div className="space-y-2">
            <select
              id="q-media-type"
              className="select"
              disabled={!editable}
              value={mediaType}
              onChange={(e) => {
                const media_type = e.target.value as "" | "image" | "video";
                const next = { ...question!.config } as Record<string, unknown>;
                delete next.background_image_url;
                if (!media_type) {
                  delete next.media_type;
                  delete next.media_url;
                  delete next.media_position;
                } else {
                  next.media_type = media_type;
                  // A video can't be a CSS background-image — drop that
                  // choice rather than carry forward a position it can't
                  // render.
                  if (media_type === "video" && next.media_position === "background") {
                    next.media_position = "top";
                  }
                }
                onChange({ config: next as SurveyQuestionConfig });
              }}
            >
              <option value="">None</option>
              <option value="image">Image (upload)</option>
              <option value="video">Video (embed link)</option>
            </select>

            {mediaType === "image" && (
              <div className="space-y-2">
                {mediaUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl} alt="" className="h-24 w-full rounded-lg object-cover" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  disabled={!editable || uploading}
                  onChange={(e) => handleImageSelect(e.target.files?.[0])}
                  className="text-sm"
                />
                {uploading && <p className="field-hint">Uploading…</p>}
                {uploadError && <p className="text-sm text-[var(--color-accent)]">{uploadError}</p>}
              </div>
            )}

            {mediaType === "video" && (
              <div className="space-y-2">
                <input
                  type="url"
                  className="input"
                  disabled={!editable}
                  placeholder="https://youtube.com/watch?v=…"
                  value={mediaUrl ?? ""}
                  onChange={(e) => onChange({ config: { ...question!.config, media_url: e.target.value } })}
                />
                {mediaUrl?.trim() && !videoEmbedUrl(mediaUrl) && (
                  <p className="text-sm text-[var(--color-accent)]">
                    This link can&apos;t be embedded — respondents won&apos;t see a video. Use a YouTube (incl.
                    Shorts), Vimeo, Loom, Instagram Reel or TikTok video link.
                  </p>
                )}
                <Field label="Video shape" htmlFor="q-video-format">
                  <select
                    id="q-video-format"
                    className="select"
                    disabled={!editable}
                    value={question.config.video_format ?? ""}
                    onChange={(e) => setConfig("video_format", e.target.value)}
                  >
                    <option value="">
                      Detect from link (now {videoFormatFor(mediaUrl, null) === "portrait" ? "reel" : "normal"})
                    </option>
                    <option value="landscape">Normal video (16:9, landscape)</option>
                    <option value="portrait">Reel / short (9:16, portrait)</option>
                  </select>
                </Field>
              </div>
            )}

            {mediaType && (
              <Field label="Placement" htmlFor="q-media-position">
                <select
                  id="q-media-position"
                  className="select"
                  disabled={!editable}
                  value={mediaPosition}
                  onChange={(e) => {
                    const next = { ...question!.config } as Record<string, unknown>;
                    delete next.background_image_url;
                    next.media_type = mediaType;
                    next.media_url = mediaUrl;
                    next.media_position = e.target.value as SurveyMediaPosition;
                    onChange({ config: next as SurveyQuestionConfig });
                  }}
                >
                  <option value="top">Above the question</option>
                  <option value="bottom">Below the question</option>
                  <option value="left">Left of the question</option>
                  <option value="right">Right of the question</option>
                  {mediaType === "image" && (
                    <option value="background">Background (behind the question)</option>
                  )}
                </select>
              </Field>
            )}

            {mediaType === "image" && mediaPosition !== "background" && (
              <Field
                label="Image fit"
                htmlFor="q-media-fit"
                hint={`Best size here: ${
                  mediaPosition === "left" || mediaPosition === "right"
                    ? RECOMMENDED_IMAGE_SIZES.side
                    : RECOMMENDED_IMAGE_SIZES.topBottom
                } — an image that shape fills the space exactly with either setting.`}
              >
                <select
                  id="q-media-fit"
                  className="select"
                  disabled={!editable}
                  value={question.config.media_fit ?? "cover"}
                  onChange={(e) => setConfig("media_fit", e.target.value === "cover" ? "" : e.target.value)}
                >
                  <option value="cover">Fill the space (edges may be cropped)</option>
                  <option value="contain">Show the whole image (may leave bands)</option>
                </select>
              </Field>
            )}
            {mediaType === "image" && mediaPosition === "background" && (
              <p className="field-hint">
                Best size for a background: {RECOMMENDED_IMAGE_SIZES.background}. How strongly it shows is set
                by &ldquo;Background image visibility&rdquo; in Layout &amp; branding.
              </p>
            )}
          </div>
        </Field>
      )}

      {spec.hasOptions && (
        <OptionListEditor
          options={question.options}
          editable={editable}
          onChange={(options) => onChange({ options })}
        />
      )}

      {/* FB-00029 — not on the Likert preset, whose five faces are fixed. */}
      {OTHER_CAPABLE_TYPES.includes(question.type) && question.config.display_style !== "likert" && (
        <div className="space-y-2 rounded-lg border border-black/10 p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              disabled={!editable}
              checked={question.config.allow_other === true}
              onChange={(e) => {
                const next = { ...question.config } as Record<string, unknown>;
                if (e.target.checked) next.allow_other = true;
                else {
                  delete next.allow_other;
                  delete next.other_label;
                }
                onChange({ config: next as SurveyQuestionConfig });
              }}
            />
            Add an &ldquo;Other — please specify&rdquo; option
          </label>
          {question.config.allow_other && (
            <Field
              label="Its label"
              htmlFor="q-other-label"
              hint="Shown as the last option; picking it opens a text box the respondent must fill in. You see what they typed in the results and the export — brands see only how many chose it."
            >
              <input
                id="q-other-label"
                className="input"
                disabled={!editable}
                placeholder="Other"
                value={question.config.other_label ?? ""}
                onChange={(e) => setConfig("other_label", e.target.value)}
              />
            </Field>
          )}
        </div>
      )}

      {spec.configFields.map((field) => {
        const selectOptions =
          field.name === "profile_field"
            ? HIDDEN_FIELD_SOURCES
            : (field.options ?? []).map((o) => ({ value: o, label: o }));
        const rawValue = (question.config as Record<string, unknown>)[field.name];

        return (
          <Field key={field.name} label={field.label} htmlFor={`q-${field.name}`} hint={field.hint}>
            {field.type === "select" ? (
              <select
                id={`q-${field.name}`}
                className="select"
                disabled={!editable}
                value={String(rawValue ?? "")}
                onChange={(e) => setConfig(field.name, e.target.value)}
              >
                <option value="">Choose…</option>
                {selectOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`q-${field.name}`}
                type={NUMERIC_CONFIG_KEYS.has(field.name) ? "number" : "text"}
                className="input"
                disabled={!editable}
                value={String(rawValue ?? "")}
                onChange={(e) => setConfig(field.name, e.target.value)}
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}
