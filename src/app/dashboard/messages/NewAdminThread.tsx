"use client";

import { useState } from "react";
import { startAdminThread } from "./actions";

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
                team&rdquo;. If a thread with them already exists, this opens
                that one.
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
                Subject (optional)
              </label>
              <input
                id="new-thread-subject"
                name="subject"
                className="input mt-1"
                placeholder="e.g. Sponsorship SPE-00003"
              />
            </div>
            <button type="submit" className="btn btn-primary">
              Start chat
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="btn btn-ghost text-sm"
          onClick={() => setOpen(true)}
        >
          + New chat with an artist or sponsor
        </button>
      )}
    </div>
  );
}
