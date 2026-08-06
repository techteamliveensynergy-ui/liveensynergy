# Walkthrough recordings

| File | What it shows | Length |
|---|---|---|
| `audience-journey.webm` | A brand-new audience account: first sign-in, onboarding, discovering a sponsored event, registering, submitting ticket proof. | ~2 min |
| `standup-2026-08-03-walkthrough.webm` | Everything the 3 Aug standup changed, across all four roles, with on-screen captions. | ~3 min |

---

## standup-2026-08-03-walkthrough.webm

Six sections, captioned as it goes so it explains itself without a voiceover:

1. **Sign-up** — Artist and Event Organiser merged into one category; the terms
   summary and checkbox changing with the party selected.
2. **Audience portal** — the step tracker (Registered → Selected → Ticket
   uploaded → Attended → Reward released) full width at the foot of the
   overview, with the uploaded ticket; gender with self-describe; the
   searchable country dropdown; the save confirmation; the feedback tab.
3. **The budget fix** — gross / service fee / available-for-rewards on a real
   sponsorship, reward release gone from the brand's view, participants shown
   by name.
4. **Admin — campaigns** — a campaign settled from four suggested events, the
   accepted one ticked and the rest withdrawn.
5. **Admin — editing a live deal** — the one-way status picker, editing a deal
   the parties can't touch themselves, and the budget re-deriving what's left.
   Also the CSV export.
6. **One event, one sponsor** — the conflict handling added in migration 0022.

### Re-recording

```bash
npx playwright test --project=standup-video
```

Points at `https://liveensynergy-rho.vercel.app` by default — the deployed
build, with no per-route compilation to stall the recording. To record against
a local server instead:

```bash
WALKTHROUGH_URL=http://localhost:3000 npx playwright test --project=standup-video
```

The output lands in `test-results/…/video.webm`; copy it here to replace this
file.

**The spec is read-only.** It opens the confirmation dialogs and cancels them,
types into the admin budget field to show the fee recalculating and navigates
away without saving, and opens the feedback widget without submitting. Running
it doesn't change any data — which matters, because it points at the same
Supabase project the live site uses.

It does rely on fixtures that exist in that data, so the figures on screen are
real rather than staged:

| Fixture | Why |
|---|---|
| `CMP-00003` | A campaign settled from four suggested events |
| `SPE-00002` | £8,000 gross, confirmed, with a participation deadline in the past |
| `SPE-00001` | Completed, two named participants |
| Priya Shah (`audience.tester@example.com`) | An audience member sitting at every step of the tracker |

If those change, the recording still runs but some captions will describe
something the screen no longer shows — check it after any large data reset.
Accounts come from `docs/qa-creds.md`.
