# Google Places — venue search for in-app check-in

Attendees check in from **My events** on the event day when their phone is
within the event's radius of the venue (default 2 miles, set per event by an
admin). That needs the venue as coordinates, which artists (on their listing)
and admins (on the sponsored event) pick with a Google Places search. Migration
`0126_location_checkin.sql`; code in `src/lib/places.ts`,
`src/app/dashboard/places-actions.ts`, `src/components/ui/VenuePicker.tsx`.

Without a key the app still works: the venue picker asks for coordinates by
hand ("51.4652, -0.1149" — right-click the spot in Google Maps to copy them).

## 1. Create the key

1. Google Cloud console → create (or pick) a project → **Billing**: attach a
   billing account. Places won't answer without one. The monthly free
   allowance should cover this platform's volume (a handful of venue searches
   per event); set a budget alert anyway (Billing → Budgets & alerts, e.g. £10).
2. **APIs & Services → Library** → enable **Places API (New)**. (Not the legacy
   "Places API", and the Maps JavaScript API isn't needed: every call is made
   from our server.)
3. **APIs & Services → Credentials → Create credentials → API key.**
4. Restrict it: **API restrictions → Restrict key → Places API (New)** only.
   Leave *Application restrictions* at **None**: the key is used from Vercel's
   servers, whose IP addresses change, so referrer/IP restrictions would break
   it. It's never sent to the browser.
5. Optional, on the API's **Quotas** page: cap *Autocomplete requests per day*
   (e.g. 2,000) so a bug can't run up a bill.

## 2. Add it to the app

- Vercel → Project → Settings → Environment Variables:
  `GOOGLE_MAPS_API_KEY` = the key, for **Production** (and Preview if you test
  there). Redeploy for it to take effect.
- Locally: `GOOGLE_MAPS_API_KEY=` in `.env.local`.

## 3. Check it

1. Sign in as an artist → **My events → Create an event** (or edit one).
2. In **Venue location**, type a venue name (3+ letters) — suggestions appear.
   Pick one: the map preview shows the pin, and city/country fill in.
3. Save, then open the listing again: the venue is still there.
4. As an admin, open the sponsored event → **Edit event details**: the venue
   (copied from the listing) and the **Check-in radius (miles)** are there.

If suggestions don't appear, the server log has a line starting
`[places]` with Google's error (usually: Places API (New) not enabled, billing
missing, or the key restricted to the wrong API).

## What it costs, and what's sent

- Each "type → pick" is one Autocomplete *session* plus one Place Details
  call (fields: id, name, address, location, address parts). Searches are
  limited to 300 an hour and details to 100 an hour per person.
- Only what the artist/admin types and the chosen place id go to Google — no
  attendee data. Attendee locations are compared with the venue inside our own
  database (`check_in_at_location()`), never sent to Google.
- The map preview is an OpenStreetMap embed (no key, no cost).

## How check-in uses it

| | |
|---|---|
| Radius | `sponsored_events.checkin_radius_m`, default 3219 m (2 miles); admins edit it in miles (0.1–30). |
| Precision | A reading less precise than 1000 m is refused with "turn on Precise Location" help (iPhone's approximate location is several km). |
| Day | The event's own calendar day in its time zone, same as the QR. |
| Fallback | The venue QR code needs no location. An admin can "Mark checked in". |
| Evidence | Each attempt is logged in admin-only `checkin_attempts`, location rounded to ~100 m and cleared after 90 days (`purge_checkin_locations()`, run by the daily `/api/cron/code-deadlines`). Max 20 attempts per person per hour. The participation records only the method and distance. |
| No venue pin | Attendees see "scan the QR code"; admins see it under **Waiting on artists → Waiting on us** and on the event page. |
