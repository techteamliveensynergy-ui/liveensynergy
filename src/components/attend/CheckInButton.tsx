"use client";

import { useRef, useState } from "react";

/**
 * "Confirm my attendance". When the venue has a location the browser is asked
 * for the person's position first (only on this tap, never in the background),
 * and the coordinates travel with the form — the database does the distance
 * check (confirm_attendance(), 0127). No location is stored.
 */
export function CheckInButton({
  action,
  fields,
  needsLocation,
  label = "Confirm my attendance",
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  needsLocation: boolean;
  label?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<"idle" | "locating" | "denied" | "unsupported">("idle");

  function onClick() {
    const form = formRef.current;
    if (!form) return;
    if (!needsLocation) return form.requestSubmit();
    if (!("geolocation" in navigator)) return setState("unsupported");
    setState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        (form.elements.namedItem("lat") as HTMLInputElement).value = String(pos.coords.latitude);
        (form.elements.namedItem("lng") as HTMLInputElement).value = String(pos.coords.longitude);
        (form.elements.namedItem("accuracy") as HTMLInputElement).value = String(Math.round(pos.coords.accuracy));
        form.requestSubmit();
      },
      () => setState("denied"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  return (
    <form ref={formRef} action={action} className="mt-6">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="lat" />
      <input type="hidden" name="lng" />
      <input type="hidden" name="accuracy" />
      <button type="button" onClick={onClick} disabled={state === "locating"} className="btn btn-primary w-full">
        {state === "locating" ? "Finding your location…" : label}
      </button>
      {needsLocation && state === "idle" && (
        <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
          We&apos;ll ask for your location once, only to check you&apos;re at the venue. It isn&apos;t saved.
        </p>
      )}
      {state === "denied" && (
        <p role="alert" className="mt-3 text-sm text-[var(--color-accent)]">
          We couldn&apos;t get your location. Allow location for this site in your browser settings, switch on your
          phone&apos;s location, then tap again.
        </p>
      )}
      {state === "unsupported" && (
        <p role="alert" className="mt-3 text-sm text-[var(--color-accent)]">
          This browser can&apos;t share a location. Try your phone&apos;s main browser.
        </p>
      )}
    </form>
  );
}
