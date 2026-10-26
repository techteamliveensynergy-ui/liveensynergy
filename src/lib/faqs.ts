/**
 * Shared FAQ copy — used on the landing page teaser and the full /faqs page.
 * Rewritten for the package / survey / discount-code model (#37); needs
 * Sakshi's sign-off. Prices live in campaign_packages, so they're not quoted.
 */
export const FAQS: { q: string; a: string }[] = [
  {
    q: "How does Live·En·Synergy work?",
    a: "Brands choose a campaign package and tell us who they want to reach. Our team sets up the campaign and its research survey and matches it to suitable live events. Audience members at those events answer the survey and check in at the venue, and responses that pass our quality check earn a sponsor-funded discount code. The brand gets the insights and a campaign performance report.",
  },
  {
    q: "How much does a campaign cost?",
    a: "Campaigns are sold as packages: Starter, Growth and Premium, Enterprise Custom for a larger budget of your choosing, and Enterprise Bespoke on request. You'll find the current prices on our homepage. All prices exclude VAT.",
  },
  {
    q: "How do audiences get rewarded?",
    a: "When you join a sponsored event, you answer the sponsor's short survey. Every response goes through an automatic quality check, and responses that pass receive a discount code. Some responses are reviewed by our team first, which can take a little longer.",
  },
  {
    q: "How is attendance verified?",
    a: "At the venue, scan the event's check-in QR code or follow its link, or check in from your audience portal. Some events may also ask you to upload proof such as your ticket.",
  },
  {
    q: "What do brands get in return?",
    a: "Exposure to live-event audiences, a custom research survey, audience insights and a campaign performance report, with brand presence throughout the campaign and, where agreed, artist social media mentions and onsite branding. What's included depends on the package.",
  },
  {
    q: "What do artists and organisers get?",
    a: "Sponsorship for events you list with us. When a brand campaign fits your event, we match it to you, and you deliver the agreed branding in return.",
  },
  {
    q: "Are my personal details safe?",
    a: "Your details are used to check eligibility, verify attendance and issue your reward. Brands see anonymised results, and your details are never shared without your consent.",
  },
];
