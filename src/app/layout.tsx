import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Live-En-Synergy — Performance-based sponsorship for live events",
    template: "%s · Live-En-Synergy",
  },
  description:
    "Live-En-Synergy transforms sponsorship into a performance-based engagement model where brands, artists and audiences all win.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
