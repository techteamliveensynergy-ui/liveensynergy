# Admin setup walkthrough — shot list (for Sakshi's testing)

Record against the deployed site, signed in as the QA admin (`docs/qa-creds.md`).
Read-only unless a step says otherwise; do the fulfilment run on a fresh partnered
event so nothing she tests is consumed. ~8–10 minutes.

## 1. Discount codes — the three ways to supply them
Admin → Partnered events → open an event → **Discount codes** (`#discount-codes`).

1. **Pattern per tier.** Tier "Pattern" selector:
   - **C · Unique code per person** — then either **generate** a batch (prefix +
     random length, e.g. `LES-` + 6 characters) or **upload / paste your own list**
     (custom codes, with optional ID numbers).
   - **A/B · One shared code** — the same code for everyone, with a *Max uses* cap
     (blank = no cap).
2. Show the tier's value (% off or merchandise), redemption platform and expiry.
3. **Send to the artist for review** → the artist confirms (now three ticks).
4. Mention the deadline box: one week from creation, capped two days before the event.

## 2. Email branding
Admin → **Email branding** (`/dashboard/admin/settings/email`): logo (and dark-mode
logo), header colour + text colour, font, **footer text**; point at the live preview.

Admin → **Notification setup** (`/dashboard/admin/notifications`): pick an event
(e.g. "Complete your fulfilment form"), edit the in-app and email wording, the
per-event on/off switches and CC/BCC. Send/preview one.

## 3. Artist fulfilment form — admin side
Open a *confirmed* partnered event → **Artist fulfilment form** (`#fulfilment`).

1. Status chip reads **Waiting for fulfilment** — the event is not public yet.
2. Fill the **promotional commitments**: tick channels, add another name, posts,
   handles/URLs, start date, post texts, other requirements, special terms.
3. **Proof of social media** requirements + minimum uploads; **payment terms**.
4. Save. (If the artist had already agreed: the consent resets and they're notified.)
5. Show **Go-live override** (waive with a reason / reopen) and the **Artist
   invoices** list (mark received / paid).

## 4. Artist side (second window, QA artist)
Event page: checklist at the top → confirm the discount codes (three ticks) →
confirm the four promotional confirmations → upload an invoice → final consent →
**Submit — take my event live**. Chip turns **Live**; the public event page and the
"Live now" list on `/events` now show it.

## 5. What changed on the public site
`/events` lists only live research events; the old "events looking for partners"
grid is gone — brands enquire through the team (button → contact form).

## 6. Survey quota stages (follow-up request)
Open a published survey with an expected-participants number. Below 90% nothing shows;
90–99% "Places are filling up"; at **100%** the pink "participant quota has been filled"
alert appears above the form (and on the public event page), and **pressing Submit
opens a pop-up** — "The quota is full — a discount code isn't guaranteed" — with
*Go back* / *Submit anyway*. The 10% buffer keeps taking responses; past it, responses
are held for review. Admins get one email/in-app alert when 100% is reached.
