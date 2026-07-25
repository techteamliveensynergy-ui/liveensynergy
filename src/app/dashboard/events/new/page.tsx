import Link from "next/link";
import { requireRole, profileCompleteness } from "@/lib/profile";
import { PageHeader } from "@/components/dashboard/ui";
import { ProfileCompleteness } from "@/components/dashboard/ProfileCompleteness";
import { ListingForm } from "../ListingForm";

export const metadata = { title: "New event" };

export default async function NewEventPage() {
  const { profile } = await requireRole(["artist", "event"]);
  const completeness = await profileCompleteness(profile);
  const blocked = completeness.blocking.length > 0;

  return (
    <div>
      <PageHeader title="Create an event" />
      <Link
        href="/dashboard/events"
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to my events
      </Link>

      {/* Sponsors can't evaluate an event behind an empty profile, so the
          essentials have to be in place before listing one. */}
      {blocked ? (
        <ProfileCompleteness completeness={completeness} />
      ) : (
        <>
          <ProfileCompleteness completeness={completeness} className="mb-5" />
          <ListingForm />
        </>
      )}
    </div>
  );
}
