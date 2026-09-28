# Discount codes — how it works and how to test it

Brief for this weekend's testing (25 Sep standup action: "Provide Code Brief").
Built from two sources, used together:

- **"Discount Codes — How We're Planning to Build This"** (25 Sep): the three
  patterns and the Phase 1 flow.
- **25 Sep standup notes**: brand-prefixed, unguessable codes; codes the artist
  supplies (with ID numbers); the admin can edit until the artist consents;
  informational support for the ticketing platforms.

Schema: migration `0045_discount_code_config.sql` (applied 28 Sep 2026).

## The three patterns

Each **tier** on a sponsored event has its own pattern. Tiers fill in
registration order ("first 50 get X, everyone after gets Y").

| | Pattern | How to set it up |
|---|---|---|
| **A** | One shared code, no cap | Pattern *One shared code*, leave **Max uses** blank, type the code (e.g. `LEV20OFF`) |
| **B** | One shared code, capped | Same as A, with **Max uses** set (e.g. 75) |
| **C** | A unique code per person | Pattern *Unique code per person*, then fill its code pool (below) |

### Filling a pattern C pool

Any mix of these three sources works:

1. **Admin uploads the brand's codes (Phase 1).** Create the codes on the
   brand's platform (Eventbrite, Shopify, …), then paste them or upload the
   CSV. Use one code per line, optionally followed by `,` and an ID number.
   A header row called `code` is skipped.
2. **The platform generates them.** Codes look like `PREFIX-XXXX-XXXX`. The
   prefix defaults to the first five letters of the brand name. The random
   part uses a cryptographically secure generator, has no look-alike
   characters (0/O, 1/I/L), and is 6–16 characters long. The artist downloads
   the CSV and loads it into their ticketing platform (for example
   Eventbrite's bulk discount-code upload).
3. **The artist adds their own codes.** They do this from their sponsored-event
   page, with optional ID numbers, before they confirm.

**A code is never made up when it's issued.** If a unique tier's pool is
empty, issuing it refuses, because the code must already work on the brand's
platform.

## The flow

1. **The brand tells the admin what they want:** the platform, the pattern,
   the value (% off or £ off) and any cap.
2. **Admin opens the sponsored event**
   (`/dashboard/admin/events/sponsored/[id]` → *Reward engine · discount
   codes*) and sets up the tiers:
   - pattern, cap, % or £ value;
   - redeem-on platform, link, valid-until date and optional how-to text.

   Each tier shows its worst-case cost: cap × value, plus 10% admin margin.
3. **Admin fills any pattern C pool,** then clicks **Send to artist for
   review.** The artist gets a notification.
4. **Artist reviews** on `/dashboard/sponsored/[id]`: they can add their own
   codes, download the CSV, tick the consent box and click **Confirm discount
   codes**.
5. **The setup is now locked.** The admin can't edit tiers or pools; the
   database enforces this too. **Reopen for editing** withdraws the artist's
   consent, and the artist has to confirm again.
6. **Issuing** happens only after consent, and only to participants who pass
   the existing checks:
   - attendance is verified;
   - the survey quality gate passes, if the campaign has a survey.

   Use **Issue codes to everyone eligible** for all of them, or issue one at a
   time from the participant list.
7. **Participant** sees the code on *My rewards*, along with:
   - the value and the platform to redeem on;
   - that platform's how-to text and a link;
   - the use-by date.

   They redeem the code on the brand's platform and can tick *Mark as
   redeemed*.
8. **Admin** sees *Issued vs redeemed* per code and can mark one redeemed from
   the brand's own report, or void it. A voided code is **not** returned to
   the pool, because the person has already seen it.

The brand sees the setup read-only and can download the CSV. The CSV never
contains participant names or emails.

## Test fixture

**SPE-00017 "[QA] Discount codes test event"** is seeded with:

- brand: Northwave Coffee (`brand.tester@example.com`);
- artist: `artist.tester@example.com`;
- three audience testers at *attendance verified*.

It has no campaign, so the survey gate is open. Log-ins are in `docs/qa-creds.md`.

Automated run (production build, see CLAUDE.md):

```bash
npm run build && npm run start
npx playwright test --project=discount-codes
```

Screenshots go to `docs/discount-codes/screenshots/`.

### Resetting the QA event

The spec writes data, so reset the event before running it again:

```sql
update sponsored_events set reward_codes_confirmed_at = null, reward_codes_confirmed_by = null
 where id = '6bdac554-a127-4fc0-a1fb-7f4136d3609e';
delete from reward_codes                where sponsored_event_id = '6bdac554-a127-4fc0-a1fb-7f4136d3609e';
delete from reward_code_pool            where sponsored_event_id = '6bdac554-a127-4fc0-a1fb-7f4136d3609e';
delete from sponsored_event_reward_tiers where sponsored_event_id = '6bdac554-a127-4fc0-a1fb-7f4136d3609e';
```

## Manual test checklist

| # | As | Do | Expect |
|---|---|---|---|
| 1 | Admin | Set a tier with both % and £ | Refused: "either a percentage or a £ amount" |
| 2 | Admin | Pattern C tier, generate 5 | 5 × `PREFIX-XXXX-XXXX`, all different |
| 3 | Admin | Paste a line with a space in it | Refused, and the bad line is named |
| 4 | Admin | Paste the same codes twice | Second time adds 0; nothing is duplicated |
| 5 | Admin | Try issuing before artist consent | Button disabled / "hasn't confirmed" banner |
| 6 | Artist | Confirm without ticking the box | "Tick the box" |
| 7 | Artist | Confirm with an empty pattern C pool | Refused: "has no codes yet" |
| 8 | Artist | Confirm properly | Locked; upload box disappears |
| 9 | Admin | Edit a tier after consent | Save disabled; reopen makes it editable |
| 10 | Admin | Issue to everyone eligible | Unique tier fills to its cap, the rest overflow to the next tier |
| 11 | Admin | Shared tier capped at N | The (N+1)th person moves to the next tier, or is reported "couldn't be placed" |
| 12 | Audience | Open My rewards | Code, platform, how-to, link, use-by date |
| 13 | Audience | Mark as redeemed | Admin sees it under Issued vs redeemed |
| 14 | Admin | Void a code, re-issue | The person gets a *new* code; the old one stays used |
| 15 | Brand | Open the event | Read-only; CSV downloads; no names in it |
| 16 | Other brand | Open `/dashboard/sponsored/<id>/reward-codes` | 404 |

## Not built yet (Phase 2 / later)

- **Platform APIs.** Codes are not created on Eventbrite, Shopify and so on
  automatically, and redemptions are not pulled back. Redemption is
  self-reported by the participant or marked by the admin.
- **A brand-facing request form.** Brands still tell the admin what they want
  outside the platform, as the plan doc describes.
- **The campaign order form, consent and invoicing** (also from 25 Sep). These
  are separate work.
