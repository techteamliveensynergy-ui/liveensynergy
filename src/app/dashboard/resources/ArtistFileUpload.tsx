"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { addArtistFileForArtist, uploadArtistFile, type ArtistFileState } from "./artist-file-actions";
import { ARTIST_FILE_KIND_LABEL } from "@/lib/artist-files";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary text-sm" disabled={pending}>
      {pending ? "Uploading…" : "Upload"}
    </button>
  );
}

const KINDS = Object.entries(ARTIST_FILE_KIND_LABEL);
// The team never adds an invoice for an artist.
const TEAM_KINDS = KINDS.filter(([k]) => k !== "invoice");

/**
 * Upload to an artist's files (0121). On an artist's own Repository it adds a
 * file for themselves; for the team (`artists` given) it adds one for the
 * chosen artist. Bank details go in as a file (a letter or statement) — never
 * typed into the platform.
 */
export function ArtistFileUpload({
  hint,
  artists,
}: {
  hint: string;
  /** The team's picker; absent for an artist's own upload. */
  artists?: { id: string; name: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<ArtistFileState, FormData>(async (prev, fd) => {
    const result = artists ? await addArtistFileForArtist(prev, fd) : await uploadArtistFile(prev, fd);
    if (result.message) formRef.current?.reset();
    return result;
  }, {});
  return (
    <form ref={formRef} action={formAction} className="space-y-3 rounded-xl bg-[var(--color-mist)] p-4">
      {artists && (
        <label className="block text-sm">
          <span className="field-label">Artist or organiser</span>
          <select name="artist_profile_id" required className="select mt-1" defaultValue="">
            <option value="" disabled>
              Choose…
            </option>
            {artists.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="field-label">What is it?</span>
          <select name="kind" className="select mt-1" defaultValue="bank_details">
            {(artists ? TEAM_KINDS : KINDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="field-label">Title</span>
          <input name="title" maxLength={200} placeholder="e.g. Bank letter, Invoice INV-12" className="input mt-1" />
        </label>
      </div>
      <label className="block text-sm">
        <span className="field-label">File</span>
        <input name="file" type="file" required className="input mt-1" />
        <span className="field-hint">{hint}</span>
      </label>
      <label className="block text-sm">
        <span className="field-label">Notes (optional)</span>
        <input name="description" maxLength={1000} className="input mt-1" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Submit />
        <span role="status" aria-live="polite" className="text-sm">
          {state.error && <span className="text-[var(--color-accent)]">{state.error}</span>}
          {state.message && <span className="text-[var(--color-olive-deep)]">{state.message}</span>}
        </span>
      </div>
    </form>
  );
}
