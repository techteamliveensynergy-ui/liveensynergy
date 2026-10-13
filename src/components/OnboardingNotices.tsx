import { Suspense } from "react";
import { EmailConfirmedNotice } from "./EmailConfirmedNotice";
import { VerifyEmailBanner } from "./VerifyEmailBanner";

/** The email notices shown above onboarding (see OnboardingShell's `notices`). */
export function OnboardingNotices() {
  return (
    <>
      <Suspense fallback={null}>
        <EmailConfirmedNotice />
      </Suspense>
      <VerifyEmailBanner />
    </>
  );
}
