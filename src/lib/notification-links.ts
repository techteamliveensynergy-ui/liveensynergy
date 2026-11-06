/**
 * Where a notification takes you, and what the button says.
 *
 * Every notification carries a site path (/dashboard/sponsored/<id>#discount-codes,
 * /dashboard/admin/surveys/responses/<id>, …) so the person can act on it in one
 * click. In the app the whole row is that link; in an email the same path becomes
 * an action button whose label says what the click does — "Review this response",
 * "View my rewards", "Confirm the discount codes" — rather than a generic "Open".
 *
 * Pure (no server-only imports) so it is shared by notify(), the email sender and
 * its tests.
 */

/**
 * A same-site path, or null. Anything else — an absolute URL, a protocol-relative
 * `//host`, a backslash trick, whitespace or control characters — is dropped, so a
 * link built from user-influenced data can never send someone off-site.
 */
export function safeAppPath(link: string | null | undefined): string | null {
  const t = (link ?? "").trim();
  if (!t.startsWith("/") || t.startsWith("//") || t.startsWith("/\\") || /[\s\u0000-\u001f]/.test(t)) {
    return null;
  }
  return t;
}

/** First match wins, so the specific patterns come before the general ones. */
const LABELS: [RegExp, string][] = [
  [/^\/dashboard\/rewards/, "View my rewards"],
  [/^\/dashboard\/participations/, "View my events"],
  [/^\/dashboard\/sponsored\/[^#?]+#discount-codes/, "Confirm the discount codes"],
  [/^\/dashboard\/sponsored\/[^#?]+#fulfilment/, "Review the fulfilment form"],
  [/^\/dashboard\/sponsored/, "Open the partnership"],
  [/^\/dashboard\/admin\/surveys\/responses\/[^/?#]+/, "Review this response"],
  [/^\/dashboard\/admin\/surveys\/responses/, "Open the review queue"],
  [/^\/dashboard\/admin\/events\/sponsored\/[^#?]+#discount-codes/, "Open the discount codes"],
  [/^\/dashboard\/admin\/events\/sponsored\/[^#?]+#fulfilment/, "Open the fulfilment form"],
  [/^\/dashboard\/admin\/events\/sponsored/, "Open the event"],
  [/^\/dashboard\/admin\/campaigns\/[^/?#]+\/order-form/, "Open the order form"],
  [/^\/order-forms\//, "Review the order form"],
  [/^\/dashboard\/admin\/campaigns\/intake/, "Open the campaign request"],
  [/^\/dashboard\/admin\/campaigns/, "Open the campaign"],
  [/^\/dashboard\/admin\/invoices|^\/dashboard\/campaigns\/invoices/, "View the invoice"],
  [/^\/dashboard\/admin\/enquiries/, "Open the enquiry"],
  [/^\/dashboard\/admin\/users/, "Open users"],
  [/^\/dashboard\/messages/, "Open the conversation"],
  [/^\/dashboard\/campaigns\/(live|requests)/, "Open the campaign"],
  [/^\/dashboard\/events\//, "Open the event listing"],
  [/^\/dashboard\/feedback/, "Open feedback"],
  [/^\/onboarding/, "Finish setting up your profile"],
  [/^\/survey\//, "Back to the survey"],
];

export const DEFAULT_ACTION_LABEL = "Open in Live·En·Synergy";

export function actionLabelFor(path: string): string {
  for (const [re, label] of LABELS) if (re.test(path)) return label;
  return DEFAULT_ACTION_LABEL;
}

export interface EmailAction {
  label: string;
  url: string;
}

/**
 * The button for an email, or null when there is nothing to add: no usable link,
 * no known site origin, or the body already contains that exact URL (a template
 * that spells out its own link isn't given a second one).
 */
export function emailActionFor(
  link: string | null | undefined,
  origin: string | null,
  body: string,
): EmailAction | null {
  const path = safeAppPath(link);
  if (!path || !origin) return null;
  const url = `${origin}${path}`;
  if (body.includes(url)) return null;
  return { label: actionLabelFor(path), url };
}
