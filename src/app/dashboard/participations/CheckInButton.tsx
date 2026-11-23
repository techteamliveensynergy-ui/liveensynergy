"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { checkInWithLocation, type LocationCheckInResult } from "./actions";
import { formatMiles } from "@/lib/venue";

type Phase = "idle" | "locating" | "checking" | "done";

/** In-app browsers (Instagram, Facebook, TikTok…) often block location. */
function inAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Instagram|FBAN|FBAV|FB_IAB|Line\/|Snapchat|TikTok|musical_ly|LinkedInApp/i.test(navigator.userAgent);
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * GPS gets more precise over a few seconds, so rather than taking the first
 * (often wifi-only) reading, watch for up to 12 s and keep the best one —
 * stopping early once it's within 100 m.
 */
function bestPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    let best: GeolocationPosition | null = null;
    let settled = false;
    let watchId: number | null = null;
    const finish = (err?: GeolocationPositionError | { code: number; message: string }) => {
      if (settled) return;
      settled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      if (best) resolve(best);
      else reject(err ?? { code: 3, message: "timeout" });
    };
    const timer = setTimeout(() => finish(), 12_000);
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
        if (pos.coords.accuracy <= 100) finish();
      },
      (err) => {
        // Permission refused ends it at once; anything else waits for the timer
        // in case a reading still arrives.
        if (err.code === 1 || best) finish(err);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12_000 },
    );
  });
}

const PRECISE_HELP_IOS =
  "On iPhone: Settings → Privacy & Security → Location Services → Safari Websites → turn on Precise Location.";
const PRECISE_HELP_ANDROID =
  "On Android: Settings → Location → Location services → Google Location Accuracy → turn it on.";

function message(r: LocationCheckInResult, eventDate?: string | null): { title: string; body: string } {
  switch (r.result) {
    case "too_far":
      return {
        title: "You're not at the venue yet",
        body: `Your phone puts you about ${formatMiles(r.distance_m ?? 0)} from the venue — check-in works within ${formatMiles(
          r.radius_m ?? 3219,
        )}. If you are at the venue, wait a moment and try again (your phone may still be finding you), or scan the QR code at the venue.`,
      };
    case "low_accuracy":
      return {
        title: "Your location isn't precise enough",
        body: `Your phone only gave an approximate location${
          r.accuracy_m ? ` (to within about ${formatMiles(r.accuracy_m)})` : ""
        }. Turn on precise location and try again. ${isIOS() ? PRECISE_HELP_IOS : PRECISE_HELP_ANDROID} Or scan the QR code at the venue.`,
      };
    case "no_venue":
      return {
        title: "In-app check-in isn't set up for this event",
        body: "The venue's location hasn't been added yet. Scan the QR code at the venue to check in instead.",
      };
    case "too_early":
      return {
        title: "Check-in isn't open yet",
        body: `Check-in is only open on the day of the event${eventDate ? ` (${eventDate})` : ""}. Try again when you're at the venue on the day.`,
      };
    case "too_late":
      return {
        title: "Check-in has closed",
        body: "Check-in is only open on the day of the event, and that day has passed. If you attended and couldn't check in, message the Live·En·Synergy team.",
      };
    case "event_not_live":
      return { title: "This event isn't open for check-in", body: "Check My events for updates." };
    case "not_registered":
    case "not_found":
      return {
        title: "We couldn't find your registration",
        body: "Make sure you're signed in with the account you registered with.",
      };
    case "rate_limited":
      return {
        title: "Too many tries",
        body: "You've tried a lot in the last hour. Scan the QR code at the venue, or ask the artist to check you in.",
      };
    case "invalid_location":
      return { title: "We couldn't read your location", body: "Please try again, or scan the QR code at the venue." };
    case "signed_out":
      return { title: "You've been signed out", body: "Sign in again, then tap Check in." };
    default:
      return { title: "Something went wrong", body: "Your check-in didn't go through. Please try again in a moment." };
  }
}

