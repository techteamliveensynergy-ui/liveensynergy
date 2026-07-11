import { Field } from "@/components/ui/Field";

export const metadata = { title: "Contact us" };

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <span className="chip">Contact</span>
      <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
        Get in touch
      </h1>
      <p className="mt-3 text-[var(--color-ink-soft)]">
        Have a question about sponsoring, listing an event, or joining as an
        audience member? Send us a message and our team will get back to you.
      </p>

      <form className="card mt-8 grid gap-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" htmlFor="name" required>
            <input id="name" name="name" className="input" required />
          </Field>
          <Field label="Email" htmlFor="email" required>
            <input id="email" name="email" type="email" className="input" required />
          </Field>
        </div>
        <Field label="Subject" htmlFor="subject">
          <input id="subject" name="subject" className="input" />
        </Field>
        <Field label="Message" htmlFor="message" required>
          <textarea id="message" name="message" className="textarea" required />
        </Field>
        <div className="flex justify-end">
          <button type="submit" className="btn btn-primary">
            Send message
          </button>
        </div>
      </form>
    </div>
  );
}
