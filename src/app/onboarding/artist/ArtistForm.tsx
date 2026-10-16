"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/Field";
import { UrlInput, URL_HINT } from "@/components/ui/UrlInput";
import { VideoLinksField } from "@/components/ui/VideoLinksField";
import { FormSection } from "@/components/OnboardingShell";
import {
  ErrorBanner,
  OnboardingSubmit,
  SocialLinksGrid,
  SuccessBanner,
} from "@/components/onboarding/parts";
import { FileDrop } from "@/components/ui/FileDrop";
import { AVATAR_HINT, BANNER_HINT, MAX_BIO_CHARS } from "@/lib/upload-limits";
import { ARTIST_CATEGORIES, ARTIST_TYPES } from "@/lib/constants";
import type { Artist } from "@/lib/types";
import { saveArtist, type OnboardingState } from "../actions";

type Mode = "onboarding" | "profile";

export function ArtistForm({
  mode = "onboarding",
  defaults,
}: {
  mode?: Mode;
  defaults?: Partial<Artist>;
}) {
  const [state, formAction] = useActionState<OnboardingState, FormData>(
    saveArtist,
    {},
  );
  const d = defaults ?? {};
  const list = (v?: string[] | null) => (v ?? []).join(", ");

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="mode" value={mode} />
      <ErrorBanner error={state.error} />
      <SuccessBanner show={state.success} />

      <FormSection
        title="Account info & profile"
        description="This form covers both artists and event organisers — the two are one account type on Live·En·Synergy. Give your act's, company's or festival's name wherever it asks for an artist name."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Artist / organisation name"
            htmlFor="artist_name"
            required
          >
            <input
              id="artist_name"
              name="artist_name"
              className="input"
              required
              defaultValue={d.artist_name ?? ""}
            />
          </Field>
          <Field label="Professional / stage name" htmlFor="stage_name">
            <input
              id="stage_name"
              name="stage_name"
              className="input"
              defaultValue={d.stage_name ?? ""}
            />
          </Field>
        </div>

        <fieldset>
          <legend className="field-label">
            Which applies to you?{" "}
            {mode === "onboarding" && <span className="text-[var(--color-brand)]">*</span>}
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {ARTIST_TYPES.map((t) => (
              <label
                key={t.value}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-sm has-[:checked]:border-[var(--color-brand)] has-[:checked]:bg-[var(--color-brand)]/10"
              >
                <input
                  type="radio"
                  name="artist_type"
                  value={t.value}
                  required={mode === "onboarding"}
                  defaultChecked={d.artist_type === t.value}
                  className="h-4 w-4"
                />
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>

        <Field
          label="Bio"
          htmlFor="bio"
          hint={`Up to 500 words (${MAX_BIO_CHARS.toLocaleString("en-GB")} characters).`}
        >
          <textarea
            id="bio"
            name="bio"
            className="textarea"
            rows={5}
            maxLength={MAX_BIO_CHARS}
            defaultValue={d.bio ?? ""}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Profile image" htmlFor="profile_image">
            <FileDrop
              name="profile_image"
              hint={AVATAR_HINT}
              currentUrl={d.profile_image_url ?? null}
              label="Drag your profile photo here"
            />
          </Field>
          <Field label="Banner image" htmlFor="banner">
            <FileDrop
              name="banner"
              hint={BANNER_HINT}
              currentUrl={d.banner_url ?? null}
              label="Drag your banner here"
            />
          </Field>
        </div>

        <Field
          label="Showcase video links"
          htmlFor="video_url"
          hint="Add as many as you like. YouTube and Vimeo links play right on your profile; anything else shows as a link."
        >
          <VideoLinksField defaultValues={d.video_urls ?? (d.video_url ? [d.video_url] : null)} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="category">
            <select
              id="category"
              name="category"
              className="select"
              defaultValue={d.category ?? ""}
            >
              <option value="" disabled>
                Select a category
              </option>
              {ARTIST_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="If 'Other', please specify" htmlFor="category_other">
            <input
              id="category_other"
              name="category_other"
              className="input"
              defaultValue={d.category_other ?? ""}
            />
          </Field>
        </div>

        <Field label="Website" htmlFor="website_url" hint={URL_HINT}>
          <UrlInput
            id="website_url"
            name="website_url"
            label="Your website link"
            defaultValue={d.website_url ?? ""}
          />
        </Field>
      </FormSection>

      <FormSection title="Social media links">
        <SocialLinksGrid defaults={d.social_links} />
      </FormSection>

      <FormSection
        title="Additional information"
        description="Helps our team match you with the right sponsors — not shown publicly."
        private
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Location" htmlFor="location" required>
            <input
              id="location"
              name="location"
              className="input"
              placeholder="City, Country"
              defaultValue={d.location ?? ""}
            />
          </Field>
          <Field label="Contact person's name" htmlFor="contact_name" required>
            <input
              id="contact_name"
              name="contact_name"
              className="input"
              defaultValue={d.contact_name ?? ""}
            />
          </Field>
          <Field label="Contact person's email" htmlFor="contact_email" required>
            <input
              id="contact_email"
              name="contact_email"
              type="email"
              className="input"
              defaultValue={d.contact_email ?? ""}
            />
          </Field>
          <Field label="Contact person's phone" htmlFor="contact_phone" required>
            <input
              id="contact_phone"
              name="contact_phone"
              className="input"
              defaultValue={d.contact_phone ?? ""}
            />
          </Field>
        </div>
        <Field label="Address" htmlFor="address">
          <textarea
            id="address"
            name="address"
            className="textarea"
            defaultValue={d.address ?? ""}
          />
        </Field>
        <Field
          label="Keywords that describe your work"
          htmlFor="art_keywords"
          hint="Comma separated — e.g. rock, pop, melodious, raw energy"
        >
          <input
            id="art_keywords"
            name="art_keywords"
            className="input"
            defaultValue={list(d.art_keywords)}
          />
        </Field>
        <Field label="Your mission & vision" htmlFor="mission_vision">
          <textarea
            id="mission_vision"
            name="mission_vision"
            className="textarea"
            defaultValue={d.mission_vision ?? ""}
          />
        </Field>
      </FormSection>


      <OnboardingSubmit
        label={mode === "profile" ? "Save changes" : "Finish & go to dashboard"}
        confirmSave={mode === "profile"}
      />
    </form>
  );
}
