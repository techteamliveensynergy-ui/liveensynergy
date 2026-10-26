/**
 * Upload limits and copy, kept separate from `@/lib/storage` so client
 * components can import them — storage.ts pulls in the server-only Supabase
 * client via `next/headers`.
 *
 * These mirror the bucket configuration in migration 0009. Change both.
 */

export const IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];

/**
 * Vercel refuses a function request body over ~4.5 MB before our code runs,
 * whatever next.config's serverActions.bodySizeLimit says (#35). Every upload
 * here goes through a Server Action, so 4 MB is the ceiling for one file and
 * for all the files in one form together, with room for the other fields.
 * The buckets in 0009 allow more; that's harmless.
 */
export const SAFE_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB

export const MAX_IMAGE_BYTES = SAFE_UPLOAD_BYTES;
export const MAX_ATTACHMENT_BYTES = SAFE_UPLOAD_BYTES;

/** Recommended artwork dimensions, quoted in form hints. */
export const BANNER_DIMENSIONS = "1600 × 600";
export const EVENT_IMAGE_DIMENSIONS = "1200 × 630";
export const AVATAR_DIMENSIONS = "600 × 600";

// Large photos are resized in the browser before upload (FileDrop), so the
// image hints don't quote a size most people will never hit.
export const IMAGE_HINT = `JPG, PNG, WebP, GIF or AVIF · large photos are resized for you · ${EVENT_IMAGE_DIMENSIONS}px or larger works best`;
export const BANNER_HINT = `JPG, PNG or WebP · large photos are resized for you · ${BANNER_DIMENSIONS}px recommended`;
export const AVATAR_HINT = `JPG, PNG or WebP · large photos are resized for you · square, ${AVATAR_DIMENSIONS}px recommended`;
export const ATTACHMENT_HINT =
  "Images, PDFs or docs · up to 4 MB per file · photos are resized for you";

/**
 * Bio / description ceiling. The forms say "up to 500 words"; at ~6 characters
 * a word that's about 3,000 characters. Enforced in the browser via
 * `maxLength` and again server-side, since maxLength is trivially bypassed.
 */
export const MAX_BIO_CHARS = 3000;

/** Human-readable size, e.g. "5 MB" / "1.4 MB" / "820 KB". */
export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${Number(mb.toFixed(mb < 10 ? 1 : 0))} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * The single definition of "is this file acceptable?".
 *
 * `FileDrop` runs it in the browser so an oversized file is rejected before it
 * is ever put on the wire — without that, the request dies at Next's Server
 * Action body limit and the user gets an unrecoverable error screen instead of
 * a message. `@/lib/storage` runs it again on the server, because the browser
 * check is a courtesy, not a guarantee.
 *
 * `allowedTypes: null` means "any type, size limit only" — that's what the
 * private-attachment uploads want.
 */
export function fileError(
  file: File,
  {
    maxBytes,
    allowedTypes,
  }: { maxBytes: number; allowedTypes?: string[] | null },
): string | null {
  if (allowedTypes && !allowedTypes.includes(file.type)) {
    return "That file type isn't supported. Use JPG, PNG or WebP.";
  }
  if (file.size > maxBytes) {
    return `That file is ${formatBytes(file.size)} — the limit is ${formatBytes(
      maxBytes,
    )}. Please compress it and try again.`;
  }
  return null;
}
