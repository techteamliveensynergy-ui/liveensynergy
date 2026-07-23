"use client";

import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";

export function OnboardingSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
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

const SOCIAL_FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/…" },
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/…" },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/…" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@…" },
  { key: "spotify", label: "Spotify", placeholder: "https://open.spotify.com/…" },
  { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/…" },
  { key: "x", label: "X (Twitter)", placeholder: "https://x.com/…" },
  { key: "pinterest", label: "Pinterest", placeholder: "https://pinterest.com/…" },
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
          <input
            id={`social_${f.key}`}
            name={`social_${f.key}`}
            type="url"
            className="input"
            placeholder={f.placeholder}
            defaultValue={defaults?.[f.key] ?? ""}
          />
        </Field>
      ))}
    </div>
  );
}
