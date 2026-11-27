import Link from "next/link";

/**
 * A "Needs attention" tile (design Option A, client 27 Nov): every card is the
 * same dark panel; colour carries meaning through the number and a small label.
 *   overdue   coral   — something has passed a deadline
 *   needs_us  lime    — the team has to act
 *   waiting   teal    — waiting on a brand, artist or payment
 *   clear     muted   — nothing to do (any tile whose count is 0)
 */
export type AttentionStatus = "overdue" | "needs_us" | "waiting" | "clear";

const STATUS: Record<AttentionStatus, { label: string; dot: string; text: string; number: string }> = {
  overdue: { label: "Overdue", dot: "bg-[var(--color-les-coral)]", text: "text-[#ff7b93]", number: "text-[#ff7b93]" },
  needs_us: { label: "Needs us", dot: "bg-[var(--color-les-lime)]", text: "text-[var(--color-les-lime)]", number: "text-[var(--color-les-lime)]" },
  waiting: { label: "Waiting on others", dot: "bg-[var(--color-les-teal)]", text: "text-[var(--color-les-teal)]", number: "text-[var(--color-les-teal)]" },
  clear: { label: "All clear", dot: "bg-[#5d6b59]", text: "text-[#8a9686]", number: "text-[#8a9686]" },
};

export function AttentionCard({
  label,
  count,
  href,
  status,
  hint,
}: {
  label: string;
  count: number;
  href: string;
  status: Exclude<AttentionStatus, "clear">;
  hint?: string;
}) {
  const s: AttentionStatus = count === 0 ? "clear" : status;
  const st = STATUS[s];
  const frame =
    s === "overdue"
      ? "attn-overdue bg-[#1a1012]"
      : s === "clear"
        ? "border-dashed border-[var(--color-les-line)] bg-[#0c140d]"
        : "border-[var(--color-les-line)] bg-[var(--color-les-panel)]";
  return (
    <Link
      href={href}
      className={`attn-card flex min-h-[8.5rem] flex-col gap-1.5 rounded-2xl border p-5 transition hover:-translate-y-0.5 ${frame}`}
    >
      <span className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] ${st.text}`}>
        <span aria-hidden className={`h-2 w-2 rounded-full ${st.dot}`} />
        {st.label}
      </span>
      <span className={`font-poster text-5xl leading-none ${st.number}`}>{count}</span>
      <span className={`text-sm ${s === "clear" ? "text-[var(--color-les-muted)]" : "text-[var(--color-les-cream)]"}`}>
        {label}
      </span>
      {hint && s !== "clear" && (
        <span className={`text-xs font-semibold ${s === "overdue" ? "text-[#ff7b93]" : "text-[var(--color-les-muted)]"}`}>
          {hint}
        </span>
      )}
    </Link>
  );
}

/** The key for the four colours, shown beside the section heading. */
export function AttentionLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] uppercase tracking-[0.12em] text-[var(--color-les-muted)]">
      {(["overdue", "needs_us", "waiting", "clear"] as AttentionStatus[]).map((k) => (
        <span key={k} className="flex items-center gap-2">
          <span aria-hidden className={`h-2 w-2 rounded-full ${STATUS[k].dot}`} />
          {STATUS[k].label}
        </span>
      ))}
    </div>
  );
}
