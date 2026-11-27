/** The audience-facing rule, one sentence, used wherever check-in is explained (0127). */
export const CHECKIN_RULE =
  "Check-in opens 24 hours before the event and closes at the end of the event day. You can check in once you're within about 0.3 miles of the venue — scan the QR code at the venue, or tap Check in in My events.";

/** Shorter form for tight spaces. */
export const CHECKIN_RULE_SHORT =
  "Check-in opens 24 hours before the event, and works once you're within about 0.3 miles of the venue.";

/** Why a check-in was refused (confirm_attendance(), migrations 0061 / 0127). */
export const CHECKIN_RESULT_MESSAGES: Record<string, { title: string; body: string }> = {
  too_early: {
    title: "Check-in isn't open yet",
    body: "Check-in opens 24 hours before the event starts. Come back then — and when you're at the venue.",
  },
  too_late: {
    title: "Check-in has closed",
    body: "Check-in closes at the end of the event day, and that has passed. If you attended and couldn't check in, message the Live·En·Synergy team from My events.",
  },
  too_far: {
    title: "You don't seem to be at the venue yet",
    body: "Check-in works once you're within about 0.3 miles of the venue. Move closer, make sure your phone's location is on and accurate, then try again.",
  },
  location_needed: {
    title: "We need your location to check you in",
    body: "This event checks that you're at the venue. Allow location for this site in your browser, then tap Confirm again.",
  },
  in_app_unavailable: {
    title: "Check in with the QR code for this event",
    body: "In-app check-in isn't set up for this event. Scan the QR code shown at the venue instead.",
  },
  wrong_event: {
    title: "This code is for a different event",
    body: "The QR code you scanned doesn't match your registration. Make sure you're scanning the code shown at your event.",
  },
  not_selected: {
    title: "Not yet selected for this event",
    body: "Check-in opens once you've been selected. Check My events for updates.",
  },
  event_not_live: {
    title: "This event isn't open for check-in",
    body: "The event isn't confirmed for check-in. Check My events for updates.",
  },
  not_found: {
    title: "We couldn't find your registration",
    body: "Make sure you're signed in with the account you registered with.",
  },
  error: {
    title: "Something went wrong",
    body: "Your check-in didn't go through. Please try again in a moment.",
  },
};
