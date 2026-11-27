"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { ATTACHMENT_HINT } from "@/lib/upload-limits";
import { uploadArtistFile, type ArtistFileState } from "@/app/dashboard/resources/artist-file-actions";

function Submit({ label, pending: pendingLabel }: { label: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary text-sm" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export interface InvoiceFile {
  id: string;
  title: string;
  file_name: string;
  created_at: string;
  href: string | null;
}

/**
 * The artist's own invoice for this partnership (0121): they upload it, the
 * team is told. The team never drafts or uploads an invoice on an artist's
 * behalf. Bank details live in the artist's files in the Repository.
 */
export function ArtistInvoiceCard({
  eventId,
  uploaded,
}: {
  eventId: string;
  uploaded: InvoiceFile[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [uploadState, uploadAction] = useActionState<ArtistFileState, FormData>(async (prev, fd) => {
    const result = await uploadArtistFile(prev, fd);
    if (result.message) formRef.current?.reset();
    return result;
  }, {});

  return (
    <div id="invoice" className="card p-6">
      <h2 className="text-lg font-semibold">Your invoice</h2>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Upload your own invoice for this partnership. We can&apos;t draft or send an invoice on your behalf. Add your
        bank details under <strong>Repository → My files</strong>.
      </p>

      <div className="mt-4">
        <form ref={formRef} action={uploadAction} className="space-y-3 rounded-xl bg-[var(--color-mist)] p-4">
          <input type="hidden" name="event_id" value={eventId} />
          <input type="hidden" name="kind" value="invoice" />
          <p className="text-sm font-semibold">Upload your invoice</p>
          <label className="block text-sm">
            <span className="field-label">Invoice file</span>
            <input name="file" type="file" required className="input mt-1" />
            <span className="field-hint">{ATTACHMENT_HINT}</span>
          </label>
          <label className="block text-sm">
            <span className="field-label">Title (optional)</span>
            <input name="title" maxLength={200} placeholder="e.g. Invoice INV-12" className="input mt-1" />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Submit label="Upload invoice" pending="Uploading…" />
            <span role="status" aria-live="polite" className="text-sm">
              {uploadState.error && <span className="text-[var(--color-accent)]">{uploadState.error}</span>}
              {uploadState.message && <span className="text-[var(--color-olive-deep)]">{uploadState.message}</span>}
            </span>
          </div>
        </form>

      </div>

      {uploaded.length > 0 && (
        <ul className="mt-4 divide-y divide-black/5 border-t border-black/10 text-sm">
          {uploaded.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {f.title} <span className="text-xs text-[var(--color-ink-soft)]">· {f.file_name}</span>
              </span>
              {f.href && (
                <a href={f.href} className="btn btn-ghost text-xs">
                  Download
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
