"use client";

import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { UrlInput } from "@/components/ui/UrlInput";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { UnsavedChangesGuard } from "@/components/ui/UnsavedChangesGuard";

/**
 * Submit row shared by every role's onboarding / profile form.
 *
 * `confirmSave` is set when the form is editing a profile that already exists:
 * saving then overwrites live data, so it goes through a confirmation and the
 * page warns if you try to leave mid-edit (3 Aug standup). First-time
 * onboarding has nothing to overwrite, so it saves straight away.
 */
export function OnboardingSubmit({
  label,
  confirmSave = false,
}: {
  label: string;
  confirmSave?: boolean;
}) {
  const { pending } = useFormStatus();

  if (confirmSave) {
    return (
      <div className="flex justify-end">
        <UnsavedChangesGuard />
        <ConfirmSubmit
          label={label}
          title="Save these changes?"
          body="This overwrites the details currently on your profile. Anything you've edited on this page will replace what's saved now."
          confirmLabel="Yes, save changes"
        />
      </div>
    );
  }

  return (
    <div className="flex justify-end">
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : label}
      </button>
    </div>
  );
}

export function ErrorBanner({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">
      {error}
    </p>
  );
}

export function SuccessBanner({ show }: { show?: boolean }) {
  if (!show) return null;
  return (
    <p className="rounded-lg bg-[var(--color-sage)] px-3 py-2 text-sm text-[var(--color-olive-deep)]">
      Your changes have been saved.
    </p>
  );
}

/**
 * Placeholders deliberately carry no `https://`: the fields don't need it, say
 * so in their hint, and showing it anyway is what made the whole set look like
 * it wanted a full URL (10 Aug standup).
 */
const SOCIAL_FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: "instagram", label: "Instagram", placeholder: "instagram.com/…" },
  { key: "facebook", label: "Facebook", placeholder: "facebook.com/…" },
  { key: "youtube", label: "YouTube", placeholder: "youtube.com/…" },
  { key: "tiktok", label: "TikTok", placeholder: "tiktok.com/@…" },
  { key: "spotify", label: "Spotify", placeholder: "open.spotify.com/…" },
  { key: "linkedin", label: "LinkedIn", placeholder: "linkedin.com/…" },
  { key: "x", label: "X (Twitter)", placeholder: "x.com/…" },
  { key: "pinterest", label: "Pinterest", placeholder: "pinterest.com/…" },
];

/** Renders the standard grid of social-media link inputs. */
export function SocialLinksGrid({
  fields = SOCIAL_FIELDS.map((f) => f.key),
  defaults,
}: {
  fields?: string[];
  defaults?: Record<string, string> | null;
}) {
  const shown = SOCIAL_FIELDS.filter((f) => fields.includes(f.key));
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {shown.map((f) => (
        <Field key={f.key} label={f.label} htmlFor={`social_${f.key}`}>
          <UrlInput
            id={`social_${f.key}`}
            name={`social_${f.key}`}
            label={`Your ${f.label} link`}
            placeholder={f.placeholder}
            defaultValue={defaults?.[f.key] ?? ""}
          />
        </Field>
      ))}
    </div>
  );
}
