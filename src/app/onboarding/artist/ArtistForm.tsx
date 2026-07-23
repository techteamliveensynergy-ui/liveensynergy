"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/OnboardingShell";
import {
  ErrorBanner,
  OnboardingSubmit,
  SocialLinksGrid,
  SuccessBanner,
} from "@/components/onboarding/parts";
import { ARTIST_CATEGORIES } from "@/lib/constants";
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

      <FormSection title="Artist account info & profile">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Artist name" htmlFor="artist_name" required>
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

        <Field label="Artist bio" htmlFor="bio" hint="Up to 500 words.">
          <textarea
            id="bio"
            name="bio"
            className="textarea"
            defaultValue={d.bio ?? ""}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Artist category" htmlFor="category">
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

        <Field label="Website" htmlFor="website_url">
          <input
            id="website_url"
            name="website_url"
            type="url"
            className="input"
            placeholder="https://…"
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
          <Field label="Date of birth" htmlFor="date_of_birth" required>
            <input
              id="date_of_birth"
              name="date_of_birth"
              type="date"
              className="input"
              defaultValue={d.date_of_birth ?? ""}
            />
          </Field>
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
          label="Keywords that describe your art"
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

      <FormSection
        title="Sponsor value details"
        description="How can you fulfil a sponsor partner's branding duties? (e.g. social posts, collaborations, mentions, logos on promo material, roll-up banners, merch table). Up to 500 words."
      >
        <Field label="What you can offer sponsors" htmlFor="sponsor_value_details">
          <textarea
            id="sponsor_value_details"
            name="sponsor_value_details"
            className="textarea"
            defaultValue={d.sponsor_value_details ?? ""}
          />
        </Field>
      </FormSection>

      <OnboardingSubmit
        label={mode === "profile" ? "Save changes" : "Finish & go to dashboard"}
      />
    </form>
  );
}
