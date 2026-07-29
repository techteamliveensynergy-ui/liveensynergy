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
import { EVENT_CATEGORIES } from "@/lib/constants";
import type { EventOrganiser } from "@/lib/types";
import { saveEvent, type OnboardingState } from "../actions";

type Mode = "onboarding" | "profile";

export function EventForm({
  mode = "onboarding",
  defaults,
}: {
  mode?: Mode;
  defaults?: Partial<EventOrganiser>;
}) {
  const [state, formAction] = useActionState<OnboardingState, FormData>(
    saveEvent,
    {},
  );
  const d = defaults ?? {};
  const list = (v?: string[] | null) => (v ?? []).join(", ");

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="mode" value={mode} />
      <ErrorBanner error={state.error} />
      <SuccessBanner show={state.success} />

      <FormSection title="Event account info & profile">
        <Field label="Event name" htmlFor="event_name" required>
          <input
            id="event_name"
            name="event_name"
            className="input"
            required
            defaultValue={d.event_name ?? ""}
          />
        </Field>
        <Field
          label="Event description"
          htmlFor="description"
          hint="Event details, venue, dates, location, etc."
        >
          <textarea
            id="description"
            name="description"
            className="textarea"
            rows={5}
            maxLength={MAX_BIO_CHARS}
            defaultValue={d.description ?? ""}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Profile image" htmlFor="profile_image">
            <FileDrop
              name="profile_image"
              hint={AVATAR_HINT}
              currentUrl={d.profile_image_url ?? null}
              label="Drag your profile image here"
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
          <Field label="Event category" htmlFor="category">
            <select
              id="category"
              name="category"
              className="select"
              defaultValue={d.category ?? ""}
            >
              <option value="" disabled>
                Select a category
              </option>
              {EVENT_CATEGORIES.map((c) => (
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
        <SocialLinksGrid
          fields={["instagram", "facebook", "youtube", "tiktok", "linkedin", "x"]}
          defaults={d.social_links}
        />
      </FormSection>

      <FormSection
        title="Additional information"
        description="Helps our team match you with the right sponsors — not shown publicly."
        private
      >
        <Field
          label="Existing partners / sponsors"
          htmlFor="existing_partners"
          hint="Mention n/a if none."
        >
          <input
            id="existing_partners"
            name="existing_partners"
            className="input"
            defaultValue={d.existing_partners ?? ""}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
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
        <Field label="Company address" htmlFor="company_address">
          <textarea
            id="company_address"
            name="company_address"
            className="textarea"
            defaultValue={d.company_address ?? ""}
          />
        </Field>
        <Field
          label="Keywords that describe your event"
          htmlFor="keywords"
          hint="Comma separated — e.g. sustainable, youth trendy, music lovers"
        >
          <input
            id="keywords"
            name="keywords"
            className="input"
            defaultValue={list(d.keywords)}
          />
        </Field>
        <Field label="Company / event mission & vision" htmlFor="mission_vision">
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
        description="How can you fulfil a sponsor partner's branding duties? (e.g. social posts, mentions, logos on promo material, onsite roll-up banners, merch stations). Up to 500 words."
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
