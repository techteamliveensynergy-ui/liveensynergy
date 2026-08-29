import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import { InvoiceForm } from "../InvoiceForm";

export const metadata = { title: "New invoice · Admin" };

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ sponsored_event_id?: string }>;
}) {
  await requireRole(["admin"]);
  const { sponsored_event_id } = await searchParams;
  const supabase = await createClient();

  const [{ data: brandRows }, eventResult] = await Promise.all([
    supabase.from("brands").select("id, brand_name").order("brand_name"),
    sponsored_event_id
      ? supabase
          .from("sponsored_events")
          .select("brand_id, campaign_id, budget_gbp")
          .eq("id", sponsored_event_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <div>
      <PageHeader title="Create an invoice" />
      <Link
        href="/dashboard/admin/invoices"
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to invoices
      </Link>
      <InvoiceForm
        brands={brandRows ?? []}
        prefill={
          eventResult.data
            ? {
                brandId: eventResult.data.brand_id ?? undefined,
                sponsoredEventId: sponsored_event_id,
                campaignId: eventResult.data.campaign_id ?? undefined,
                amountGbp: eventResult.data.budget_gbp ?? undefined,
              }
            : undefined
        }
      />
    </div>
  );
}
