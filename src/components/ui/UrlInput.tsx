"use client";

import { useState } from "react";
import { displayUrl, normaliseUrl } from "@/lib/urls";

/**
 * Standard hint for link fields. The whole point of dropping `type="url"` was
 * that people write addresses without a scheme, so say so rather than letting
 * them guess.
 */
export const URL_HINT = "No need to type https:// — we'll add it for you.";

interface UrlInputProps {
  id: string;
  name: string;
  /** Names the field in the error message, e.g. "Your website link". */
  label: string;
  defaultValue?: string | null;
  placeholder?: string;
  className?: string;
}

/**
 * Text input for a web address that checks the format when the field loses
 * focus, instead of leaving the user to discover the problem from a banner at
 * the top of the form after submitting.
 *
 * It shows the address the way you'd write it — `northwavecoffee.com`, no
 * scheme — and tidies it on blur. It used to rewrite the field to the stored
 * canonical form instead, so a field whose own hint says "no need to type
 * https://" filled itself with `https://` as soon as you clicked away
 * (10 Aug standup). `normaliseUrl` still runs on the server and still stores
 * the full URL; only what's on screen changed.
 */
export function UrlInput({
  id,
  name,
  label,
  defaultValue,
  placeholder = "e.g. northwavecoffee.com",
  className = "input",
}: UrlInputProps) {
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(displayUrl(defaultValue));

  function check(raw: string) {
    if (!raw.trim()) {
      // Blank is always fine — every link field here is optional.
      setError(null);
      return;
    }
    const result = normaliseUrl(raw, label);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    // Tidy what they typed without re-introducing the scheme: "HTTPS://Foo.com"
    // becomes "foo.com", "foo.com/path?x=1" keeps its path.
    const tidied = displayUrl(result.url);
    if (tidied && tidied !== raw) setValue(tidied);
  }

  return (
    <>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="url"
        className={`${className} ${error ? "border-[var(--color-accent)]" : ""}`}
        placeholder={placeholder}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => {
          setValue(e.target.value);
          // Clear as soon as they start correcting it — nagging while someone
          // is mid-fix is just noise.
          if (error) setError(null);
        }}
        onBlur={(e) => check(e.target.value)}
      />
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1 flex items-start gap-1.5 text-xs font-medium text-[var(--color-accent)]"
        >
          <span aria-hidden>⚠</span>
          <span>{error}</span>
        </p>
      )}
    </>
  );
}
