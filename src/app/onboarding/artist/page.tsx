import { redirect } from "next/navigation";
import { OnboardingShell } from "@/components/OnboardingShell";
import { requireProfile } from "@/lib/profile";
import { ArtistForm } from "./ArtistForm";

export const metadata = { title: "Set up your profile" };

export default async function ArtistOnboardingPage() {
  const { profile } = await requireProfile();
  if (!profile) redirect("/dashboard");
  if (profile.role !== "artist") redirect(`/onboarding/${profile.role}`);

  return (
    <OnboardingShell
      role="artist"
      title="Set up your profile"
      subtitle="Artist or event organiser — tell brands who you are and what you can offer as a sponsorship partner."
    >
      <ArtistForm mode="onboarding" />
    </OnboardingShell>
  );
}
