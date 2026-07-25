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

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB

/** Recommended artwork dimensions, quoted in form hints. */
export const BANNER_DIMENSIONS = "1600 × 600";
export const EVENT_IMAGE_DIMENSIONS = "1200 × 630";
export const AVATAR_DIMENSIONS = "600 × 600";

export const IMAGE_HINT = `JPG, PNG, WebP, GIF or AVIF · up to 5 MB · ${EVENT_IMAGE_DIMENSIONS}px or larger works best`;
export const BANNER_HINT = `JPG, PNG or WebP · up to 5 MB · ${BANNER_DIMENSIONS}px recommended`;
export const AVATAR_HINT = `JPG, PNG or WebP · up to 5 MB · square, ${AVATAR_DIMENSIONS}px recommended`;
export const ATTACHMENT_HINT =
  "Images, PDFs, docs or short video clips · up to 25 MB per file";

/**
 * Bio / description ceiling. The forms say "up to 500 words"; at ~6 characters
 * a word that's about 3,000 characters. Enforced in the browser via
 * `maxLength` and again server-side, since maxLength is trivially bypassed.
 */
export const MAX_BIO_CHARS = 3000;
