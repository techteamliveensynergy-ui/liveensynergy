"use client";

import { useEffect, useRef } from "react";
import { OTHER_TEXT_MAX } from "@/lib/surveys";

/**
 * The text box under a chosen "Other — please specify" option (FB-00029).
 * Focuses itself when it appears, so picking Other flows straight into typing.
 */
export function OtherInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="mt-2">
      <input
        ref={ref}
        className="input"
        aria-label={`${label} — please specify`}
        placeholder="Please specify…"
        maxLength={OTHER_TEXT_MAX}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
