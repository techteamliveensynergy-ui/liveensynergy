import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { PageHeader } from "@/components/dashboard/ui";
import { PlanForm } from "../PlanForm";

export const metadata = { title: "New plan · Admin" };

export default async function NewPlanPage() {
  await requireRole(["admin"]);
  return (
    <div>
      <PageHeader title="Create a plan" />
      <Link
        href="/dashboard/admin/plans"
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to plans
      </Link>
      <PlanForm />
    </div>
  );
}
