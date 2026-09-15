/** Logo + company name + tagline, shown at the bottom of every page
 *  (single-page layout) or every step (stepped layout) — any of the three
 *  may be set alone. Renders nothing when none are set. */
export function SurveyFooter({
  brandName,
  tagline,
  logoUrl,
}: {
  brandName: string | null | undefined;
  tagline: string | null | undefined;
  logoUrl?: string | null;
}) {
  if (!brandName && !tagline && !logoUrl) return null;
  return (
    <div className="flex items-center justify-center gap-2 pt-2 text-center text-xs text-[var(--color-ink-soft)]">
      {logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-12 w-12 shrink-0 rounded object-contain" />
      )}
      {(brandName || tagline) && (
        <span>
          {brandName && <span className="font-semibold">{brandName}</span>}
          {brandName && tagline && <span className="mx-1.5">·</span>}
          {tagline && <span>{tagline}</span>}
        </span>
      )}
    </div>
  );
}
