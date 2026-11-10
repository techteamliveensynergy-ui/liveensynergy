import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyUnsubscribeToken } from "@/lib/marketing/unsubscribe-token";

export const metadata: Metadata = { title: "Email preferences", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * The page behind "Unsubscribe" in a marketing email. Opening it changes
 * nothing (link scanners open every URL); the buttons POST to
 * /api/marketing/unsubscribe/<token>. Works signed out, from any device, for
 * as long as the email exists.
 */
export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const { token } = await params;
  const { done, error } = await searchParams;
  const claims = verifyUnsubscribeToken(token);

  if (!claims) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">This link doesn&apos;t work</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
          It may have been copied incompletely. Use the unsubscribe link in the email itself, or contact us and
          we&apos;ll take you off the list.
        </p>
      </Shell>
    );
  }

  const supabase = createServiceClient();
  const { data } = supabase
    ? await supabase.rpc("marketing_unsubscribe_state", { p_profile_id: claims.profileId, p_brand_id: claims.brandId })
    : { data: null };
  const state = (data ?? {}) as { brand_name?: string | null; status?: string | null; all_blocked?: boolean; account?: boolean };
  const brand = state.brand_name ?? "this partner";

  if (done === "brand" || done === "all") {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">You&apos;re unsubscribed</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
          {done === "all"
            ? "You won't receive partner newsletters or promotions from any brand on Live·En·Synergy."
            : `You won't receive newsletters or promotions from ${brand} any more.`}{" "}
          Account emails (sign-in links, your discount codes, event updates) still reach you.
        </p>
        <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
          Changed your mind? Tick &ldquo;Partner newsletter &amp; promotions&rdquo; on the event under My events.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-xl font-semibold">Email preferences</h1>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">
          That didn&apos;t go through — please try again.
        </p>
      )}
      {state.account === false ? (
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">This account no longer exists, so there&apos;s nothing to unsubscribe.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
            {state.status === "unsubscribed" || state.all_blocked
              ? `You're already unsubscribed from ${brand}. You can also stop emails from every partner brand.`
              : `Stop newsletters and promotions from ${brand}, or from every partner brand on Live·En·Synergy.`}
          </p>
          <form method="post" action={`/api/marketing/unsubscribe/${token}`} className="mt-5 space-y-2">
            {state.status !== "unsubscribed" && !state.all_blocked && (
              <button type="submit" name="scope" value="brand" className="btn btn-primary w-full">
                Unsubscribe from {brand}
              </button>
            )}
            {!state.all_blocked && (
              <button type="submit" name="scope" value="all" className="btn btn-ghost w-full">
                Unsubscribe from all partner emails
              </button>
            )}
          </form>
          <p className="mt-4 text-xs text-[var(--color-ink-soft)]">
            Account emails (sign-in links, your discount codes, event updates) aren&apos;t affected.
          </p>
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--color-mist)] px-5 py-16">
      <div className="card w-full max-w-md p-8">
        <p className="mb-4 font-display text-sm font-semibold text-[var(--color-ink-soft)]">Live·En·Synergy</p>
        {children}
      </div>
    </main>
  );
}
