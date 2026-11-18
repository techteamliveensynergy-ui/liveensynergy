/**
 * What the recipient should do next, for the proposal / "brand agreed"
 * notifications (0124; Testing notes 15 Nov: the email used to say "review and
 * confirm" while the artist's fulfilment form was still being prepared).
 * The artist can only confirm once the team has sent the fulfilment form.
 */
export const ARTIST_NEXT_STEP_PREPARING =
  "Our team is now preparing your fulfilment form (what you'll do to promote the partnership, and any special terms). We'll notify you as soon as it's ready to review and confirm — there's nothing for you to do yet.";

export const ARTIST_NEXT_STEP_READY =
  "Your fulfilment form is ready — open the partnership to review it and confirm.";

export const BRAND_NEXT_STEP =
  "Open the partnership to review the details and agree. Once you and the artist have both agreed, it goes live.";

export const artistNextStep = (formReady: boolean) => (formReady ? ARTIST_NEXT_STEP_READY : ARTIST_NEXT_STEP_PREPARING);
