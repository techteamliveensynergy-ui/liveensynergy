import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import { loadEmailBranding } from "@/lib/email/branding";
import { renderEmailHtml } from "@/lib/email/layout";
import { BrandingForm } from "./BrandingForm";
import { SAMPLE_EMAIL } from "./sample";

export const metadata = { title: "Email branding · Admin" };

/**
 * The wrapper around every email — logo, header colours, font, footer
 * (GitHub #66, 0093). Each email's own wording stays under Notification
 * setup.
 */
export default async function EmailBrandingPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const branding = await loadEmailBranding(supabase);
  const preview = renderEmailHtml(SAMPLE_EMAIL, branding);

  return (
    <div>
      <PageHeader
        title="Email branding"
        subtitle="How every email from Live·En·Synergy looks. Each email's own wording is under Notification setup."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <BrandingForm branding={branding} />
        <div className="card overflow-hidden">
          <p className="border-b border-black/10 px-4 py-2 text-xs font-semibold text-[var(--color-ink-soft)]">
            Preview — saved branding, sample message
          </p>
          {/* Sandboxed: no scripts, no navigation, nothing from the email
              can reach this page. */}
          <iframe title="Email preview" srcDoc={preview} sandbox="" className="h-[560px] w-full bg-white" />
        </div>
      </div>
    </div>
  );
}
