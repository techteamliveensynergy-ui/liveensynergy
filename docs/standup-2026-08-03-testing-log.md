# 3 Aug standup — testing log & defects found

Companion to `docs/standup-2026-08-03-tracker.md`, which is the **plan**
(what was built, and the test cases to run against it). This file is the
**record**: what was actually executed, what it showed, and every defect found
along the way with its resolution.

The tracker document is not edited by this one — it stays as the specification.

| | |
|---|---|
| Tested against | `https://liveensynergy-rho.vercel.app` (production) |
| Deployment | `dpl_DVBHtXnTr3xmRbJixNB8CcMPSikm` · commit `351301e` · READY · target production |
| Database | Supabase `oalqfzaejflgrtyfrrrb` — migrations 0020 + 0021 applied 4 Aug 2026 |
| Started | 4 Aug 2026 |

---

## 1. Defects found and their resolutions

### D1 — Phone uniqueness locked existing users out of their own profile ✅ Resolved

**Severity:** high — would have blocked real accounts from editing anything.

**Found by:** querying `phone_in_use()` against each existing audience member's
*own* stored number, straight after applying 0021.

```sql
select am.full_name,
       phone_in_use(coalesce(am.phone_country_code,'') || am.phone, am.profile_id)
         as blocked_from_saving
  from audience_members am where am.phone is not null;
```

| Name | Number | Blocked from saving |
|---|---|---|
| Abhishek Sharma | +44 7775199436 | **true** |
| hivtroop music | +44 7775199436 | **true** |
| Jordan Avery | +44 7700 900123 | **true** |
| Priya Shah | +44 7700 900123 | **true** |

**All four** audience accounts were locked out.

**What was wrong.** The check ran on *every* save. Anyone who already shared a
number with another account — which is legal data, created before the rule
existed — could no longer save their profile at all. Not just the phone field:
changing their address, their name, their postcode, anything, failed on a
number they hadn't touched. There was no way out from inside the product,
because editing the number is itself a save.

This is a variant of L4 in `lessons.md`: additive DDL was safe, but the *new
code read existing rows under a rule those rows had never had to satisfy*.

