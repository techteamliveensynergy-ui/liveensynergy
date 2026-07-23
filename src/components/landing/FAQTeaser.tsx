import Link from "next/link";
import { FAQS } from "@/lib/faqs";

export function FAQTeaser() {
  const items = FAQS.slice(0, 4);
  return (
    <section className="mx-auto max-w-4xl px-5 py-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-serif text-[var(--color-ink-soft)]">
            The short answers
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-4xl">
            Frequently asked
          </h2>
        </div>
        <Link href="/faqs" className="btn btn-ghost">
          All FAQs →
        </Link>
      </div>
      <div className="mt-8 space-y-3">
        {items.map((item) => (
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
    </section>
  );
}
