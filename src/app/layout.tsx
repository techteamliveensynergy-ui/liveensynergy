import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

/*
 * Fonts are self-hosted from the @fontsource packages (WOFF2 files shipped in
 * node_modules), not fetched from Google at build time. next/font/google
 * downloads CSS from fonts.googleapis.com on every build, and when that
 * response came back unparseable the whole deploy failed with
 * "TypeError: Cannot read properties of null (reading '1')" (preview deploy of
 * 074e814). A font CDN hiccup must never be able to stop a release.
 */
const albertSans = localFont({
  src: "../../node_modules/@fontsource-variable/albert-sans/files/albert-sans-latin-wght-normal.woff2",
  weight: "300 700",
  variable: "--font-albert-sans",
  display: "swap",
});

const dmSans = localFont({
  src: "../../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2",
  weight: "400 700",
  variable: "--font-dm-sans",
  display: "swap",
});

// The public site's poster headings (the Figma site design, #82). Google
// merged "Big Shoulders Display" into "Big Shoulders".
const bigShoulders = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource/big-shoulders/files/big-shoulders-latin-800-normal.woff2",
      weight: "800",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/big-shoulders/files/big-shoulders-latin-900-normal.woff2",
      weight: "900",
      style: "normal",
    },
  ],
  variable: "--font-big-shoulders",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Impact", "Arial Narrow", "sans-serif"],
});

const playfairDisplay = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2",
      weight: "400 900",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource-variable/playfair-display/files/playfair-display-latin-wght-italic.woff2",
      weight: "400 900",
      style: "italic",
    },
  ],
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
