/**
 * URL handling for the profile and listing forms.
 *
 * These fields used `<input type="url">`, which the browser refuses to submit
 * unless the value carries a scheme. Typing `northwavecoffee.com` — the way
 * people actually write a web address — blocked the *entire* form with a native
 * tooltip, so nothing on the profile saved and the cause wasn't obvious
 * (reported in the 27 Jul standup).
 *
 * The inputs are now plain text and the rules live here instead: accept what
 * people type, add the scheme ourselves, and reject only what genuinely isn't
 * a web address — with a message naming the field.
 */

/** Schemes we'll store. Anything else is almost certainly a mistake or unsafe. */
const ALLOWED_PROTOCOLS = ["http:", "https:"];

export interface NormalisedUrl {
  url: string | null;
  error?: string;
}

/**
 * Returns the canonical URL, or an error naming the field.
 *
 * Blank is valid and yields `null` — these fields are all optional, and an
 * empty one must never block a save.
 */
export function normaliseUrl(
  value: FormDataEntryValue | string | null | undefined,
  label = "That web address",
): NormalisedUrl {
  const raw = String(value ?? "").trim();
  if (!raw) return { url: null };

  // A bare "example.com" has no scheme; assume https rather than rejecting it.
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { url: null, error: `${label} doesn't look like a valid link.` };
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return { url: null, error: `${label} must start with http:// or https://.` };
  }

  // Reject "https://" alone, and hostnames with no dot that aren't localhost —
  // "https://mywebsite" is a typo, not a site.
  const host = parsed.hostname;
  if (!host || (!host.includes(".") && host !== "localhost")) {
    return { url: null, error: `${label} doesn't look like a valid link.` };
  }

  return { url: parsed.toString() };
}

/**
 * The address as a person would write it: no scheme, no trailing slash on a
 * bare domain, no "www." stripped (that part is theirs to keep).
 *
 * Stored links are canonical — `https://www.example.com/` — which is right for
 * a database and wrong for a form: the field told you not to type `https://`
 * and then filled itself with `https://` the moment you looked away
 * (10 Aug standup). Display drops the scheme; `normaliseUrl` puts it back on
 * the way in, so nothing about what gets saved changes.
 */
export function displayUrl(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const withoutScheme = raw.replace(/^https?:\/\//i, "");
  // Only a bare host — "example.com/" — loses its trailing slash; a real path
  // keeps whatever it had.
  return withoutScheme.replace(/^([^/?#]+)\/$/, "$1");
}

/**
 * Normalises several fields at once, returning the first error so the form can
 * report it. Keys map to the patch applied to the row.
 */
export function normaliseUrlFields(
  entries: { key: string; value: FormDataEntryValue | null; label: string }[],
): { values: Record<string, string | null>; error?: string } {
  const values: Record<string, string | null> = {};
  for (const { key, value, label } of entries) {
    const result = normaliseUrl(value, label);
    if (result.error) return { values, error: result.error };
    values[key] = result.url;
  }
  return { values };
}