**Resolution.** `phoneTaken()` now compares against the number already stored
for that account and short-circuits when it hasn't changed. Uniqueness is
enforced going forward; it doesn't retroactively brick existing accounts.
New helpers `phoneKey()` (mirrors the database's `phone_digits()`) and
`storedPhone()` in `src/app/onboarding/actions.ts`. All four save actions pass
their own table so the current value can be looked up.

Shipped in `351301e`.

### D2 — "New build isn't live" was a bad test, not a bad deploy ✅ Resolved (no code change)

**Severity:** none in the product — but it cost ~10 minutes and would have sent
me debugging the deploy pipeline.

**What happened.** After pushing, I polled the live site for the string
`Terms for Audience Members` to confirm the new build was serving. Twelve
attempts over five minutes, all negative. Every instinct (and lesson L1) says
*stale deploy*.

**What was actually wrong.** The heading is JSX:

```jsx
<h2>{5 + i}. Terms for {t.party}</h2>
```

React's SSR output inserts comment separators between adjacent expressions, so
the HTML reads `Terms for <!-- -->Audience Members`. The string I was grepping
for never appears contiguously. The build had been live the whole time.

**How it was settled.** Checked the alias rather than guessing — the Vercel API
confirmed `liveensynergy-rho.vercel.app` was aliased to the new deployment with
`aliasError: null`. Re-verified with markers that are single text nodes
("One account per person", "greater of"), which matched immediately.

**Worth keeping.** When smoke-testing a deploy by string match, pick a marker
that is a **single uninterrupted text node** — a whole sentence of static copy,
not a heading built from interpolated values. Added as a note here rather than
to `lessons.md`, which is for defects that reached the client.

### D3 — `liveensynergy-*.vercel.app` deployment URLs redirect ⚠️ Environmental, not a defect

The per-deployment and branch-alias URLs return `302` — deployment protection.
Only the production alias `liveensynergy-rho.vercel.app` serves publicly. This
matches lesson L5's warning about protected preview origins. Not a bug; noted
so the next person doesn't chase it.

### D4 — Step tracker connectors dangled into empty space ✅ Resolved

**Severity:** cosmetic, but it read as broken layout on the first screen an
audience member sees.

**Found by:** looking at the rendered audience overview.

The tracker was a wrapping flex row with each connector line rendered *after*
its step. With five steps in a half-width card, four fitted on the first row
and the fifth wrapped — leaving the fourth step's connector running off to the
right into nothing, and "Reward released" orphaned underneath with no line
into it.

**Resolution.** A fixed column per step (`grid-template-columns: repeat(n,
1fr)`) so it can't wrap, with each connector absolutely positioned from the
previous circle's centre to this one's (`-left-1/2 w-full`). A connector can
now only exist *between* two steps, so there is nothing left to dangle. The
per-step hint moved to a single line under the tracker, since a column narrow
enough to hold "Reward released" can't hold a sentence.

Shipped in `4a7448e`. Verified on the live site — five steps, one row, clean
connectors.

### D5 — Country field used a native datalist ✅ Resolved

**Reported by Ketan during testing:** *"country of residence ui is not correct
or rather convenient — it is showing options to the right of the page. It
should rather show as a proper dropdown."*

I'd chosen `<input list>` + `<datalist>` because it needs no JavaScript. That
reasoning was wrong in practice: browsers position that suggestion popup
however they like, and it rendered beside the field rather than beneath it,
looking nothing like the rest of the form.

**Resolution.** A real combobox — type to filter, arrow keys or click to
choose, panel anchored under the input and styled with the form's own tokens.
Enter selects without submitting the surrounding form, options commit on
`mousedown` so the input's blur can't close the list first, the highlighted
option scrolls into view, and there's a "no country matches" state. An
unlisted country typed by hand still saves, deliberately — rejecting off-list
input would lock out anyone whose country we've spelled differently.

Shipped in `4a7448e`. Verified: typing "uni" filters to United Kingdom,
Tunisia, United Arab Emirates, United States, in a panel under the field.

### D6 — Unsaved-changes guard fired on forms nobody had edited ✅ Resolved

**Severity:** high nuisance — a false "you have unsaved changes" prompt on
every navigation away from a profile page, whether or not anything was typed.

**Found by:** the browser refusing to navigate away from `/dashboard/profile`
in a session where I had only *read* the page.

The guard marked the form dirty on any `input` or `change` event. Chrome's
autofill and React's hydration both fire those on load, so a form the user
had never touched was dirty from the moment it rendered.

**Resolution.** It now fingerprints the form's values on the first frame and
compares against that, so only a genuine difference counts. A side benefit:
typing something and then undoing it now correctly reads as clean, which the
event-based version got wrong too.

Shipped in `0d54759`.

### D7 — Confirmation dialog claimed `aria-modal` but abandoned focus ✅ Resolved

`ConfirmSubmit` rendered `role="dialog" aria-modal="true"` while leaving focus
on the page behind it. A screen-reader user was told a modal had opened and
was then tabbing through the form underneath it; there was no Escape to close,
and the page behind still scrolled.

**Resolution.** Focus moves to the confirm button on open and returns to the
trigger on close, Escape closes, and body scroll is locked while it's open.

Shipped in `0d54759`. Verified: the confirm button takes focus on open.

### D8 — Feedback widget had the same focus gap ✅ Resolved

Opening the panel left focus on the page behind it. Focus now moves to the
first field and returns to the tab on close.

Shipped in `0d54759`.

### D9 — A rejected save discarded the edit it was complaining about ✅ Resolved

**Severity:** high — the user is told what's wrong and simultaneously loses
the input they'd need to correct.

**Found by:** pushing past the D1 re-test into the *other* half of the phone
rule — changing to a number another account already holds.

The rejection message was right ("That phone number is already registered to
another account"), but the form had re-rendered from the **stored** values, so
the phone field showed the *old* number. The user cannot see what they just
typed. Worse, gender and country are backed by component state whose
initialiser only runs on mount, so the select blanked while its dependent
free-text box stayed on screen — confirmed in the DOM:

```js
{ selectValue: "", selfDescribeRendered: true, selfDescribeValue: "Genderfluid" }
```

A gender select reading "Prefer not to answer" with a visible "how would you
describe it?" box holding a value is a state the form should never be able to
reach.

**Resolution.** `saveAudience` echoes the submitted fields back on every
rejection (`OnboardingState.values`), and the form merges them over the stored
defaults, remounting the two state-backed fields so they pick them up. What
you submitted is what you see.

Shipped in `2a82e95`. **Re-tested on the live site:** the rejected form now
keeps the typed number (`7775199436`), the country and the self-describe text.
The gender select was still wrong, which turned out to be a separate bug — D10.

### D10 — The gender select desynchronised from its own state ✅ Resolved

**Found by:** re-testing D9. Phone, country and self-describe all came back
correctly; gender still read blank. Rather than assume D9's fix hadn't taken,
I read the DOM:

```json
{ "selectCount": 1, "selfDescribeCount": 1,
  "selectValue": "", "selectedIndex": 0 }
```

One select, sitting on the blank option — with the dependent "how would you
describe it?" box rendered next to it holding "Genderfluid". That box only
renders when React's state is `"Prefer to self-describe"`. So state and DOM
disagreed: the page displayed "Prefer not to answer", and the blank is what
the *next* submit would have sent — silently wiping the answer.

**What was wrong.** The select was controlled (`value={gender}`) and the DOM
wasn't taking the prop across the remount that follows an action result.

**Resolution.** The select is now uncontrolled (`defaultValue`), with state
kept purely to decide whether the self-describe box shows. The DOM owns the
value, so the two cannot disagree. The parent already remounts the component
per submission, so the default is re-applied from whatever came back.

Shipped in `69ceb20`.

**Worth keeping:** "the fix didn't work" and "a second bug is masking the fix"
look identical from the outside. Reading the DOM separated them in one call —
the retained phone number proved D9's fix *had* landed.

### D11 — Sibling proposals could both be accepted ✅ Resolved

**Raised by Ketan during testing:** *"admin sends more than one event as we did
just now, and someone else accepts an event in the meanwhile, but the artist is
already shared with these events as proposals — we should not come to this as a
conflicting situation somehow."*

Correct, and not hypothetical: **I created an instance of it during this
session.** After suggesting two events against CMP-00001, that campaign carried
two settled sponsorships — SPE-00001 (completed) and SPE-00008 (confirmed).

Three distinct holes in 0021's flow:

| # | Hole | Consequence |
|---|---|---|
| 1 | `toggleAgreement` did an **unlocked read-then-write**. Two people agreeing to sibling proposals at the same moment both read `status = 'in_progress'`, both passed, both wrote `confirmed`. `close_campaign_on_acceptance` only withdrew siblings *still in progress*, so neither withdrew the other. | One campaign, one budget, two live sponsorships. |
| 2 | Nothing checked whether a **listing** was already committed. | The same event confirmed against two campaigns — the artist committed to two sponsors, each believing it exclusive. |
| 3 | The "suggest more" gate read the **campaign's own status**, not whether anything had settled. A campaign could sit at `in_progress` while already carrying a completed sponsorship. | Proposals sent to artists that could never be accepted. This is what produced the real instance above. |

**Resolution (0022).** The decision moved out of application code entirely.
`agree_to_sponsorship()` takes a row lock on the event, then the campaign, and
re-checks both conflicts *inside the same transaction* before confirming. A
refusal returns a reason, which the sponsorship page now displays rather than
appearing to do nothing. Two partial unique indexes — one settled sponsorship
per campaign, one per listing — make the bad state unrepresentable even if
something bypasses the function. The admin gate now tests for a settled
sponsorship rather than the campaign's status.

**Verified against the live database:**

| Check | Result |
|---|---|
| Artist agrees to a proposal whose campaign was already settled elsewhere | ✅ Refused: *"This campaign has already been settled on Late-Shift Sessions · Vol. 12…"* — and **mutated nothing** (flags and status unchanged). Under the old code this would have confirmed. |
| Brand gives the confirming agreement on a clean campaign with 3 live siblings | ✅ Confirmed, campaign closed, all three siblings withdrawn, the loser's listing returned to `available`, and the withdrawn set returned for notification. |
| Raw `update … set status='confirmed'` on a second proposal for the same campaign | ✅ Rejected by `sponsored_events_one_settled_per_campaign`. |
| Raw update committing an already-booked listing on another campaign | ✅ Rejected by `sponsored_events_one_settled_per_listing`. |

The pre-existing conflict on CMP-00001 was cleaned up so the indexes could be
built; both created successfully, so no other conflicting data exists.

**Worth keeping.** The sequential case is the one you naturally test, and it
passed cleanly end-to-end. The concurrent case needs someone to ask "what if
two people do this at once?" — the code reads fine until you do.

---

## 2. What was verified, and how

### 2a. Migrations (executed against production database)

| Check | Result |
|---|---|
| `0020` applied — enum now `{in_progress,confirmed,completed,withdrawn}` | ✅ Pass |
| `0021` applied — 3 new `audience_members` columns present | ✅ Pass |
| `profiles.terms_accepted_at` + `terms_version` present | ✅ Pass |
| `feedback_reports.github_issue_url` + `github_issue_number` present | ✅ Pass |
| 4 new functions created (`phone_digits`, `phone_in_use`, `is_my_event_participant`, `close_campaign_on_acceptance`) | ✅ Pass |
| `profiles` now carries 4 policies (the new one added *alongside* the existing three, not replacing them) | ✅ Pass |
| `sponsorship.withdrawn` notification event + both templates seeded | ✅ Pass |
| Phone unique indexes | ⚠️ 3 of 4 — `audience_members_phone_key` skipped, as designed, because of the duplicate test numbers in D1. The migration raised its `NOTICE` and continued rather than failing. Per instruction, duplicates left in place. |

### 2b. Reference renumbering (tracker T14)

All existing rows renumbered contiguously in creation order — `SPE-00001`
through `SPE-00007`, and the same for `CMP-`, `EVT-`, `FB-`. No collisions, no
unique-constraint failure during the rewrite (old hex and new numeric formats
don't overlap, so no row ever collided mid-statement).

✅ **T14.1, T14.2, T14.3 pass.** T14.4/T14.5 (new records take the next number)
need the UI — outstanding.

### 2c. Budget / VAT recompute (tracker T17) — the headline fix

Fee model: greater of £315 or 9% of gross, +20% VAT. Every row recomputed as
gross − fee inc VAT − already released:

| Ref | Gross | Expected net | Released | Expected remaining | Actual | |
|---|---|---|---|---|---|---|
| SPE-00001 | £4,000 | £3,568 | £12 | £3,556 | £3,556 | ✅ |
| SPE-00002 | £3,000 | £2,622 | £100 | £2,522 | £2,522 | ✅ |
| SPE-00003 | £4,000 | £3,568 | — | £3,568 | £3,568 | ✅ |
| SPE-00004 | £4,000 | £3,568 | — | £3,568 | £3,568 | ✅ |
| SPE-00005 | £4,000 | £3,568 | — | £3,568 | £3,568 | ✅ |
| SPE-00006 | £6,000 | £5,352 | — | £5,352 | £5,352 | ✅ |
| SPE-00007 | £3,000 | £2,622 | — | £2,622 | £2,622 | ✅ |

Note SPE-00002 and SPE-00007 exercise the **flat-minimum** branch (9% of
£3,000 = £270, below the £315 floor, so the floor applies) and the others the
**percentage** branch. Both are correct, and part-spent events kept their
drawdown rather than being reset.

✅ **T17.8 passes** (pre-existing rows corrected, not reset). The UI-side cases
T17.1–T17.7, T17.9–T17.11 are outstanding.

### 2d. Phone normalisation (tracker T19)

| Input | `phone_digits()` | |
|---|---|---|
| `+44 7700 900123` | `7700900123` | ✅ |
| `07700900123` | `7700900123` | ✅ |
| `7700900123` | `7700900123` | ✅ |
| `''` / `null` | `''` | ✅ |

All three formats collapse to the same key, so a duplicate can't hide behind
formatting. Blank input is not treated as a collision.

`phone_in_use()` returns **true** for a number held by another account (in
either format) and **false** for an unused number or a blank. ✅

### 2e. Campaign settlement authorisation (tracker T2, T5)

`close_campaign_on_acceptance()` is `security definer`, so it runs past RLS —
which makes its explicit authorisation check the only thing standing between a
caller and other people's data. Called over a connection where `auth.uid()` is
null (so both `is_admin()` and `is_sponsored_event_party()` are false):

- returned **0 rows** ✅
- withdrew **0** sponsorships, closed **0** campaigns, all three campaigns still
  `in_progress` ✅

The guard holds and the function is inert for an unauthorised caller.

### 2e-bis. Driven through the UI (production, signed in as `audience.tester@example.com`)

| Case | Result |
|---|---|
| **D1 re-test** — save the profile with the phone **unchanged** | ✅ **Pass.** Priya Shah, one of the four accounts previously locked out, saved cleanly. Verified in the database: `gender`, `gender_self_describe` and `country_of_residence` all persisted, `updated_at` fresh, phone untouched. Before the fix this exact save failed. |
| T19.2 / T19.6 — change the phone **to** a number another account holds | ✅ **Pass.** Rejected with "That phone number is already registered to another account. Each account needs its own number." Nothing was written. |
| T9.1–T9.4 — audience step tracker | ✅ **Pass.** Five steps, all ticked for a completed participation, connectors between each, ticket thumbnail below. |
| T10.1 — gender options | ✅ **Pass.** Woman / Man / Non-binary / Prefer to self-describe / Prefer not to say, plus a blank "Prefer not to answer". |
| T10.2 — self-describe reveals a free-text box | ✅ **Pass.** Appears on selection with its hint. |
| T10.3 — both persist | ✅ **Pass.** `gender = "Prefer to self-describe"`, `gender_self_describe = "Genderfluid"` in the database. |
| T11.1 — country search | ✅ **Pass.** "uni" → United Kingdom, Tunisia, United Arab Emirates, United States. (Tunisia matches because the search is substring, not prefix — deliberate, so "arab" finds United Arab Emirates.) |
| T11.2 — country persists | ✅ **Pass.** `country_of_residence = "United Kingdom"`. |
| T3.1 — save confirmation | ✅ **Pass.** "Save these changes?" with the overwrite explanation, Go back / Yes, save changes. |
| T3.3 — confirming saves | ✅ **Pass.** |
| T4.1 — feedback tab present on dashboard pages | ✅ **Pass.** |
| Reward tracker placement | ✅ Moved to the foot of the overview at full width, as requested during testing. |

### 2e-ter. Brand / artist / admin journeys (production)

| Case | Result |
|---|---|
| T1.1 — tick two listings, submit | ✅ Button reads "Suggest 2 events"; two sponsored events created, one per listing |
| T1.2 — suggested events listed on the campaign card | ✅ With status, agreement ticks and an edit link |
| T1.4 — nothing ticked | ✅ Submit disabled |
| T1.5 — accepted event marked | ✅ ✓ + green tint + "selected by the sponsor" |
| T1.7 — losing listing freed | ✅ Back to `available` |
| T2.1 — artist agrees, brand hasn't | ✅ Non-danger dialog: "confirms as soon as the other party agrees too" |
| T2.3 — withdraw before both agree | ✅ Button becomes "Withdraw my agreement" |
| T2.4 — brand's confirming click | ✅ Danger dialog, dark button: "**This can't be undone** — the terms lock, and any other events suggested for this campaign are withdrawn" |
| T2.5 — confirmation | ✅ Status `confirmed`, both flags true |
| T2.6 — sibling withdrawn | ✅ Status `withdrawn` |
| T2.7 — notification to the losing artist | ✅ "Sponsorship proposal withdrawn", linked to the event |
| T2.8 — campaign closed | ✅ `closed`, `matched_listing_id` = the winning listing |
| **The RLS point** | ✅ The **brand** triggered all of the above, yet the campaign row and the *other artist's* proposal — neither readable or writable by them under RLS — both updated. The security-definer function is doing its job. |
| T7.2 — move a deadline that has already passed | ✅ 31-07-2026 editable and saved; confirmation names both parties |
| T7.4 — budget change re-derives the net | ✅ £3,000→£8,000: live hint "£864 inc. VAT · £7,136 for rewards"; saved as £7,036 (net less the £100 already released) |
| T7.5 — status picker after moving to confirmed | ✅ Offers only `confirmed`/`completed`; `in_progress` gone |
| T7.7 — **server-side** backward status | ✅ Injected `in_progress` into the select and submitted; server refused, status stayed `confirmed` |
| T13.1 — brand/artist reward controls | ✅ No amount box, no Release button; "Awaiting reward payout by the team" |
| T13.2 — participants copy | ✅ Says payout is handled by the team |
| T13.3 — **server-side** release attempt | ✅ Rewrote a live form to post `op=release` + £999 as the brand: status unchanged, no reward written, budget untouched |
| T13.5 — participant names | ✅ "Priya Shah", "Jordan Avery" — not id fragments |
| T13.7 — paid amount shown | ✅ "£12 paid" |
| T14.4 — new records take the next reference | ✅ `SPE-00008`, `SPE-00009`, `FB-00001` |
| T16.1 — CSV timestamps | ✅ `01/08/2026 10:42`, not raw ISO |
| T16.2 — CSV event date | ✅ `04/10/2026`, date only |
| T16.4 — empty cells | ✅ Blank, no "Invalid Date" |
| T11.4 — CSV gender/country | ✅ `Genderfluid` (self-described text winning) and `United Kingdom` |
| T4.3/T4.5 — feedback widget | ✅ Panel opens focused on the first field; submission logged as `FB-00001` with the page URL captured |
| T4.9 — no GitHub token configured | ✅ Report saves, no link stored, no error shown to the user |
| T17.2 / T17.9 / T17.11 | ✅ Gross / fee / net correct on the artist page, admin page and newly created events. Both fee branches exercised: £4,000 → £432 (9%) and £3,000 → £378 (the £315 floor) |
| QR check-in link origin | ✅ Built from the public origin (lesson L5 holding) |

### 2f. Public routes (production)

All 200: `/`, `/terms`, `/privacy`, `/about`, `/events`, `/faqs`, `/contact`,
`/auth/sign-in`, `/auth/sign-up`, `/auth/forgot-password`, `/auth/reset-password`.

| Check | Result |
|---|---|
| T15 — all three per-party terms sections render on `/terms` | ✅ Pass |
| T15.5 — anchors `#brand`, `#artist`, `#audience` exist for the sign-up links to target | ✅ Pass |
| T12.1 — sign-up offers exactly three role cards, "Artist / Event Organiser" among them | ✅ Pass |
| T12.1 — the old standalone Event Organiser card is gone | ✅ Pass |
| T18.1 — sign-in links to forgot-password | ✅ Pass |

---

## 3. Not yet tested

Audience, brand, artist and admin journeys have all been driven through the UI.
What's left:

| Tracker cases | Area | Why not yet |
|---|---|---|
| T3.4–T3.8 | Enter-key behaviour, unsaved-changes warning on the admin forms | Partly covered — the guard was seen firing correctly on a genuinely dirty form |
| T4.8 | GitHub issue mirroring | `GITHUB_TOKEN` / `GITHUB_FEEDBACK_REPO` not set. The unconfigured path (T4.9) is verified |
| T6.3 | PDF ticket placeholder | No PDF ticket in the test data |
| T9.5–T9.7 | Rejected-state tracker, narrow widths | No rejected participation in the test data |
| T18.2–T18.8 | Password reset flow | Needs a real inbox for the reset email |
| T20.1–T20.3 | Creation-form instructions | Copy-only; verified in source, not on screen |
| R1–R9 | Formal regression sweep | Covered incidentally — every role's dashboard, discover, messages and the public pages were exercised without error |

**D11's fix is verified at the data layer** (conflict refused, happy path
confirms, both indexes reject raw double-bookings) but the *refusal banner* on
the sponsorship page hasn't been seen on screen — it needs two proposals and a
settled campaign to reproduce through the UI.

---

## 4. Verification method note

Two of the three things worth recording from this session are about *how* the
testing was done, not what it found:

1. **D1 was found by querying the new rule against existing rows**, not by
   using the feature. Asking "what does this new constraint say about data
   that already exists?" surfaced in one query something the happy path would
   never have shown — a new account picking a fresh number works perfectly.

2. **D2 was a false negative from the test itself.** The correct move when a
   smoke test says "not deployed" is to check the deployment's alias before
   debugging the pipeline — the API answers definitively in one call, and it
   said the build was live while my grep said otherwise.
