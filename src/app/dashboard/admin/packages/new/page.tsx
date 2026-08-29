import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { PageHeader } from "@/components/dashboard/ui";
import { PackageForm } from "../PackageForm";

export const metadata = { title: "New package · Admin" };

export default async function NewPackagePage() {
  await requireRole(["admin"]);
  return (
    <div>
      <PageHeader title="Create a package" />
      <Link
        href="/dashboard/admin/packages"
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to packages
      </Link>
      <PackageForm />
    </div>
  );
}
