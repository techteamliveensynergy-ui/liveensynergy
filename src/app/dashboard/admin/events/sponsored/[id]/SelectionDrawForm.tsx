"use client";

import { useActionState } from "react";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { runSelectionDraw, type DrawState } from "../../../marketplace-actions";

/**
 * Runs the random selection draw for a sponsored event.
 *
 * Selection is no longer a brand or artist picking names off a list (10 Aug
 * standup) — it's a draw the team runs, so this is the only place it happens.
 * The default number of places is what the remaining budget actually covers at
 * the listing's ticket price; it's editable because a run can be split into
 * rounds, and because an event without a ticket price has nothing to derive it
 * from.
 */
export function SelectionDrawForm({
  eventId,
  waiting,
  suggestedPlaces,
  ticketPriceKnown,
}: {
  eventId: string;
  /** How many registrations are still eligible to be drawn. */
  waiting: number;
  suggestedPlaces: number | null;
  ticketPriceKnown: boolean;
}) {
  const [state, formAction] = useActionState<DrawState, FormData>(
    runSelectionDraw,
    {},
  );

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <input type="hidden" name="event_id" value={eventId} />

      {state.error && (
        <p className="rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className="rounded-lg bg-[var(--color-sage)] px-3 py-2 text-sm text-[var(--color-olive-deep)]">
          ✓ {state.message}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor="draw-places"
            className="block text-xs text-[var(--color-ink-soft)]"
          >
            Places to draw
          </label>
          <input
            id="draw-places"
            name="places"
            type="number"
            min={1}
            step={1}
            required
            defaultValue={suggestedPlaces ?? ""}
            className="input mt-1 w-28"
          />
        </div>
        <ConfirmSubmit
          label="Run the draw"
          pendingLabel="Drawing…"
          title="Run the random draw?"
          body={
            <>
              This picks the winning participants at random from the{" "}
              <strong>{waiting}</strong> still waiting, marks them selected and
              notifies each of them. Selections can&apos;t be un-picked from
              here — reject someone individually below if a draw needs
              correcting.
            </>
          }
          confirmLabel="Yes, draw now"
        />
      </div>

      <p className="text-xs text-[var(--color-ink-soft)]">
        {waiting} waiting.{" "}
        {ticketPriceKnown
          ? `The suggested figure is what's left of the budget divided by the ticket price.`
          : `No ticket price on the linked listing, so there's no figure to suggest — enter the number of places yourself.`}{" "}
        Anyone not drawn stays in the pool for a later round.
      </p>
    </form>
  );
}
