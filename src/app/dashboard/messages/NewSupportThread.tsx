"use client";

import { useState } from "react";
import { SUPPORT_TOPICS } from "@/lib/support-topics";
import { startSupportThread } from "./actions";

/**
 * Start a chat with the Live·En·Synergy team under a heading. A user can keep
 * several going, one per topic (0102) — "Payments & invoices" apart from
 * "Discount codes", say. The team is the only counterparty a brand has here.
 */
export function NewSupportThread({
  variant = "primary",
  label = "Message the team",
}: {
  variant?: "primary" | "ghost";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<string>(SUPPORT_TOPICS[0]);
  const [pending, setPending] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`btn ${variant === "primary" ? "btn-primary" : "btn-ghost w-full text-sm"}`}
      >
        {label}
      </button>
    );
  }

  return (
    <form
      action={startSupportThread}
      onSubmit={() => setPending(true)}
      className="card space-y-3 p-4 text-left"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--color-ink)]">New chat with the team</h3>
        <button
          type="button"
          className="text-xs text-[var(--color-ink-soft)] hover:underline"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>

      <div>
        <label htmlFor="support-topic" className="block text-xs text-[var(--color-ink-soft)]">
          What is it about?
        </label>
        <select
          id="support-topic"
          name="topic"
          className="select mt-1"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        >
          {SUPPORT_TOPICS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {topic === "Something else" && (
        <div>
          <label htmlFor="support-custom" className="block text-xs text-[var(--color-ink-soft)]">
            Heading
          </label>
          <input
            id="support-custom"
            name="custom_subject"
            className="input mt-1"
            maxLength={120}
            placeholder="e.g. Changing our billing contact"
          />
        </div>
      )}

      <div>
        <label htmlFor="support-first" className="block text-xs text-[var(--color-ink-soft)]">
          Your message (optional)
        </label>
        <textarea
          id="support-first"
          name="first_message"
          className="textarea mt-1"
          rows={3}
          maxLength={4000}
        />
      </div>

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Starting…" : "Start chat"}
      </button>
    </form>
  );
}
