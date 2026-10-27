"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/profile";
import { uploadImage } from "@/lib/storage";
import { contrastRatio, EMAIL_FONTS, loadEmailBranding, renderEmailText, type EmailFontKey } from "@/lib/email/branding";
import { renderEmailHtml } from "@/lib/email/layout";
import { sendViaResend } from "@/lib/email/resend";
import { SAMPLE_EMAIL } from "./sample";

export interface BrandingState {
  error?: string;
  message?: string;
}

const PAGE = "/dashboard/admin/settings/email";
const HEX = /^#[0-9a-f]{6}$/i;
// PNG/JPG only: Gmail and Outlook drop SVG, and WebP/AVIF aren't safe in
// older clients.
const LOGO_TYPES = ["image/png", "image/jpeg"];

function hex(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return HEX.test(s) ? s.toLowerCase() : null;
}

/** Saves the email wrapper (GitHub #66, 0093). Applies to mail sent from now
 *  on — including mail already queued, since HTML is rendered at send time. */
export async function saveEmailBranding(_prev: BrandingState, formData: FormData): Promise<BrandingState> {
  const { supabase, userId } = await requireAdmin();

  const headerBg = hex(formData.get("header_bg"));
  const headerText = hex(formData.get("header_text"));
  if (headerBg && headerText && contrastRatio(headerBg, headerText) < 3) {
    return { error: "The header text is too close in colour to the header background to read. Pick a darker or lighter one." };
  }

  const fontRaw = String(formData.get("font") ?? "system");
  const font: EmailFontKey = fontRaw in EMAIL_FONTS ? (fontRaw as EmailFontKey) : "system";
  const footer = String(formData.get("footer_text") ?? "").trim();
  if (footer.length > 1000) return { error: "Keep the footer text under 1,000 characters." };

  const patch: Record<string, string | null> = {
    header_bg: headerBg,
    header_text: headerText,
    font,
    footer_text: footer || null,
  };

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (!LOGO_TYPES.includes(logo.type)) {
      return { error: "Use a PNG or JPG logo — email clients don't show SVG or WebP reliably." };
    }
    const uploaded = await uploadImage(logo, "email-logo");
    if (uploaded.error) return { error: uploaded.error };
    patch.logo_url = uploaded.url ?? null;
  } else if (formData.get("remove_logo") === "on") {
    patch.logo_url = null;
  }

  const { error } = await supabase
    .from("email_branding")
    .upsert({ id: true, ...patch, updated_at: new Date().toISOString(), updated_by: userId });
  if (error) return { error: error.message };

  await supabase.rpc("log_admin_action", {
    p_action: "email.branding_update",
    p_target_type: "email_branding",
    p_target_id: "default",
    p_detail: { ...patch },
  });

  revalidatePath(PAGE);
  return { message: "Email branding saved. It applies to every email sent from now on." };
}

/** Sends the sample email with the saved branding to the admin's own address
 *  — or to EMAIL_REDIRECT_TO outside production, like every other email. */
export async function sendBrandingTest(_prev: BrandingState): Promise<BrandingState> {
  const { supabase, userId } = await requireAdmin();
  const { data: allowed } = await supabase.rpc("rate_limit_hit", {
    p_action: "email_branding_test",
    p_window_seconds: 600,
    p_max: 5,
  });
  if (allowed !== true) return { error: "Too many test emails in a short time — wait a few minutes." };

  const { data: me } = await supabase.from("profiles").select("email").eq("id", userId).maybeSingle<{ email: string | null }>();
  const isProduction = process.env.VERCEL_ENV === "production";
  const redirectTo = process.env.EMAIL_REDIRECT_TO?.trim() || null;
  const to = isProduction ? me?.email : redirectTo;
  if (!to) {
    return {
      error: isProduction
        ? "Your account has no email address to send the test to."
        : "Outside production, email only goes to EMAIL_REDIRECT_TO, and it isn't set.",
    };
  }

  const branding = await loadEmailBranding(supabase);
  const outcome = await sendViaResend({
    id: crypto.randomUUID(),
    to,
    subject: `[Test] ${SAMPLE_EMAIL.subject}`,
    text: renderEmailText(SAMPLE_EMAIL.body, branding),
    html: renderEmailHtml(SAMPLE_EMAIL, branding),
  });
  if (!outcome.ok) return { error: `The test didn't send: ${outcome.error}` };
  return { message: `Test sent to ${to}.` };
}
