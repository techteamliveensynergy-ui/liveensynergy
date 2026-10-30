"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { saveFormDraft } from "@/app/drafts/actions";
import type { DraftKind } from "@/lib/drafts";
import { formatTime } from "@/lib/format";

type Fillable = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** Sets a field the way typing would, so React's onChange handlers (the
 *  "Other — please specify" toggles and the like) see the restored value. */
function setNativeValue(el: Fillable, value: string) {
  const proto = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Puts a saved draft back into the form's fields, by field name. */
function restoreForm(form: HTMLFormElement, data: Record<string, string[]>) {
  for (const [name, values] of Object.entries(data)) {
    const fields = Array.from(form.querySelectorAll<Fillable>(`[name="${CSS.escape(name)}"]`)).filter(
      (el) => !(el instanceof HTMLInputElement && (el.type === "hidden" || el.type === "file")),
    );
    fields.forEach((el, i) => {
      if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
        const want = values.includes(el.value);
        if (el.checked !== want) el.click();
      } else if (el instanceof HTMLSelectElement && el.multiple) {
        for (const opt of Array.from(el.options)) opt.selected = values.includes(opt.value);
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        const value = values[fields.length > 1 ? i : 0];
        if (value !== undefined) setNativeValue(el, value);
      }
    });
  }
}

/**
 * "Save draft" for a long form (GitHub #79). Saves the text fields as typed,
 * skipping the required-field checks that Submit still runs in full, and
 * restores them when the page is opened with a draft. Files aren't saved —
 * they're attached on Submit. Rendered inside the form; the hidden draft_id
 * lets the real submit delete the draft once it succeeds.
 */
export function SaveDraftButton({
  kind,
  draft,
  label = "Save draft",
}: {
  kind: DraftKind;
  draft?: { id: string; data: Record<string, string[]>; updated_at: string } | null;
  label?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [draftId, setDraftId] = useState(draft?.id ?? null);
  const [savedAt, setSavedAt] = useState(draft?.updated_at ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const form = ref.current?.form;
    if (form && draft?.data) restoreForm(form, draft.data);
    // Restore once, on mount — later saves come from what's on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function save() {
    const form = ref.current?.form;
    if (!form) return;
    const fd = new FormData(form);
    // Files aren't kept in a draft (drafts/actions.ts) — don't upload them;
    // a picked image made the request big enough to fail (QA 30 Oct #5).
    for (const [k, v] of Array.from(fd.entries())) if (v instanceof File) fd.delete(k);
    fd.set("draft_kind", kind);
    if (draftId) fd.set("draft_id", draftId);
    setError(null);
    startTransition(async () => {
      // A thrown request used to leave the button on "Saving…" with nothing
      // said; always end in a message.
      try {
        const result = await saveFormDraft(fd);
        if (result.error) setError(result.error);
        if (result.draftId) setDraftId(result.draftId);
        if (result.savedAt) setSavedAt(result.savedAt);
      } catch {
        setError("Couldn't save your draft — check your connection and try again.");
      }
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="draft_id" value={draftId ?? ""} />
      <button ref={ref} type="button" className="btn btn-ghost" onClick={save} disabled={pending}>
        {pending ? "Saving…" : label}
      </button>
      {error ? (
        <span className="text-[var(--color-accent)]">{error}</span>
      ) : savedAt ? (
        <span className="text-[var(--color-ink-soft)]">Draft saved at {formatTime(savedAt)}. Images are added when you submit.</span>
      ) : null}
    </span>
  );
}
