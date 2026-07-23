import { ContactForm } from "./ContactForm";

export const metadata = { title: "Contact us" };

export default function ContactPage() {
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

        <ContactForm />
      </div>
    </div>
  );
}
