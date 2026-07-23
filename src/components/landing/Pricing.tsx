export function Pricing() {
  return (
    <section className="bg-[var(--color-ink)] text-white">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <div>
            <span className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-white">
              Simple, transparent pricing
            </span>
            <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              No minimum sponsorship budget
            </h2>
            <p className="mt-4 text-lg text-white/70">
              There&apos;s no minimum amount you can allocate. Live·En·Synergy
              charges a minimum of{" "}
              <span className="font-semibold text-white">£315 + VAT</span> or{" "}
              <span className="font-semibold text-white">9% + VAT</span> of the
              sponsorship budget — whichever is higher.
            </p>
          </div>
          <div className="grid gap-4">
            <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
              <p className="text-sm text-white/60">Example — £1,000 budget</p>
              <p className="mt-1 text-lg">
                Service fee <span className="font-semibold">£378 inc. VAT</span>
              </p>
              <p className="text-white/70">
                Available for sponsorship:{" "}
                <span className="font-semibold text-[var(--color-gold)]">
                  £622
                </span>
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
              <p className="text-sm text-white/60">Example — £4,000 budget</p>
              <p className="mt-1 text-lg">
                Service fee <span className="font-semibold">£432 inc. VAT</span>
              </p>
              <p className="text-white/70">
                Available for sponsorship:{" "}
                <span className="font-semibold text-[var(--color-gold)]">
                  £3,568
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
