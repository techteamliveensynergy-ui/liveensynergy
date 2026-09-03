import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import { SurveyTemplateForm, type CampaignOption } from "../SurveyTemplateForm";

export const metadata = { title: "New survey · Admin" };

export default async function NewSurveyPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("id, reference, brands(brand_name)")
    .order("created_at", { ascending: false });

  const campaigns = (data ?? []) as unknown as {
    id: string;
    reference: string;
    brands: { brand_name: string } | null;
  }[];

  return (
    <div>
      <PageHeader title="Create a survey" />
      <Link
        href="/dashboard/admin/surveys"
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to surveys
      </Link>
      <SurveyTemplateForm
        campaigns={campaigns.map<CampaignOption>((c) => ({
          id: c.id,
          reference: c.reference,
          brand_name: c.brands?.brand_name ?? null,
        }))}
      />
    </div>
  );
}
