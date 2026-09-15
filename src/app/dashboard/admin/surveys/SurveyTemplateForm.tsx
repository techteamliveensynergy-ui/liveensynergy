"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/OnboardingShell";
import { ErrorBanner, SuccessBanner } from "@/components/onboarding/parts";
import type { SurveyMediaType, SurveyTemplate, SurveyTemplateKind, SurveyTemplateLayoutMode } from "@/lib/types";
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
  const [footerLogoUrl, setFooterLogoUrl] = useState(template?.footer_logo_url ?? "");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState(template?.background_image_url ?? "");
  const [bgUploading, setBgUploading] = useState(false);
  const [bgUploadError, setBgUploadError] = useState<string | null>(null);

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
            hint="Shown once at the top of the survey. For per-question media instead, switch to step-by-step layout."
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
                <input
                  type="url"
                  className="input"
                  placeholder="https://youtube.com/watch?v=…"
                  value={coverMediaUrl}
                  onChange={(e) => setCoverMediaUrl(e.target.value)}
                />
              )}
            </div>
          </Field>
        )}
        <input type="hidden" name="cover_media_type" value={coverMediaType} />
        <input type="hidden" name="cover_media_url" value={coverMediaUrl} />

        {layoutMode === "single_page" && (
          <Field
            label="Background image (optional)"
            htmlFor="background_image_file"
            hint="A decorative image behind the whole survey — one for the page. For a different one per step instead, switch to step-by-step layout."
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
          hint="Shown next to the footer text — both layout modes."
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
          label="Button colour (optional)"
          htmlFor="accent_color"
          hint="Applied to the Next / Submit survey button. Leave blank to use the platform default."
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
      </FormSection>

      <div className="flex justify-end">
        <Submit label={editing ? "Save details" : "Create survey"} />
      </div>
    </form>
  );
}
