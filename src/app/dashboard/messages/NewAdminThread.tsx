"use client";

import { useState } from "react";
import { startAdminThread } from "./actions";
import { SUPPORT_TOPICS } from "@/lib/support-topics";

export interface ContactOption {
  id: string;
  name: string;
  /** Human-readable role, used to group the picker. */
  roleLabel: string;
}

/**
 * Lets an admin open a conversation with an artist, organiser or sponsor who
 * hasn't written in first (10 Aug standup).
 *
 * Collapsed by default — on a busy Messages page the thread list is what you
 * came for, and this is the occasional action.
 */
export function NewAdminThread({ people }: { people: ContactOption[] }) {
  const [open, setOpen] = useState(false);

  const groups = people.reduce<Record<string, ContactOption[]>>((acc, p) => {
    (acc[p.roleLabel] ??= []).push(p);
    return acc;
  }, {});

  if (people.length === 0) return null;

  return (
    <div className="mb-5">
      {open ? (
        <form
          action={startAdminThread}
          className="card space-y-3 p-5"
          onSubmit={() => setOpen(false)}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-[var(--color-ink)]">
                Start a new chat
              </h2>
              <p className="mt-0.5 text-sm text-[var(--color-ink-soft)]">
                They&apos;ll find it under &ldquo;With Live·En·Synergy
                team&rdquo;. Each chat is its own thread under its heading,
                even if you already have one with them.
              </p>
            </div>
            <button
              type="button"
              className="text-sm text-[var(--color-ink-soft)] hover:underline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <label
                htmlFor="new-thread-person"
                className="block text-xs text-[var(--color-ink-soft)]"
              >
                Who
              </label>
              <select
                id="new-thread-person"
                name="profile_id"
                required
                defaultValue=""
                className="select mt-1"
              >
                <option value="" disabled>
                  Choose someone…
                </option>
                {Object.entries(groups).map(([label, options]) => (
                  <optgroup key={label} label={label}>
                    {options.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="new-thread-subject"
                className="block text-xs text-[var(--color-ink-soft)]"
              >
                Heading
              </label>
              <input
                id="new-thread-subject"
                name="subject"
                className="input mt-1"
                list="new-thread-topics"
                maxLength={120}
                placeholder="e.g. Partnership SPE-00003"
              />
              <datalist id="new-thread-topics">
                {SUPPORT_TOPICS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <button type="submit" className="btn btn-primary">
              Start chat
            </button>
          </div>
          <div>
            <label
              htmlFor="new-thread-first"
              className="block text-xs text-[var(--color-ink-soft)]"
            >
              First message (optional)
            </label>
            <textarea
              id="new-thread-first"
              name="first_message"
              className="textarea mt-1"
              rows={2}
              maxLength={4000}
            />
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="btn btn-ghost text-sm"
          onClick={() => setOpen(true)}
        >
          + New chat with an artist or partner
        </button>
      )}
    </div>
  );
}
