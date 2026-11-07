# Terms & Conditions and Privacy Policy — draft for legal review

**Status: DRAFT, 7 November 2026. Not legal advice.** Written by the development
team from how the platform actually behaves today, so a solicitor has accurate
facts to work from. The live `/terms` and `/privacy` pages keep their
"full copy to be finalised before launch" line until this is reviewed and the
gaps below are filled; then the approved text replaces the page copy in one change.
(The Cookie Policy needed no legal facts — it was written from an audit of what
the site sets — so its placeholder has been removed.)

## What the client / solicitor needs to supply

Everything in `[SQUARE BRACKETS]` below. In short:

1. **Legal entity** — company name, company number, registered address.
2. **Contact for privacy requests** — an email address (and a postal address).
3. **ICO registration number** (UK data protection fee).
4. **Retention periods** — proposed periods are marked *proposed*; confirm or change.
5. **International transfers** — confirm the safeguard relied on for each US provider
   (UK–US Data Bridge where the provider is certified, otherwise the UK IDTA / Addendum).
6. **Liability, refunds and governing law** — the commercial positions only the
   business can set (caps, exclusions, refund policy, England & Wales or other).
7. **Sign-off on two changes from the current Terms** (see "Differences from the live
   page" at the end) — they change what users agree to, so `TERMS_VERSION` in
   `src/lib/terms.ts` must be bumped when the new text goes live.

---

# Part A — Privacy Policy (draft)

## 1. Who we are

Live·En·Synergy is operated by **[COMPANY LEGAL NAME]**, a company registered in
[England and Wales] under number **[COMPANY NUMBER]**, whose registered office is
**[REGISTERED ADDRESS]** ("we", "us"). We are the data controller for the personal
data described here. ICO registration number: **[ICO NUMBER]**.

Questions or requests about your data: **[PRIVACY EMAIL]**.

## 2. What we collect

**Everyone with an account**
- Name, email address, password (stored only as a secure hash by our sign-in
  provider), the role you chose, and when you accepted our terms.
- If you sign in with Google: your name, email address and Google account identifier.
- Whether and when you confirmed your email address.
- Records of the consents you give (what, when, from which screen). We keep these as
  evidence and they cannot be edited.
- When you were last active, messages you send through the platform, feedback you
  submit (which may include a screenshot you attach), and the notifications we send you.

**Audience members**
- Mobile number (one audience account per person and per number), date of birth,
  gender (optional, with a self-describe option), country of residence, address and
  postcode.
- Events you register for, whether you were selected, ticket proof you upload, and
  attendance check-ins (QR code at the venue or confirmed by the organiser).
- Your survey answers, and the results of the automated quality check on each
  response (see section 4).
- Discount codes issued to you and whether you marked them as redeemed.
- To protect surveys from bots and duplicate entries: a one-way, salted hash of your
  IP address (we do not store the address itself), the timing of your answers, and
  a security check by Cloudflare Turnstile.

**Brands**
- Company and contact details, billing address, campaign requests, order forms you
  approve, and invoices. Card payments are handled by Stripe; we never see or store
  full card numbers.

**Artists and event organisers**
- Profile and public profile details (including social media links you add), event
  listings, the fulfilment form you consent to, proof of promotion you upload, and
  discount-code confirmations.

## 3. How we use it, and our lawful basis

| Purpose | Lawful basis |
|---|---|
| Creating and running your account, signing you in | Contract |
| Running sponsored events: registration, selection, check-in, issuing discount codes | Contract |
| Brand campaigns: order forms, invoicing, payments | Contract; legal obligation (tax records) |
| Artist fulfilment: commitments, consent, proof of promotion | Contract |
| Survey quality checks and fraud prevention (bots, duplicates, one account per person) | Legitimate interests — keeping rewards fair and research data reliable |
| Showing brands aggregated survey results | Legitimate interests — the research the brand commissioned; results are anonymous totals |
| Emails and in-app notifications about your account and events | Contract |
| Sponsor marketing, where you ticked the box to receive it | Consent (withdraw any time) |
| Keeping consent records and an audit log | Legal obligation; legitimate interests |
| Answering feedback and enquiries | Legitimate interests |

## 4. Automated checks on survey responses

Each survey response is scored automatically (for example: answered implausibly
fast, failed an attention question, contradicted itself, or looks like a duplicate
of another response). A response that scores well is issued a code automatically; one
in the middle band is **held for review by a member of our team**, who decides; and one
that scores well below the bar is **not issued a code** automatically. You can ask
for any decision to be reviewed by a person at any time ([PRIVACY EMAIL] or the
Feedback button). We do not tell respondents the scoring rules, so that they can't be
gamed.

> **For the solicitor:** the automatic "not issued a code" outcome (score below 60)
> is a decision made solely by automated means. Whether withholding a discount code is
> a "legal or similarly significant effect" under UK GDPR Article 22 is for you to
> judge; the right to a human review is offered above either way.

## 5. Who we share it with

- **Brands** see survey results only as totals and charts, and nothing until at
  least 5 responses exist. They never receive your name, contact details or your
  individual answers. If you opt in to sponsor marketing, the brand receives your
  contact details for that purpose.
- **The artist or organiser of an event you register for** sees who is taking part,
  so they can verify attendance.
- **Service providers** who process data for us under contract, each only for what
  they need:
  - Supabase — database, file storage and sign-in [region: CONFIRM]
  - Vercel — website hosting (USA)
  - Resend — sending email (USA)
  - Stripe — brand invoices and payments (USA / Ireland)
  - Cloudflare — bot protection on survey pages (USA)
  - Google — only if you choose "Continue with Google" (USA)
  - OpenAI — summarising survey results for written reports. Names, email addresses,
    phone numbers and other identifying fields are removed first; OpenAI receives
    worked-out figures and a sample of written answers, and does not use them to
    train its models (USA).
- **Authorities**, where the law requires it.

We do not sell personal data.

## 6. International transfers

Some providers above process data in the USA. Where they do, we rely on
**[UK–US Data Bridge certification / the UK International Data Transfer Agreement or
Addendum — CONFIRM PER PROVIDER]**.

## 7. How long we keep it (*proposed — confirm*)

- Account and profile data: while your account is open, then deleted or anonymised
  within **[90 days]** of closure.
- Survey responses: identifying details removed **[24 months]** after the event;
  anonymous answers kept for research totals.
- Ticket proofs: **[90 days]** after the event.
- Invoices and payment records: **6 years** (tax law).
- Consent records and the admin audit log: **[6 years]** (evidence).
- Hashed IP addresses and submission attempts: **[12 months]**.
- Email delivery records: **[12 months]**.

## 8. Your rights

You can ask to access, correct or delete your data, to restrict or object to how we
use it, and for a copy in a portable format. You can withdraw consent (for example to
sponsor marketing) at any time. Much of this can be done from your profile; for the
rest, contact **[PRIVACY EMAIL]**. We reply within one month.

If you're unhappy with how we handle your data, you can complain to the Information
Commissioner's Office (ico.org.uk, 0303 123 1113) — we'd appreciate the chance to put
it right first.

## 9. Age

The platform is for people aged 18 and over. We don't knowingly collect data from
anyone younger.

## 10. Security

Data is held with access controls at the database level (each account can reach only
its own records), encrypted in transit, and payment keys are stored encrypted.
Survey exports remove identifying fields before they leave the database.

## 11. Changes

We'll update this page when how we use data changes, and tell you in the app or by
email if the change is significant.

---

# Part B — Terms & Conditions (draft)

## 1. About these terms

These terms are an agreement between you and **[COMPANY LEGAL NAME]** for using
Live·En·Synergy as a Brand, an Artist / Event Organiser, or an Audience Member. By
creating an account you agree to these terms and to the terms for your role below.

## 2. Accounts

- You must be 18 or over. Audience members must be UK residents.
- One audience account per person, and one per mobile number.
- The details you give must be your own and accurate. You must confirm your email
  address before using the dashboard or answering a survey.
- Keep your sign-in details secure; you're responsible for activity on your account.

## 3. Brands

- Campaigns are bought as packages. You approve an order form setting out the package,
  research brief and terms, and we invoice you; a campaign opens to artists and
  audiences only once the invoice is paid (or the team records a written waiver).
- Prices exclude VAT, which is added at the prevailing rate.
- Survey results are provided as anonymous totals, and only once at least 5 responses
  exist.
- **[Refund and cancellation policy — CONFIRM.]**

## 4. Artists and event organisers

- Event details you list (dates, venue, capacity, ticket price) must be accurate and
  kept up to date.
- Before a partnership goes ahead, our team sends you a fulfilment form setting out the
  promotional commitments agreed with the brand (channels, number of posts, accounts to
  tag, start date, post texts) and any special terms. Your consent to that form is your
  agreement to deliver it.
- You confirm the discount codes for your event by the deadline shown, having checked
  that they work on your ticketing platform. Codes are issued to audience members only
  after you confirm them.
- You upload proof that the commitments were delivered, which our team reviews.

## 5. Audience members

- To receive a discount code you register for the event and answer its survey honestly.
- Every response is quality-checked. A response that passes is issued a code
  automatically; one in the middle band is reviewed by our team; one well below the bar
  is not issued a code (you can ask for a person to review it). A code is not
  guaranteed: codes are limited, issued one per qualifying response while they last,
  and once a survey has reached its participant limit late responses are reviewed and
  may not receive one.
- Discount codes are provided by the brand or event and redeemed on the ticketing
  platform shown, under that platform's terms and any expiry date shown with the code.
  We don't sell tickets.
- Repeatedly not attending after being selected, or sharing a check-in code with
  someone who isn't at the venue, can lead to your account being suspended.

## 6. Acceptable use

Don't misuse the platform: no false information, multiple audience accounts, automated
or scripted survey answers, attempts to access other people's data, or unlawful,
offensive or infringing content in messages, profiles or uploads.

## 7. Your content

You keep ownership of what you upload. You give us permission to store and display it
as needed to run the platform (for example, an artist's public profile).

## 8. Suspension and closing your account

We may suspend or close an account that breaks these terms. You can close your account
at any time by contacting us; obligations already agreed (for example a confirmed
partnership or an issued invoice) continue.

## 9. Liability

**[Limitation and exclusion of liability — to be drafted by the solicitor.]** Nothing in
these terms limits liability that cannot be limited by law.

## 10. Changes to these terms

We'll tell you before significant changes take effect. Continuing to use the platform
after that means you accept the updated terms.

## 11. Governing law

These terms are governed by the law of **[England and Wales]**, and the courts of
**[England and Wales]** have jurisdiction.

## 12. Contact

**[CONTACT EMAIL]** · **[REGISTERED ADDRESS]**

The per-role summaries shown at sign-up (`src/lib/terms.ts`) should be brought in line
with sections 3–5 when this is approved.

---

## Differences from the live page (need sign-off)

1. **Fees.** The live Terms say the platform fee (greater of £315 + VAT or 9% + VAT) is
   "deducted from the sponsorship budget". Brands now buy packages invoiced up front;
   the draft describes that. Confirm which model the legal terms should state.
2. **When codes are released.** The live Terms say rewards are released "subject to
   successful attendance verification". Codes are now released when a survey response
   passes the quality check — usually before the event. The draft describes the current
   behaviour.
