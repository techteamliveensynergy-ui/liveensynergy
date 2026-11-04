"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { FileDrop } from "@/components/ui/FileDrop";
import { IMAGE_HINT } from "@/lib/upload-limits";
import type { SponsoredEventProof } from "@/lib/types";
import { uploadEventProof, type SponsoredState } from "../actions";

const LABELS: Record<string, string> = {
  social_mention: "Social media mention",
  onsite_branding: "Onsite branding",
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-ghost text-sm" disabled={pending}>
      {pending ? "Uploading…" : "Upload proof"}
    </button>
  );
}

export function ProofUploadSection({
  eventId,
  proofs,
  channels = [],
  requirements = null,
}: {
  eventId: string;
  proofs: SponsoredEventProof[];
  /** The agreed promotional channels (fulfilment form, 0103) — a proof can be tied to one. */
  channels?: string[];
  /** What the team asked for, shown above the form. */
  requirements?: string | null;
}) {
  const [state, formAction] = useActionState<SponsoredState, FormData>(
    uploadEventProof,
    {},
  );

  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold">Proof of terms</h2>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Add evidence for each social-media post and the onsite branding owed
        under this partnership — a link or a screenshot, one at a time; add as
        many as you need. The team reviews each one.
      </p>

      {requirements && (
        <p className="mt-3 whitespace-pre-wrap rounded-lg bg-[var(--color-mist)] px-3 py-2 text-sm">
          <span className="font-semibold">What we need: </span>
          {requirements}
        </p>
      )}

      {state.error && (
        <p className="mt-3 rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">
          {state.error}
        </p>
      )}

      <form action={formAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <input type="hidden" name="id" value={eventId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="field-label">What is this proof for?</span>
            <select name="proof_type" className="select mt-1">
              <option value="social_mention">Social media mention</option>
              <option value="onsite_branding">Onsite branding</option>
            </select>
          </label>
          {channels.length > 0 && (
            <label className="text-sm">
              <span className="field-label">Which channel? (optional)</span>
              <select name="channel" className="select mt-1" defaultValue="">
                <option value="">—</option>
                {channels.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm">
            <span className="field-label">Note (optional)</span>
            <input name="description" className="input mt-1" />
          </label>
        </div>
        <Submit />
        <label className="text-sm sm:col-span-2">
          <span className="field-label">Link to the post</span>
          <input
            name="link"
            className="input mt-1"
            placeholder="e.g. instagram.com/p/…"
            inputMode="url"
          />
          <span className="field-hint">Paste the post&apos;s address — or add a screenshot below instead.</span>
        </label>
        <div className="sm:col-span-2">
          <FileDrop
            name="file"
            hint={IMAGE_HINT}
            label="Drag a screenshot or photo here, or click to browse"
          />
        </div>
      </form>

      {proofs.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-black/10 pt-4">
          {proofs.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm"
            >
              <span>
                {LABELS[p.proof_type] ?? p.proof_type}
                {p.channel ? ` · ${p.channel}` : ""}
                {p.description ? ` — ${p.description}` : ""}
              </span>
              <span className="rounded-full bg-[var(--color-mist)] px-2 py-0.5 text-[11px] font-semibold capitalize text-[var(--color-ink-soft)]">
                {p.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
