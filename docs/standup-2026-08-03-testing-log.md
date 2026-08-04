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

Everything below needs a signed-in browser session. The Claude-in-Chrome
extension declined permission for both `localhost:3000` and the production
domain, so none of it has been driven through the UI yet.

| Tracker cases | Area |
|---|---|
| T1.1–T1.7 | Multi-event campaign matching, admin view of the selected event |
| T2.1–T2.8 | Agreement dialogs, confirmation, sibling withdrawal end-to-end |
| T3.1–T3.8 | Save confirmation + unsaved-changes warning |
| T4.1–T4.11 | Feedback widget (and the GitHub mirror — env vars not set yet) |
| T6.1–T6.3 | Ticket proof visibility, PDF placeholder |
| T7.1–T7.8 | Admin event editing, one-way status |
| T9.1–T9.7 | Audience step tracker |
| T10.x, T11.x | Gender / country fields |
| T13.1–T13.7 | Admin-only reward release, participant names |
| T14.4, T14.5 | New records take the next reference |
| T16.1–T16.5 | CSV export formatting |
| T17.1–T17.7, T17.9–T17.11 | Budget figures as rendered on screen |
| T18.2–T18.8 | Password reset flow |
| T19.1–T19.7 | Phone uniqueness through the forms — **including a re-test of D1**: save a profile without touching the number and confirm it now goes through |
| T20.1–T20.3 | Creation-form instructions |
| R1–R9 | Regression sweep |

**D1 specifically needs a UI re-test.** The fix is verified by inspection and
typecheck, and the data-layer behaviour it relies on is confirmed, but the
"save your profile without changing your number" path has not been exercised
against the running app. Priya Shah (`audience.tester@example.com`) is the
natural case — she was one of the four locked out.

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
