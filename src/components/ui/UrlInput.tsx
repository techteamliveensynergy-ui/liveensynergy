"use client";

import { useState } from "react";
import { normaliseUrl } from "@/lib/urls";

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
 * A valid entry is rewritten to its canonical form on blur, so what will be
 * saved is what's on screen — typing `northwavecoffee.com` visibly becomes
 * `https://northwavecoffee.com/`. The same `normaliseUrl` runs again on the
 * server, so this is a courtesy, not the enforcement.
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
  const [value, setValue] = useState(defaultValue ?? "");

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
    if (result.url && result.url !== raw) setValue(result.url);
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
