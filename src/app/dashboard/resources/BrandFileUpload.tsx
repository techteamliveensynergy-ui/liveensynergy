"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { uploadBrandFile, type BrandFileState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary text-sm" disabled={pending}>
      {pending ? "Uploading…" : "Upload"}
    </button>
  );
}

/** Upload a brand file to the Repository (0115). */
export function BrandFileUpload({ hint }: { hint: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<BrandFileState, FormData>(async (prev, fd) => {
    const result = await uploadBrandFile(prev, fd);
    if (result.message) formRef.current?.reset();
    return result;
  }, {});
  return (
    <form ref={formRef} action={formAction} className="space-y-3 rounded-xl bg-[var(--color-mist)] p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="field-label">File</span>
          <input name="file" type="file" required className="input mt-1" />
          <span className="field-hint">{hint}</span>
        </label>
        <label className="text-sm">
          <span className="field-label">Title</span>
          <input name="title" maxLength={200} placeholder="e.g. Logo pack, Brand guidelines 2026" className="input mt-1" />
        </label>
      </div>
      <label className="block text-sm">
        <span className="field-label">Notes (optional)</span>
        <input name="description" maxLength={1000} placeholder="What it is and how to use it" className="input mt-1" />
      </label>
      <fieldset className="text-sm">
        <legend className="field-label">Who can open it</legend>
        <label className="mr-4 inline-flex items-center gap-2">
          <input type="radio" name="visibility" value="partners" defaultChecked /> Our team and your partner artists
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="radio" name="visibility" value="team" /> Only the Live·En·Synergy team
        </label>
      </fieldset>
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
