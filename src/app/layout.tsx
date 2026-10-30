import type { Metadata } from "next";
import { Albert_Sans, Big_Shoulders, DM_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";

const albertSans = Albert_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-albert-sans",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

// The public site's poster headings (the Figma site design, #82). Google
// merged "Big Shoulders Display" into "Big Shoulders".
const bigShoulders = Big_Shoulders({
  subsets: ["latin"],
  weight: ["800", "900"],
  variable: "--font-big-shoulders",
  display: "swap",
  // Next has no metrics for this family, so name close condensed fallbacks
  // instead of letting it guess (it warns and skips otherwise).
  adjustFontFallback: false,
  fallback: ["Impact", "Arial Narrow", "sans-serif"],
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "600"],
  variable: "--font-playfair",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Live·En·Synergy — Performance-based partnership for live events",
    template: "%s · Live·En·Synergy",
  },
  description:
    "Live·En·Synergy transforms partnership into a performance-based engagement model where brands, artists and audiences all win.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${albertSans.variable} ${dmSans.variable} ${playfairDisplay.variable} ${bigShoulders.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
