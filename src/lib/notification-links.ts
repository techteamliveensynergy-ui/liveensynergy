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
  [/^\/dashboard\/sponsored\/[^#?]+\?codes=out/, "Add more discount codes"],
  [/^\/dashboard\/sponsored\/[^#?]+#discount-codes/, "Confirm the discount codes"],
  [/^\/dashboard\/sponsored\/[^#?]+#cancellation/, "Open the partnership"],
  [/^\/dashboard\/sponsored\/[^#?]+#fulfilment/, "Review the fulfilment form"],
  [/^\/dashboard\/sponsored/, "Open the partnership"],
  [/^\/dashboard\/admin\/surveys\/responses\/[^/?#]+/, "Review this response"],
  [/^\/dashboard\/admin\/surveys\/responses/, "Open the review queue"],
  [/^\/dashboard\/admin\/events\/sponsored\/[^#?]+#cancellation/, "Review the cancellation request"],
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

/** The full address of a notification's page, or null. */
export function absoluteLink(link: string | null | undefined, origin: string | null): string | null {
  const path = safeAppPath(link);
  return path && origin ? `${origin}${path}` : null;
}

/**
 * Fills the `{{link}}` token an admin can put anywhere in an email template
 * (Notification setup) with the address of the related page. It is filled at
 * send time, so it works for notifications sent from the app and from the
 * database alike. With no page to link to, the token is removed.
 */
export function fillLinkToken(text: string, url: string | null): string {
  return text.replace(/\{\{\s*link\s*\}\}/g, url ?? "");
}

/** Removes a `{{link}}` token from in-app text — the row itself is the link there. */
export function stripLinkToken(text: string): string {
  return text.replace(/\s*\{\{\s*link\s*\}\}/g, "").trim();
}

/**
 * The button for an email, or null when there is nothing to add: the admin has
 * switched the button off for this notification (0113 — only relevant emails get
 * one), there's no usable link or site origin, or the body already contains that
 * exact URL (via {{link}} or a template that spells out its own link — it isn't
 * given a second one). `opts.label` is the admin's own button text; blank means
 * automatic.
 */
export function emailActionFor(
  link: string | null | undefined,
  origin: string | null,
  body: string,
  opts: { enabled?: boolean; label?: string | null } = {},
): EmailAction | null {
  if (opts.enabled === false) return null;
  const path = safeAppPath(link);
  if (!path || !origin) return null;
  const url = `${origin}${path}`;
  if (body.includes(url)) return null;
  return { label: opts.label?.trim() || actionLabelFor(path), url };
}

/**
 * Where an in-app notification goes when it was stored without a link (older
 * rows, or a sender that had none): the page for that kind of notification, so
 * every row in the app opens something useful. Keyed on the event family; the
 * recipient is always the person viewing, so the family picks their own page.
 */
const FALLBACK_BY_FAMILY: [string, string][] = [
  ["admin.", "/dashboard/admin"],
  ["reward.", "/dashboard/rewards"],
  ["survey.", "/dashboard/participations"],
  ["participation.", "/dashboard/participations"],
  ["participant.", "/dashboard/sponsored"],
  ["fulfilment.", "/dashboard/sponsored"],
  ["sponsorship.", "/dashboard/sponsored"],
  ["sponsored.", "/dashboard/sponsored"],
  ["offer.", "/dashboard/sponsored"],
  ["invoice.", "/dashboard/invoices"],
  ["order_form.", "/dashboard/campaigns"],
  ["campaign_intake.", "/dashboard/campaigns"],
  ["campaign.", "/dashboard/campaigns"],
  ["brand.", "/dashboard/settings"],
  ["message.", "/dashboard/messages"],
  ["feedback.", "/dashboard/feedback"],
  ["listing.", "/dashboard/events"],
  ["account.", "/dashboard/settings"],
];

export function fallbackLinkFor(eventKey: string | null | undefined): string {
  const key = eventKey ?? "";
  for (const [prefix, path] of FALLBACK_BY_FAMILY) if (key.startsWith(prefix)) return path;
  return "/dashboard";
}

/** The page an in-app notification opens: its own link, else its family's page. */
export function inAppDestination(link: string | null | undefined, eventKey: string | null | undefined): string {
  return safeAppPath(link) ?? fallbackLinkFor(eventKey);
}
