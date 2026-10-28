"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { EMAIL_FONTS, DEFAULT_HEADER_BG, DEFAULT_HEADER_TEXT, type EmailBranding } from "@/lib/email/branding";
import { saveEmailBranding, sendBrandingTest, type BrandingState } from "./actions";

function Submit({ label, pending: pendingLabel, className = "btn btn-primary" }: { label: string; pending: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

function Notice({ state }: { state: BrandingState }) {
  if (state.error) {
    return <p className="rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">{state.error}</p>;
  }
  if (state.message) {
    return <p className="rounded-lg bg-[var(--color-sage)] px-3 py-2 text-sm text-[var(--color-olive-deep)]">{state.message}</p>;
  }
  return null;
}

export function BrandingForm({ branding }: { branding: EmailBranding }) {
  const [state, action] = useActionState<BrandingState, FormData>(saveEmailBranding, {});
  const [testState, testAction] = useActionState<BrandingState>(sendBrandingTest, {});

  return (
    <div className="space-y-6">
      <form action={action} className="card space-y-5 p-6">
        <Notice state={state} />

        <div>
          <span className="field-label">Logo</span>
          {branding.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logo_url} alt="Current logo" className="mt-2 max-h-16 rounded bg-[var(--color-mist)] p-2" />
          )}
          <input type="file" name="logo" accept="image/png,image/jpeg" className="mt-2 block text-sm" />
          <p className="field-hint">
            PNG or JPG, shown at up to 160 px wide. Use a transparent or white background so it still reads when a
            mail app switches to dark mode. With no logo, emails show the text wordmark.
          </p>
          {branding.logo_url && (
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" name="remove_logo" /> Remove the logo
            </label>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="field-label">Header colour</span>
            <input type="color" name="header_bg" defaultValue={branding.header_bg ?? DEFAULT_HEADER_BG} className="mt-1 h-10 w-20" />
          </label>
          <label className="text-sm">
            <span className="field-label">Header text colour</span>
            <input type="color" name="header_text" defaultValue={branding.header_text ?? DEFAULT_HEADER_TEXT} className="mt-1 h-10 w-20" />
          </label>
        </div>

        <label className="block text-sm">
          <span className="field-label">Font</span>
          <select name="font" defaultValue={branding.font ?? "system"} className="select mt-1 w-auto">
            {Object.entries(EMAIL_FONTS).map(([key, f]) => (
              <option key={key} value={key}>
                {f.label}
              </option>
            ))}
          </select>
          <span className="field-hint">
            Email-safe fonts only. Custom web fonts don&apos;t load in Outlook or most of Gmail.
          </span>
        </label>

        <label className="block text-sm">
          <span className="field-label">Footer text</span>
          <textarea
            name="footer_text"
            rows={4}
            maxLength={1000}
            defaultValue={branding.footer_text ?? ""}
            className="textarea mt-1"
            placeholder={"Live En Synergy Ltd · Registered in England and Wales, company no. …\nRegistered office: …"}
          />
          <span className="field-hint">
            Company name, registered office and company number are expected on UK business email. Plain text only —
            it appears above the notification-settings line in every email, and in the plain-text version too.
          </span>
        </label>

        <div className="flex justify-end">
          <Submit label="Save branding" pending="Saving…" />
        </div>
      </form>

      <form action={testAction} className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="space-y-2">
          <p className="text-sm text-[var(--color-ink-soft)]">
            Sends the sample below with the <strong>saved</strong> branding to your own address (outside production,
            to EMAIL_REDIRECT_TO).
          </p>
          <Notice state={testState} />
        </div>
        <Submit label="Send me a test" pending="Sending…" className="btn btn-ghost" />
      </form>
    </div>
  );
}
