/**
 * Event banner that never crops what an organiser uploaded.
 *
 * Uploads come in any shape (portrait posters, square cards, wide photos), and
 * `object-cover` in a fixed-height frame sliced them ("the aspect ratio on the
 * outside is not clean", 13 Nov). The whole picture is shown (`object-contain`)
 * over a blurred, enlarged copy of itself, so the frame is always filled and
 * the artwork is always complete. Stock placeholders are wide, so they fill the
 * frame just as before.
 *
 * `className` sizes the frame (height, rounding) exactly as the old <img> did.
 */
export function EventBanner({ src, alt = "", className = "h-40 w-full" }: { src: string; alt?: string; className?: string }) {
  return (
    <div className={`relative isolate overflow-hidden bg-black/10 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 -z-10 h-full w-full scale-110 object-cover blur-xl"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="h-full w-full object-contain" />
    </div>
  );
}
