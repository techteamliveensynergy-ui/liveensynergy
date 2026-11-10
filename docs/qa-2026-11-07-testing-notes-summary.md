# Testing notes — 7 November (General Notes doc, "Testing notes" tab)

Branch `claude/zen-hopper-y4subp`. One migration: **0117** (apply before
deploying, then run `docs/db-verify-0104-0109.sql`; group N should be all PASS).
Each note was read together with its screenshot.

## Login

| Note | What changed |
|---|---|
| Google sign-in doesn't ask for the Terms | Already fixed on 5 Nov. A new Google account goes to a Terms (and, for audience, mobile) step before the dashboard, onboarding or a survey. |
| Google's screen says "continue to `….supabase.co`" | This is a settings change: Google consent screen app name and logo, or Supabase Custom Domains to replace the address. Steps are in `docs/google-signin-setup.md`. |
| After Google sign-in / reset link: localhost error | Cause: Supabase's **Site URL** was still localhost, or the return address wasn't on its Redirect URLs list. Steps are in the same doc. The app now also ignores a localhost `NEXT_PUBLIC_SITE_URL` on a deployed site. |
| The Supabase email doesn't mention Live·En·Synergy | "Forgot password" now sends **our own branded email**. Its link works on any device and doesn't depend on the Supabase settings above. It's limited to 1 a minute and 5 an hour per account. Supabase's email is used only until 0117 is applied. |

## Admin notifications

| Note | What changed |
|---|---|
| New campaign request, but no admin notification | **Real bug, wider than this one notice.** `notifyAdmins()` looked up the admins with the brand's own session, and the database hides admin profiles from brands. So no admin alert triggered by a brand, artist or audience action was ever delivered. The admin fan-out now uses the server's service key. |

## Brand

| Note | What changed |
|---|---|
| Upload more images (brand assets) | The brand profile now points to **Repository → My files**, which takes any number of logos, product shots, guidelines and decks (team-only or shared with partner artists). |
| Overview: "Attendees checked in" | Now **Participants** (everyone registered), on the artist overview too. |
| "Campaigns in flight — Request one" | Removed. The empty state says a campaign appears once the team sets it up. |
| Request form wording/fields | The changes below, also reflected on the request page (brand and admin) and pre-filled when the team converts a request. Old requests still show what they had. |

The request form changes:
- "Campaign objective and description" replaces "Campaign description".
- **"Potential campaign questions"** replaces "Expected outcomes" and now sits right under the objective.
- **Package** (from the admin-managed packages) replaces the typed budget. An amount is asked only for the custom package.
- "Preferred reward rules" (where the "random 50 people" wording was) is removed. **"Any specific audience criteria"** replaces it, with an **age range (18+)**.

## Admin

| Note | What changed |
|---|---|
| Create a live campaign: remove Platform Margin | The box is hidden. The package's margin still travels with the form, because it sets each event's reward budget, so nothing changes in the maths. "£… gross · £… net" on the campaign list and "Budget (gross)" elsewhere now read **Package value**. The margin is still set per package under Packages. |
| Order form: post-survey link | Added **Post-event survey link** next to the pre-event one. |
| Order form: draft survey link takes the brand to their profile | Cause: the pasted link was the admin-only survey preview, so brands were bounced to their dashboard. A link to one of our own surveys now opens a **brand-safe preview** (`/order-forms/<form>/survey/<id>`). It shows exactly what participants see, never hidden fields or attention-check answers, and only to that brand (once the form is sent) or an admin. |
| Waiting-on-both wording | "2 events suggested — the brand and artist need to agree on one together". |

## Artist / brand

| Note | What changed |
|---|---|
| Old profiles don't show upcoming events | The block was removed on purpose on 2 Nov (raw listings off the public site), so no profile showed events. Public profiles now show the artist's **live partnered events**, the ones that already have a public event page, linking to it. |
| "I agree to partner with this event" | Done (the button and its confirm dialog). |
| Proof of terms: brand view says "add evidence" | The brand now sees a read-only list: "Your partner artist adds evidence here…". Only the artist uploads. |
| Hide the package value in artist emails | The proposal and "partnership is live" emails no longer show it (template change in 0117, and the app no longer passes it to artists). |

