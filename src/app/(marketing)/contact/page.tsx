import { createClient } from "@/lib/supabase/server";
import { ContactForm } from "./ContactForm";

export const metadata = { title: "Contact us" };

/**
 * The enquiry form.
 *
 * Reached from the public site, and — since the 10 Aug standup — from a
 * sponsorship, campaign or listing via `?ref=SPE-00003&subject=…`, opened in a
 * new tab so the page you were asking about stays where it was. The reference
 * travels with the enquiry so the team knows what it's about without asking,
 * and a signed-in visitor doesn't retype their own name and email.
 */
export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; subject?: string }>;
}) {
  const { ref, subject } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle<{ full_name: string | null; email: string | null }>()
    : { data: null };

  return (
    <div className="bg-[var(--color-lavender)]">
      <div className="mx-auto max-w-3xl px-5 py-16 md:py-24">
        <span className="chip">Contact</span>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-4xl">
          Get in touch
        </h1>
        <p className="mt-3 text-[var(--color-ink-soft)]">
          Questions, partnerships, press — send them our way. Whether you want
          to sponsor, list an event, or join as an audience member, our team
          will get back to you.
        </p>

        <ContactForm
          reference={ref ?? null}
          defaultSubject={subject ?? null}
          defaultName={profile?.full_name ?? null}
          defaultEmail={profile?.email ?? user?.email ?? null}
        />
      </div>
    </div>
  );
}
