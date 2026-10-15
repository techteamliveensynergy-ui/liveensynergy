import type { ColumnFigures } from "@/lib/analysis/figures";

const fmt = (n: number | undefined) =>
  n == null ? "—" : n.toLocaleString("en-GB", { maximumFractionDigits: 2 });

/**
 * One column's figures as a chart — bars for choices and rating spreads,
 * headline numbers for other numbers, a few quotes for written answers.
 * Plain HTML/CSS so it prints into the PDF exactly as it shows on screen.
 */
export function FigureChart({ column, compact = false }: { column: ColumnFigures; compact?: boolean }) {
  return (
    <figure className="print-avoid-break rounded-2xl border border-black/10 bg-white p-4">
      <figcaption className="text-sm font-semibold text-[var(--color-ink)]">{column.name}</figcaption>
      <p className="text-xs text-[var(--color-ink-soft)]">
        {column.answered.toLocaleString("en-GB")} answered
        {column.kind === "multi" ? " · several answers allowed, so percentages add up to more than 100" : ""}
      </p>

      {column.kind === "number" && (
        <dl className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
          {(
            [
              ["Average", column.mean],
              ["Median", column.median],
              ["Lowest", column.min],
              ["Highest", column.max],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg bg-[var(--color-mist)] px-2 py-1.5">
              <dt className="text-[var(--color-ink-soft)]">{label}</dt>
              <dd className="text-base font-semibold">{fmt(value)}</dd>
            </div>
          ))}
        </dl>
      )}

      {column.counts && column.counts.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {(compact ? column.counts.slice(0, 8) : column.counts).map((c) => (
            <li key={c.label} className="grid grid-cols-[minmax(0,10rem)_1fr_3.5rem] items-center gap-2 text-xs">
              <span className="truncate" title={c.label}>
                {c.label}
              </span>
              <span className="h-3 rounded-full bg-[var(--color-mist)]">
                <span
                  className="block h-3 rounded-full bg-[var(--color-brand)]"
                  style={{ width: `${Math.min(100, c.pct)}%`, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
                />
              </span>
              <span className="text-right tabular-nums">
                {c.pct}% <span className="text-[var(--color-ink-soft)]">({c.count})</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {column.kind === "text" && column.samples && (
        <ul className="mt-3 space-y-1.5 text-xs italic text-[var(--color-ink)]">
          {column.samples.slice(0, compact ? 3 : 6).map((s, i) => (
            <li key={i} className="rounded-lg bg-[var(--color-mist)] px-3 py-1.5">
              &ldquo;{s}&rdquo;
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
