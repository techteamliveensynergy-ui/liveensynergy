import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { PageHeader } from "@/components/dashboard/ui";
import { ListingForm } from "../ListingForm";

export const metadata = { title: "New event" };

export default async function NewEventPage() {
  await requireRole(["artist", "event"]);
  return (
    <div>
      <PageHeader title="Create an event" />
      <Link
        href="/dashboard/events"
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to my events
      </Link>
      <ListingForm />
    </div>
  );
}
