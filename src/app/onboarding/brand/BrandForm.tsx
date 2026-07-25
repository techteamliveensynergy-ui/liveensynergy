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
import { FileDrop } from "@/components/ui/FileDrop";
import { AVATAR_HINT, BANNER_HINT, MAX_BIO_CHARS } from "@/lib/upload-limits";
import { BRAND_CATEGORIES } from "@/lib/constants";
import type { Brand } from "@/lib/types";
import { saveBrand, type OnboardingState } from "../actions";

type Mode = "onboarding" | "profile";

export function BrandForm({
  mode = "onboarding",
  defaults,
}: {
  mode?: Mode;
  defaults?: Partial<Brand>;
}) {
  const [state, formAction] = useActionState<OnboardingState, FormData>(
    saveBrand,
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
        description="This information helps us match you with the right artists and events."
      >
        <Field label="Brand name" htmlFor="brand_name" required>
          <input
            id="brand_name"
            name="brand_name"
            className="input"
            required
            placeholder="e.g. Fire Away"
            defaultValue={d.brand_name ?? ""}
          />
        </Field>

        <Field
          label="Brand profile description"
          htmlFor="description"
          hint={`Up to ${MAX_BIO_CHARS.toLocaleString("en-GB")} characters.`}
        >
          <textarea
            id="description"
            name="description"
            className="textarea"
            rows={5}
            maxLength={MAX_BIO_CHARS}
            placeholder="Tell us about your brand…"
            defaultValue={d.description ?? ""}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Brand logo" htmlFor="profile_image">
            <FileDrop
              name="profile_image"
              hint={AVATAR_HINT}
              currentUrl={d.logo_url ?? null}
              label="Drag your logo here"
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
          label="Brand video link"
          htmlFor="video_url"
          hint="A YouTube or Vimeo link showing your brand or a past activation."
        >
          <input
            id="video_url"
            name="video_url"
            type="url"
            className="input"
            placeholder="https://youtube.com/watch?v=…"
            defaultValue={d.video_url ?? ""}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Product category" htmlFor="product_category">
            <select
              id="product_category"
              name="product_category"
              className="select"
              defaultValue={d.product_category ?? ""}
            >
              <option value="" disabled>
                Select a category
              </option>
              {BRAND_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="If 'Other', please specify"
            htmlFor="product_category_other"
          >
            <input
              id="product_category_other"
              name="product_category_other"
              className="input"
              defaultValue={d.product_category_other ?? ""}
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
        <SocialLinksGrid
          fields={["instagram", "facebook", "youtube", "tiktok", "linkedin", "x"]}
          defaults={d.social_links}
        />
      </FormSection>

      <FormSection
        title="Additional information"
        description="Feeds our matching engine — only visible to you and the Live·En·Synergy team."
        private
      >
        <Field label="Brand mission & vision" htmlFor="mission_vision">
          <textarea
            id="mission_vision"
            name="mission_vision"
            className="textarea"
            defaultValue={d.mission_vision ?? ""}
          />
        </Field>
        <Field
          label="Target audience keywords"
          htmlFor="target_audience_keywords"
          hint="Comma separated — e.g. Urban 18–34, music & culture enthusiasts, foodie"
        >
          <input
            id="target_audience_keywords"
            name="target_audience_keywords"
            className="input"
            defaultValue={list(d.target_audience_keywords)}
          />
        </Field>
        <Field
          label="Keywords that define your brand"
          htmlFor="brand_keywords"
          hint="Comma separated — e.g. street vibe, fast paced, simplified solution"
        >
          <input
            id="brand_keywords"
            name="brand_keywords"
            className="input"
            defaultValue={list(d.brand_keywords)}
          />
        </Field>
        <Field
          label="Genres of artists / events you usually partner with"
          htmlFor="preferred_genres"
        >
          <input
            id="preferred_genres"
            name="preferred_genres"
            className="input"
            defaultValue={d.preferred_genres ?? ""}
          />
        </Field>
        <Field
          label="Preferred event sponsorship location"
          htmlFor="preferred_locations"
        >
          <input
            id="preferred_locations"
            name="preferred_locations"
            className="input"
            placeholder="City, Country"
            defaultValue={d.preferred_locations ?? ""}
          />
        </Field>
      </FormSection>

      <FormSection title="Sponsorship manager & contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Manager name" htmlFor="manager_name">
            <input
              id="manager_name"
              name="manager_name"
              className="input"
              defaultValue={d.manager_name ?? ""}
            />
          </Field>
          <Field label="Manager email" htmlFor="manager_email">
            <input
              id="manager_email"
              name="manager_email"
              type="email"
              className="input"
              defaultValue={d.manager_email ?? ""}
            />
          </Field>
          <Field label="Manager phone" htmlFor="manager_phone" required>
            <input
              id="manager_phone"
              name="manager_phone"
              type="tel"
              required
              className="input"
              defaultValue={d.manager_phone ?? ""}
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
      </FormSection>

      <OnboardingSubmit
        label={mode === "profile" ? "Save changes" : "Finish & go to dashboard"}
      />
    </form>
  );
}
