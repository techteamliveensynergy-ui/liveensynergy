import { requireProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { BrandForm } from "@/app/onboarding/brand/BrandForm";
import { ArtistForm } from "@/app/onboarding/artist/ArtistForm";
import { EventForm } from "@/app/onboarding/event/EventForm";
import { AudienceForm } from "@/app/onboarding/audience/AudienceForm";

export const metadata = { title: "Profile" };

const ROLE_TABLE = {
  brand: "brands",
  artist: "artists",
  event: "event_organisers",
  audience: "audience_members",
} as const;

export default async function ProfilePage() {
  const { profile } = await requireProfile();
  const role = profile!.role;

  const supabase = await createClient();
  const { data: record } = await supabase
    .from(ROLE_TABLE[role])
    .select("*")
    .eq("profile_id", profile!.id)
    .maybeSingle();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Your profile
        </h1>
        <p className="mt-2 text-[var(--color-ink-soft)]">
          Keep your details up to date — you can edit any field here at any time.
        </p>
      </div>

      {role === "brand" && <BrandForm mode="profile" defaults={record ?? undefined} />}
      {role === "artist" && (
        <ArtistForm mode="profile" defaults={record ?? undefined} />
      )}
      {role === "event" && (
        <EventForm mode="profile" defaults={record ?? undefined} />
      )}
      {role === "audience" && (
        <AudienceForm mode="profile" defaults={record ?? undefined} />
      )}
    </div>
  );
}
