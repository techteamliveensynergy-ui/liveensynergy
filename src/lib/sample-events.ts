/**
 * Sample events used to populate the marketing pages before real listings
 * exist in the database. The landing/events pages fall back to these when the
 * `event_listings` table is empty or unreachable.
 */
export interface SampleEvent {
  id: string;
  name: string;
  artist: string;
  category: string;
  city: string;
  country: string;
  date: string;
  ticketPriceGbp: number;
  budgetRange: string;
  rewardRule: string;
}

export const SAMPLE_EVENTS: SampleEvent[] = [
  {
    id: "sample-1",
    name: "Summer Beats Festival",
    artist: "The Midnight Collective",
    category: "Music",
    city: "Manchester",
    country: "United Kingdom",
    date: "2026-08-14",
    ticketPriceGbp: 30,
    budgetRange: "£5,000 – £10,000",
    rewardRule: "First 50 sign-ups get a full ticket refund",
  },
  {
    id: "sample-2",
    name: "Laughing Matters — Live Stand-Up",
    artist: "Priya Nair",
    category: "Comedy",
    city: "London",
    country: "United Kingdom",
    date: "2026-09-02",
    ticketPriceGbp: 18,
    budgetRange: "£1,000 – £2,500",
    rewardRule: "Random 30 attendees reimbursed",
  },
  {
    id: "sample-3",
    name: "Neon Canvas — Digital Art Night",
    artist: "Studio Aurora",
    category: "Visual Artists",
    city: "Bristol",
    country: "United Kingdom",
    date: "2026-09-20",
    ticketPriceGbp: 22,
    budgetRange: "£2,500 – £5,000",
    rewardRule: "First 20 sign-ups from local universities",
  },
];
