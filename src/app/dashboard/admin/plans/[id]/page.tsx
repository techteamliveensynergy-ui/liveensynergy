import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import type { Plan } from "@/lib/types";
import { PlanForm } from "../PlanForm";

export const metadata = { title: "Edit plan · Admin" };

export default async function EditPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("plans")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();

  return (
    <div>
      <PageHeader title="Edit plan" />
      <Link
        href="/dashboard/admin/plans"
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to plans
      </Link>
      <PlanForm plan={data as Plan} />
    </div>
  );
}
