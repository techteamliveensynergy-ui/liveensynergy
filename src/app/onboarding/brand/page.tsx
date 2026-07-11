import { redirect } from "next/navigation";
import { OnboardingShell } from "@/components/OnboardingShell";
import { requireProfile } from "@/lib/profile";
import { BrandForm } from "./BrandForm";

export const metadata = { title: "Set up your brand" };

export default async function BrandOnboardingPage() {
  const { profile } = await requireProfile();
  if (!profile) redirect("/dashboard");
  if (profile.role !== "brand") redirect(`/onboarding/${profile.role}`);

  return (
    <OnboardingShell
      role="brand"
      title="Set up your brand profile"
      subtitle="Complete your profile so our team can match you with the right artists and events."
    >
      <BrandForm mode="onboarding" />
    </OnboardingShell>
  );
}
