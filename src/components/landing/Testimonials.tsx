const QUOTES = [
  {
    quote:
      "We finally get to see the faces our sponsorship budget reaches — not just an impression count.",
    name: "Jamie Okafor",
    role: "Marketing Lead, Northwave Coffee",
    tint: "bg-[var(--color-lavender)]",
  },
  {
    quote:
      "Live·En·Synergy filled the room before we'd even finished announcing the date. The budget arrived with real reward rules attached.",
    name: "The Midnight Collective",
    role: "Touring artist",
    tint: "bg-[var(--color-sage)]",
  },
  {
    quote:
      "I bought a ticket I was going to buy anyway, showed up, and got reimbursed two days later. No catch.",
    name: "Priya N.",
    role: "Audience member",
    tint: "bg-[var(--color-pink)]",
  },
];

export function Testimonials() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <div className="max-w-2xl">
        <p className="font-serif text-[var(--color-ink-soft)]">In their words</p>
        <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-4xl">
          What brands, artists &amp; audiences say
        </h2>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {QUOTES.map((t) => (
          <figure key={t.name} className={`rounded-2xl p-7 ${t.tint}`}>
            <blockquote className="font-serif text-lg leading-snug text-[var(--color-ink)]">
              “{t.quote}”
            </blockquote>
            <figcaption className="mt-5 text-sm">
              <span className="font-semibold text-[var(--color-ink)]">
                {t.name}
              </span>
              <span className="text-[var(--color-ink-soft)]"> · {t.role}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
