import { FAQS } from "@/lib/faqs";

export const metadata = { title: "FAQs" };

export default function FaqsPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 md:py-24">
      <span className="chip">FAQs</span>
      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-4xl">
        Frequently asked questions
      </h1>
      <p className="mt-3 text-[var(--color-ink-soft)]">
        The short answers. Reach out if you want the long ones.
      </p>
      <div className="mt-8 space-y-3">
        {FAQS.map((item) => (
          <details
            key={item.q}
            className="card group p-5 [&_summary]:cursor-pointer"
          >
            <summary className="flex items-center justify-between font-display font-semibold text-[var(--color-ink)]">
              {item.q}
              <span className="text-[var(--color-brand)] transition group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-sm text-[var(--color-ink-soft)]">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