/**
 * "Check in" on My events (0126): the attendee taps it at the venue on the day;
 * the phone's location is sent once and the database decides whether they're
 * within the event's radius. The QR code at the venue stays as the fallback,
 * and every refusal says what to do next.
 */
export function CheckInButton({
  participationId,
  radiusM,
  eventDate,
}: {
  participationId: string;
  radiusM: number;
  /** Shown in the "not open yet" message. */
  eventDate?: string | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [problem, setProblem] = useState<{ title: string; body: string } | null>(null);
  const [success, setSuccess] = useState(false);
  // Read after mount: the server render can't know the browser.
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => setEmbedded(inAppBrowser()), []);

  async function go() {
    setProblem(null);
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setProblem({
        title: "This browser can't share your location",
        body: "Open this page in Safari or Chrome, or scan the QR code at the venue.",
      });
      return;
    }
    setPhase("locating");
    let pos: GeolocationPosition;
    try {
      pos = await bestPosition();
    } catch (e) {
      setPhase("idle");
      const code = (e as { code?: number }).code;
      if (code === 1) {
        setProblem({
          title: "Location is turned off for this site",
          body: inAppBrowser()
            ? "This app's built-in browser is blocking location. Tap ⋯ and choose “Open in Safari” / “Open in Chrome”, then check in there."
            : isIOS()
              ? "Allow location: Settings → Privacy & Security → Location Services → make sure it's on, and Safari Websites is set to “While Using”. If Safari asked and you tapped Don't Allow: tap “aA” in the address bar → Website Settings → Location → Allow. Then tap Check in again."
              : "Allow location: tap the icon to the left of the address bar → Permissions → Location → Allow, and make sure your phone's Location is on. Then tap Check in again.",
        });
      } else {
        setProblem({
          title: "We couldn't find your location",
          body: "Make sure Location is on, step outside or near a window if you can, and try again. Or scan the QR code at the venue.",
        });
      }
      return;
    }

    setPhase("checking");
    const r = await checkInWithLocation(
      participationId,
      pos.coords.latitude,
      pos.coords.longitude,
      pos.coords.accuracy,
    );
    if (r.result === "verified" || r.result === "already") {
      setSuccess(true);
      setPhase("done");
      router.refresh();
      return;
    }
    setPhase("idle");
    setProblem(message(r, r.event_date ?? eventDate));
  }

  if (success) {
    return (
      <p className="rounded-xl bg-[var(--color-sage)]/60 px-4 py-3 text-sm font-semibold text-[var(--color-olive-deep)]" role="status">
        ✅ You&apos;re checked in — enjoy the event! It&apos;s now in your Event Passport.
      </p>
    );
  }

  const busy = phase === "locating" || phase === "checking";
  return (
    <div className="rounded-xl border border-[var(--color-brand)]/30 bg-[var(--color-mist)] p-4" data-testid="checkin-panel">
      <p className="text-sm font-semibold text-[var(--color-ink)]">📍 At the venue? Check in now</p>
      <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
        Your phone shares its location once, to confirm you&apos;re within {formatMiles(radiusM)} of the venue. We
        keep it for 90 days only so the team can review a check-in if needed, and never share it with the brand or
        artist.
      </p>
      <button type="button" className="btn btn-primary mt-3 w-full sm:w-auto" onClick={go} disabled={busy}>
        {phase === "locating" ? "Finding your location…" : phase === "checking" ? "Checking you in…" : "Check in"}
      </button>
      {embedded && phase === "idle" && !problem && (
        <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
          Tip: if nothing happens, open this page in Safari or Chrome — some apps&apos; built-in browsers block location.
        </p>
      )}
      {problem && (
        <div className="mt-3 rounded-lg bg-[var(--color-gold)]/40 p-3 text-sm" role="alert">
          <p className="font-semibold text-[var(--color-ink)]">{problem.title}</p>
          <p className="mt-1 text-[var(--color-ink-soft)]">{problem.body}</p>
        </div>
      )}
    </div>
  );
}
