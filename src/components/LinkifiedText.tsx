import { Fragment } from "react";

// http(s)://… or www.… up to whitespace; trailing punctuation is trimmed below.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<]+/gi;

/**
 * Plain text with its web addresses turned into links that open in a new tab
 * — chat messages, so an event link sent in a thread can be opened (13 Oct).
 * Text only: nothing is rendered as HTML.
 */
export function LinkifiedText({ text, linkClassName }: { text: string; linkClassName?: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    let url = match[0];
    // "see https://x.com/a." — the full stop, a closing bracket etc. aren't part of the link.
    const trailing = url.match(/[.,;:!?'")\]]+$/)?.[0] ?? "";
    if (trailing) url = url.slice(0, -trailing.length);
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    const href = url.startsWith("www.") ? `https://${url}` : url;
    parts.push(
      <a
        key={start}
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={linkClassName ?? "underline break-all"}
      >
        {url}
      </a>,
    );
    last = start + url.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <Fragment>{parts}</Fragment>;
}
