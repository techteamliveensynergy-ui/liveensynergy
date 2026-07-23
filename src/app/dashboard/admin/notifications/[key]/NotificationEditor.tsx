"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { ErrorBanner, SuccessBanner } from "@/components/onboarding/parts";
import { saveNotification, type NotificationAdminState } from "../actions";

/** Same substitution rule as the server-side renderer in lib/notifications.ts. */
function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k: string) =>
    vars[k] ? vars[k] : m,
  );
}

/** Realistic stand-ins so the preview reads like a real message. */
const SAMPLE: Record<string, string> = {
  user_name: "Priya Shah",
  role_label: "Audience",
  event_name: "Late-Shift Sessions · Vol. 12",
  event_date: "14 August 2026",
  brand_name: "Northwave Coffee",
  artist_name: "The Midnight Collective",
  campaign_reference: "CMP-0C2A6128",
  budget: "£4,000",
  remaining_budget: "£412",
  amount: "£12",
  plan_name: "Community",
  status: "Confirmed",
  reason: "Repeated no-shows after selection",
  reward_rules: "First 20 verified sign-ups get a full ticket refund.",
  sender_name: "Jamie Okafor",
  participant_count: "18",
  name: "Jane Doe",
  email: "jane@example.com",
  subject: "Sponsorship enquiry",
  link: "https://liveensynergy.com/auth/reset-password",
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

export function NotificationEditor({
  eventKey,
  variables,
  settings,
  inApp,
  email,
}: {
  eventKey: string;
  variables: string[];
  settings: {
    in_app_enabled: boolean;
    email_enabled: boolean;
    email_cc: string[] | null;
    email_bcc: string[] | null;
  };
  inApp: { subject: string | null; body: string | null };
  email: { subject: string | null; body: string | null };
}) {
  const [state, formAction] = useActionState<NotificationAdminState, FormData>(
    saveNotification,
    {},
  );

  const [inAppSubject, setInAppSubject] = useState(inApp.subject ?? "");
  const [inAppBody, setInAppBody] = useState(inApp.body ?? "");
  const [emailSubject, setEmailSubject] = useState(email.subject ?? "");
  const [emailBody, setEmailBody] = useState(email.body ?? "");
  const [cc, setCc] = useState((settings.email_cc ?? []).join(", "));

  // Only sample the variables this event actually declares.
  const sample: Record<string, string> = {};
  for (const v of variables) if (SAMPLE[v]) sample[v] = SAMPLE[v];
  if (!sample.user_name) sample.user_name = SAMPLE.user_name;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="event_key" value={eventKey} />
      <ErrorBanner error={state.error} />
      <SuccessBanner show={state.success} />

      {variables.length > 0 && (
        <div className="card p-5">
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            Available variables
          </p>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Use these in either template — anything unrecognised is left visible
            so you can spot typos.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {variables.map((v) => (
              <code
                key={v}
                className="rounded-full border border-black/10 bg-[var(--color-mist)] px-2.5 py-1 text-xs text-[var(--color-ink)]"
              >
                {`{{${v}}}`}
              </code>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── In-app ── */}
        <section className="card p-6">
          <label
            htmlFor="in_app_enabled"
            className="flex items-center gap-3 rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm"
          >
            <input
              id="in_app_enabled"
              type="checkbox"
              name="in_app_enabled"
              defaultChecked={settings.in_app_enabled}
              className="h-4 w-4"
            />
            <span className="font-semibold">In-app notification enabled</span>
          </label>

          <div className="mt-4 space-y-4">
            <Field label="Title" htmlFor="in_app_subject">
              <input
                id="in_app_subject"
                name="in_app_subject"
                className="input"
                value={inAppSubject}
                onChange={(e) => setInAppSubject(e.target.value)}
              />
            </Field>
            <Field label="Body" htmlFor="in_app_body">
              <textarea
                id="in_app_body"
                name="in_app_body"
                className="textarea"
                value={inAppBody}
                onChange={(e) => setInAppBody(e.target.value)}
              />
            </Field>
          </div>

          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Preview
          </p>
          <div className="mt-2 rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
            <div className="flex gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--color-brand)] text-sm text-white">
                ●
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-[var(--color-ink)]">
                  {render(inAppSubject, sample) || "Untitled notification"}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-[var(--color-ink-soft)]">
                  {render(inAppBody, sample)}
                </p>
                <p className="mt-1 text-xs text-[var(--color-ink-soft)]/70">
                  Just now
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Email ── */}
        <section className="card p-6">
          <label
            htmlFor="email_enabled"
            className="flex items-center gap-3 rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm"
          >
            <input
              id="email_enabled"
              type="checkbox"
              name="email_enabled"
              defaultChecked={settings.email_enabled}
              className="h-4 w-4"
            />
            <span className="font-semibold">Email enabled</span>
          </label>

          <div className="mt-4 space-y-4">
            <Field
              label="Always CC"
              htmlFor="email_cc"
              hint="Comma separated. Copied on every send of this event."
            >
              <input
                id="email_cc"
                name="email_cc"
                className="input"
                placeholder="team@liveensynergy.com"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
              />
            </Field>
            <Field label="Always BCC" htmlFor="email_bcc" hint="Comma separated.">
              <input
                id="email_bcc"
                name="email_bcc"
                className="input"
                defaultValue={(settings.email_bcc ?? []).join(", ")}
              />
            </Field>
            <Field label="Subject" htmlFor="email_subject">
              <input
                id="email_subject"
                name="email_subject"
                className="input"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
              />
            </Field>
            <Field label="Body" htmlFor="email_body">
              <textarea
                id="email_body"
                name="email_body"
                className="textarea min-h-[10rem]"
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
              />
            </Field>
          </div>

          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Preview
          </p>
          <div className="mt-2 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
            <div className="border-b border-black/10 bg-[var(--color-mist)] px-4 py-3 text-sm">
              <p className="text-[var(--color-ink-soft)]">
                <span className="font-semibold text-[var(--color-ink)]">To:</span>{" "}
                {SAMPLE.user_name} &lt;priya@example.com&gt;
              </p>
              {cc.trim() && (
                <p className="text-[var(--color-ink-soft)]">
                  <span className="font-semibold text-[var(--color-ink)]">CC:</span>{" "}
                  {cc}
                </p>
              )}
              <p className="mt-1 font-semibold text-[var(--color-ink)]">
                {render(emailSubject, sample) || "(no subject)"}
              </p>
            </div>
            <div className="whitespace-pre-wrap px-4 py-4 text-sm leading-relaxed text-[var(--color-ink)]">
              {render(emailBody, sample)}
            </div>
          </div>
        </section>
      </div>

      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  );
}
