export const metadata = { title: "FAQs" };

const FAQS = [
  {
    q: "How does Live-En-Synergy work?",
    a: "Brands set a sponsorship campaign with a budget and reward rules. We match them to a fitting artist or event. Audiences register and attend, and once their attendance is verified, sponsor-funded rewards — like ticket reimbursements — are released.",
  },
  {
    q: "Is there a minimum sponsorship budget?",
    a: "No. There's no minimum amount you can allocate for sponsorship. Live-En-Synergy charges a minimum of £315 + VAT or 9% + VAT of the sponsorship budget, whichever is higher.",
  },
  {
    q: "How do audiences get rewarded?",
    a: "Each event sets its own reward rule — for example, the first 50 sign-ups, a random draw, or attendees from a particular area. Once you attend and your attendance is verified, your reward is released.",
  },
  {
    q: "How is attendance verified?",
    a: "In two steps: first you upload proof such as your ticket, and second your physical attendance is confirmed at the venue (for example via a QR code scan or box-office data).",
  },
  {
    q: "What do brands get in return?",
    a: "Brands are the sponsors of the event and receive branding value — social media content, mentions, collaborations, logos on event materials, and onsite experiential presence such as roll-up banners and merch stations.",
  },
  {
    q: "Are my personal details safe?",
    a: "Your details are only used to verify attendance and release rewards, and are never shared without your consent. You choose what you're comfortable sharing.",
  },
];

export default function FaqsPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <span className="chip">FAQs</span>
      <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
        Frequently asked questions
      </h1>
      <div className="mt-8 space-y-3">
        {FAQS.map((item) => (
          <details
            key={item.q}
            className="card group p-5 [&_summary]:cursor-pointer"
          >
            <summary className="flex items-center justify-between font-semibold">
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
