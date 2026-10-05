import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/ui/Logo";
import { OrderFormDocument } from "@/components/order-forms/OrderFormDocument";
import { formatDateTime } from "@/lib/format";
import {
  ALL_SECTIONS,
  ORDER_FORM_CONSENTS,
  ORDER_FORM_STATUS_LABELS,
  type CampaignOrderForm,
} from "@/lib/order-forms";
import { PrintButton, ReviewPanel } from "./ReviewPanel";

export const metadata = { title: "Campaign order form" };

/**
 * The brand's review screen for a Campaign Order Form — full screen, outside
 * the dashboard's narrow column, so imagery and video read at presentation
 * size (5 Oct standup). Also the printable PDF ("Download PDF" prints it) and
 * the admin's "see what the brand sees" preview. Who can open it is RLS: the
 * brand once it's sent, and admins.
 */
export default async function OrderFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ approved?: string; changes?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?redirectTo=${encodeURIComponent(`/order-forms/${id}`)}`);

  const [{ data: form }, { data: profile }] = await Promise.all([
    supabase
      .from("campaign_order_forms")
      .select("*, campaigns(reference), campaign_packages(name), brands(profile_id)")
      .eq("id", id)
      .maybeSingle<
        CampaignOrderForm & {
          campaigns: { reference: string } | null;
          campaign_packages: { name: string } | null;
          brands: { profile_id: string } | null;
        }
      >(),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle<{ role: string }>(),
  ]);
  if (!form) notFound();

  const isBrandOwner = form.brands?.profile_id === user.id;
  const isAdmin = profile?.role === "admin";
  const back = isAdmin ? `/dashboard/admin/campaigns/${form.campaign_id}/order-form` : "/dashboard/campaigns";

  return (
    <div className="min-h-screen bg-[var(--color-mist)] print:bg-white">
      <header className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-4 px-6 py-6 print:py-2">
        <Link href="/"><Logo /></Link>
        <div className="flex items-center gap-3 print:hidden">
          <Link href={back} className="text-sm text-[var(--color-brand)]">← Back to {isAdmin ? "admin" : "campaigns"}</Link>
          <PrintButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] space-y-8 px-6 pb-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--color-brand)]">Campaign order form</p>
            <h1 className="mt-1 text-3xl font-bold sm:text-5xl">{form.reference}</h1>
            <p className="mt-2 text-lg text-[var(--color-ink-soft)]">
              Campaign {form.campaigns?.reference ?? ""}
              {form.sent_at ? ` · sent ${formatDateTime(form.sent_at)}` : ""}
            </p>
          </div>
          <span className="chip text-base">{ORDER_FORM_STATUS_LABELS[form.status]}</span>
        </div>

        {isAdmin && !isBrandOwner && (
          <p className="rounded-xl bg-[var(--color-gold)]/40 px-4 py-3 text-sm print:hidden">
            Admin preview — this is exactly what the brand sees.
          </p>
        )}
        {sp.changes && (
          <p role="status" className="rounded-xl bg-[var(--color-sage)]/60 px-4 py-3 text-[var(--color-olive-deep)] print:hidden">
            Thanks — we&apos;ve sent your change request to the team. We&apos;ll update the order form and send it back to you.
          </p>
        )}
        {form.status === "changes_requested" && form.changes_requested_note && (
          <div className="rounded-xl bg-[var(--color-pink)] px-4 py-3 text-[var(--color-accent)] print:hidden">
            <p className="font-semibold">Changes requested:</p>
            <p className="whitespace-pre-line">{form.changes_requested_note}</p>
          </div>
        )}

        <OrderFormDocument
          form={form}
          sections={ALL_SECTIONS}
          campaignReference={form.campaigns?.reference}
          packageName={form.campaign_packages?.name ?? null}
        />

        {form.status === "approved" ? (
          <section className="rounded-[2rem] border border-black/5 bg-white p-8 sm:p-12">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand)]">Consents</p>
            <h2 className="mt-2 text-2xl font-semibold">
              Approved{form.approved_at ? ` on ${formatDateTime(form.approved_at)}` : ""}
            </h2>
            <p className="mt-2 text-[var(--color-ink-soft)]">By approving this Campaign Order Form, the Brand confirmed that:</p>
            <ul className="mt-4 space-y-2 text-lg">
              <li>☑ {ORDER_FORM_CONSENTS.details}</li>
              <li>☑ {ORDER_FORM_CONSENTS.terms}</li>
            </ul>
            {sp.approved && (
              <p className="mt-4 text-[var(--color-ink-soft)] print:hidden">
                Thank you. Your invoice is on its way — you&apos;ll find it under{" "}
                <Link href="/dashboard/campaigns" className="underline">Campaigns</Link>.
              </p>
            )}
          </section>
        ) : form.status === "sent" && isBrandOwner ? (
          <ReviewPanel id={form.id} />
        ) : null}
      </main>
    </div>
  );
}
