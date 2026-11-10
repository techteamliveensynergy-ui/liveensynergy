# Sign in with Google — setup

"Continue with Google" is available to **every role** (brand, artist, audience) on
the sign-in page, the sign-up page and the public survey's account step. It is
built but **switched off until the three steps below are done** — with the switch
off no Google button is shown anywhere, so nothing can dead-end.

Credentials are pasted **into Supabase**, never into the repo, chat or Vercel
(the app itself never sees the Google secret — Supabase talks to Google).

## 1. Google Cloud (once)

1. <https://console.cloud.google.com> → APIs & Services → **OAuth consent screen**
   (External; app name, support email; scopes `email`, `profile`, `openid`).
2. **Credentials → Create credentials → OAuth client ID → Web application.**
3. **Authorised redirect URI** — exactly the callback Supabase shows you in step 2
   below (it looks like `https://<project-ref>.supabase.co/auth/v1/callback`).
   Do **not** put the site's own `/auth/callback` here.
4. Keep the **Client ID** and **Client secret** — they go into Supabase next.

## 2. Supabase (per project — dev, then production)

| Where | Field | Value |
|---|---|---|
| Authentication → Providers → **Google** | Enable Sign in with Google | on |
| | Client IDs | the Google **Client ID** |
| | Client Secret | the Google **Client secret** |
| Authentication → URL Configuration | Site URL | the real site origin (same as `NEXT_PUBLIC_SITE_URL`) |
| | Redirect URLs | must allow `<site origin>/auth/callback` **with a query string** — add `<site origin>/auth/callback**` (the existing email links already use `?next=`) |

Leave **"Allow manual linking"** off. Supabase's default is to link a Google
sign-in to an existing account with the same verified email; the app relies on
that and hardens it (below).

## 3. Vercel

| Variable | Value | Notes |
|---|---|---|
| `GOOGLE_SIGNIN_ENABLED` | `true` | Server-side switch; redeploy after changing it. Unset / anything else = no Google button anywhere. |

No other new variable. (`NEXT_PUBLIC_SITE_URL` must already equal the real origin — L5.)

## How it behaves

- **New person with Google** → `/auth/callback?provider=google` → `/auth/complete`
  ("One last step"): picks Brand / Artist / Audience (skipped, audience, when they
  came from a survey), accepts that role's Terms + Privacy Policy, and — audience
  only — gives a mobile number (one person, one number, `phone_in_use`). Only then
  is `profiles.role` / `terms_accepted_at` written (service role; both are guarded
  columns). Until then `/dashboard`, `/onboarding` and the survey send them back
  to this screen. Their email counts as verified (Google verified it), so there is
  no verification email.
- **Existing person, same email** → signed in to their existing account. If that
  account's address had **not** been verified by us (profiles.email_verified_at
  null) the app treats it as a possible pre-registration by someone else: it marks
  the address verified, **replaces the password with a random one** and ends every
  other session. The owner keeps Google; "Forgot password?" sets a new password.
  Without this, whoever registered first with someone else's address could stay
  logged in after the real owner arrived with Google.
- **Survey** → the account step offers Google (audience, role locked) next to
  "Create an account" and "Sign in"; the person returns to the same survey.
- Google addresses Google reports as unverified are refused.

## Testing

Needs the real provider, so it can't run in CI. After the three steps, on dev:

1. Signed out, open a survey link → "Continue with Google" → choose an account →
   `/auth/complete` (terms + mobile) → back on the survey, straight to the first question.
2. Sign-up page → pick **Brand** → "Sign up with Google" → `/auth/complete` shows
   the role preselected → Continue → brand onboarding.
3. Sign out; sign in again with Google → lands on the dashboard (no second
   `/auth/complete`).
4. Register with email + password for an address you control but **don't** open
   the verification link; then "Sign in with Google" with that same address → the
   old password no longer works and the account shows as verified.

## Testing notes 7 Nov: what the tester saw, and the fix

| Seen | Cause | Fix |
|---|---|---|
| Google's screen says "continue to `vdghe….supabase.co`" | Google names the address the sign-in returns to, which is Supabase's. | Google Cloud → OAuth consent screen: set **App name** "Live·En·Synergy", the logo, the home page and the privacy link, and submit it for verification (the logo only shows once Google has verified the app). To replace the `supabase.co` address itself, use Supabase's **Custom Domains** add-on (paid), e.g. `auth.<your-domain>`, then update the Authorised redirect URI in Google to the new callback. |
| After Google sign-in, or a reset link: "localhost refused to connect" | Supabase sends people to its **Site URL** whenever the return address isn't on its **Redirect URLs** list, and the Site URL was still `http://localhost:3000`. | Supabase → Authentication → URL Configuration: **Site URL** = the live site origin; **Redirect URLs** must include `<origin>/auth/callback**` (and the preview origin if you test there). In Vercel, `NEXT_PUBLIC_SITE_URL` = the live origin. The app now also ignores a localhost `NEXT_PUBLIC_SITE_URL` on a deployed site. |
| Google sign-in didn't ask for the Terms | Before 5 Nov there was no Terms step for Google accounts. | Fixed: a new Google account goes to `/auth/complete` (role, Terms and, for audience, mobile) before the dashboard, onboarding or a survey. |
| The "reset password" email didn't mention Live·En·Synergy | It was Supabase's default template. | The app now sends its own branded reset email (`account.password_reset`, migration 0117; editable under Admin → Notifications). Its link opens on any device and doesn't depend on the Supabase settings above. Until 0117 is applied, or without `SUPABASE_SERVICE_ROLE_KEY`, Supabase's email is still used, so also set Supabase → Authentication → Emails → Sender name "Live·En·Synergy" (needs custom SMTP, e.g. Resend) and edit the templates' wording. |
