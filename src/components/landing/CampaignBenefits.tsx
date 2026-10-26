/**
 * What a brand campaign delivers, in the words of Sakshi's Packages Details
 * brief (docs/New-model, #37). The per-package matrix isn't written yet, so
 * this lists the pillars and says the extent depends on the package.
 */
const BENEFITS = [
  { title: "Reach", body: "Put your brand in front of real live-event audiences." },
  { title: "Targeting", body: "Define your audience by demographics, interests and event type." },
  { title: "Research", body: "Collect targeted consumer feedback through a custom research survey." },
  { title: "Engagement", body: "Incentivise genuine participation with a tangible consumer benefit." },
  { title: "Brand awareness", body: "Build awareness through branded campaign touchpoints you can measure." },
  { title: "Emotional brand impact", body: "Associate your brand with a positive experience people value." },
  { title: "Insights", body: "Understand your audience through demographics, responses and findings." },
  { title: "Measurement", body: "See reach, engagement and brand perception in a performance report." },
  { title: "Campaign management", body: "We run it from setup and recruitment to rewards and reporting." },
];

export function CampaignBenefits() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <div className="max-w-2xl">
        <p className="font-serif text-[var(--color-ink-soft)]">For brands</p>
        <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-4xl">
          What a campaign gives you
        </h2>
        <p className="mt-4 text-lg text-[var(--color-ink-soft)]">
          How much of each you get depends on the package you choose.
        </p>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BENEFITS.map((b) => (
          <div key={b.title} className="card p-5">
            <h3 className="font-display font-semibold text-[var(--color-ink)]">
              {b.title}
            </h3>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{b.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
