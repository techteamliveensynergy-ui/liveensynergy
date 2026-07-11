import { redirect } from "next/navigation";
import { OnboardingShell } from "@/components/OnboardingShell";
import { requireProfile } from "@/lib/profile";
import { EventForm } from "./EventForm";

export const metadata = { title: "Set up your event profile" };

export default async function EventOnboardingPage() {
  const { profile } = await requireProfile();
  if (!profile) redirect("/dashboard");
  if (profile.role !== "event") redirect(`/onboarding/${profile.role}`);

  return (
    <OnboardingShell
      role="event"
      title="Set up your event profile"
      subtitle="Tell brands about your event and what you can offer as a sponsorship partner."
    >
      <EventForm mode="onboarding" />
    </OnboardingShell>
  );
}
