/**
 * Who has confirmed a partnership (Testing notes 15 Nov: "slightly difficult in
 * knowing brand has confirmed to one event — at the moment only a tick below the
 * brand"). Two clear pills plus one plain sentence on what happens next, shared
 * by the admin campaign + sponsorship screens and the brand / artist pages.
 */
export function AgreementStatus({
  brandAgreed,
  artistAgreed,
  artistVisible = true,
  size = "md",
}: {
  brandAgreed: boolean;
  artistAgreed: boolean;
  /** False while the campaign is unpaid: the artist can't see (or agree to) the event yet. */
  artistVisible?: boolean;
  size?: "sm" | "md";
}) {
  const pill = (done: boolean, doneText: string, waitText: string) => (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${
        size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm"
      } ${done ? "bg-[var(--color-sage)] text-[var(--color-olive-deep)]" : "bg-[var(--color-gold)]/40 text-[var(--color-ink)]"}`}
    >
      {done ? `✓ ${doneText}` : waitText}
    </span>
  );

  const next = brandAgreed && artistAgreed
    ? "Both sides have confirmed this event."
    : brandAgreed
      ? artistVisible
        ? "The brand has confirmed this event. Waiting for the artist to confirm."
        : "The brand has confirmed this event. The artist is told once the campaign is paid."
      : artistAgreed
        ? "The artist has confirmed. Waiting for the brand to confirm."
        : "Waiting for the brand to confirm this event.";

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {pill(brandAgreed, "Brand confirmed", "Awaiting brand")}
        {pill(artistAgreed, "Artist confirmed", artistVisible ? "Awaiting artist" : "Artist not yet told")}
      </div>
      {size === "md" && <p className="mt-2 text-sm text-[var(--color-ink-soft)]">{next}</p>}
    </div>
  );
}