## Audience

| Note | What changed |
|---|---|
| Email link went to "complete profile", not back to the survey | Cause: a survey visitor who created their account on the main sign-up page lost the survey's address, so the welcome email's link went to onboarding. The survey address is now carried through sign-in → sign-up → welcome email, and they land back on the survey after creating the account. |
| No date of birth or gender anywhere (GDPR) | Removed from event registration (it was required), the audience profile, profile completeness and the survey hidden-field options. **Values already stored are untouched** — see the decision below. |
| Discover: every event shows the same banner | Cards fell back to one stock image per category. They now use the event's real artwork (event banner → listing image → campaign artwork). |
| Discover: "What you get / How it works" wording | "How it works" is rewritten for the current model (register → survey → code → use it on the ticketing site → check in at the venue, which builds the Event Passport). This is interim wording, ready for Sakshi's copy. |
| Event Passport | A new **Your Event Passport** section on My events lists every event checked in at. The tracker's last step is "Checked in". |
| Live campaign link shows old steps (Selected, Ticket uploaded…) | The tracker is now **Registered → Survey → Discount code → Checked in**. My events no longer mentions selection, ticket upload or the draw. "Partner newsletter & promotions" can be changed by everyone registered; it was hidden behind "selected", which no longer happens. |
| The code email reads "VYBED-…-RN56 (20)" | The code is on its own line, then "Offer: …". The admin reward form warns when the offer is a bare number ("write 20% off"). |
| "Verify you are human" keeps coming back | Its token expired part-way through long multi-page surveys. The check now starts on the last page, by the submit button. |
| Profile wording | "Your personal details are never shared with any partner without your consent." |

## Participants (old selection model)

| Note | What changed |
|---|---|
| Admin: remove the random draw, Select by hand, Reject | Removed. The list stays for admins, with **Mark checked in** as a fallback for a failed QR scan, and the manual code tools. |
| Artist sees participant names and "Awaiting the random draw" | The artist and the brand both see **totals only**: registered, surveys completed, codes issued, checked in. |
| Brand reports: "our team writes up…" | Reworded on the live campaign, Reporting & analysis and survey results. |

## Decisions for you

1. **Suggest events before payment.** You asked whether "Suggest event" should open as soon as the brief arrives. The database currently refuses any partnership against an unpaid campaign, and artists can't see unpaid campaigns. That's deliberate, so no artist is approached for something not yet paid for. My recommendation is a middle step:
   - The team can suggest events before payment.
   - The brand sees the suggestions.
   - The artist isn't shown or notified until the invoice is paid (or payment is waived).

   This needs a migration and changes to who sees what, so I haven't built it without your go-ahead.
2. **Existing date of birth / gender data.** Collection has stopped. Should the values already stored be erased (permanent), or kept until your privacy policy is final?
3. **Order form — linked event details** (capacity, event link) is marked "need to think" in the notes, so it's untouched.

## Testing

- **0117 on the scratch database** (0001–0116), applied twice:
  - the reset template, re-tested from its original 0006 state;
  - survey preview access: brand (draft/sent), another brand, audience, signed-out; another campaign's survey; hidden fields and answers stripped;
  - profile live events;
  - the artist emails and the code email template;
  - the age-range rules;
  - verify group N: 5/5 PASS.
- `npm run typecheck` and `npm run build` are clean.
- On the production build: the sign-in → sign-up link and sign-up keep the survey address, and an outside address is ignored.
- **Not tested in a browser against real data:** the screens above need 0117 and a database with real data. Browser checks after deploying:
  1. Brand: request a campaign (package, age range); then the overview tiles.
  2. Admin: create a campaign from the request; it should be pre-filled with no margin box. Order form: paste the survey builder link. As the brand, "Preview the survey" should open.
  3. Audience: sign up from a survey and confirm the email; you should land back on the survey. Registration should not ask for date of birth.
  4. Audience: My events shows the new tracker and Event Passport. The code email shows "Your code" and "Offer" on separate lines.
  5. Artist: the participants panel shows totals only, and the "partnership live" email has no amount.
  6. "Forgot password": the email is from Live·En·Synergy and its link opens the new-password page on a phone too.
