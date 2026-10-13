import { createClient } from "@/lib/supabase/server";
import { VerifyEmailBannerForm } from "./VerifyEmailBannerForm";

/**
 * Top-of-page notice for an account that hasn't proved its email address yet
 * (survey sign-ups, 0069): what was sent, what's on hold until then, and a
 * resend button. Renders nothing once verified — or before 0069 is applied.
 */
export async function VerifyEmailBanner({ required = false }: { required?: boolean }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("role, email_verified_at")
    .eq("id", user.id)
    .maybeSingle<{ role: string; email_verified_at: string | null }>();
  if (error || !data || data.role === "admin" || data.email_verified_at) return null;

  return (
    <div
      role="status"
      className="mb-6 rounded-2xl border border-[var(--color-gold)] bg-[var(--color-gold)]/40 px-5 py-4 text-[var(--color-ink)]"
    >
      <p className="font-semibold">
        {required ? "Please confirm your email address first" : "Confirm your email address"}
      </p>
      <p className="mt-1 text-sm">
        We&apos;ve emailed a link to <strong className="break-all">{user.email}</strong>. Open it to confirm
        this address is yours — it also lets you set your password. Until then you can update your profile
        and settings; signing up for events, rewards and messages unlock once it&apos;s confirmed.
      </p>
      <div className="mt-3">
        <VerifyEmailBannerForm />
      </div>
    </div>
  );
}
