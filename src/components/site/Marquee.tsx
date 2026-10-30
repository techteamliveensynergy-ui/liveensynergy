/**
 * The scrolling word band between sections (site design, #82). Pure CSS —
 * the track holds the words twice and slides by half its width, so the loop
 * is seamless. Stops for prefers-reduced-motion (globals.css).
 */
export function Marquee({ words }: { words: string[] }) {
  const run = [...words, ...words, ...words];
  return (
    <div aria-hidden className="overflow-hidden border-y border-[var(--color-les-line)] bg-[var(--color-les-ink)] py-4">
      <div className="les-marquee-track flex whitespace-nowrap">
        {[...run, ...run].map((w, i) => (
          <span key={i} className="inline-flex items-center gap-6 px-6">
            <span className="les-poster text-[48px] uppercase leading-none text-[var(--color-les-line)]">{w}</span>
            <span className="text-[32px] leading-none text-[var(--color-les-lime)]">·</span>
          </span>
        ))}
      </div>
    </div>
  );
}
