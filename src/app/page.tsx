import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Hero } from "@/components/landing/Hero";
import { ValueProps } from "@/components/landing/ValueProps";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Stats } from "@/components/landing/Stats";
import { EventsPreview } from "@/components/landing/EventsPreview";
import { Pricing } from "@/components/landing/Pricing";
import { Testimonials } from "@/components/landing/Testimonials";
import { FAQTeaser } from "@/components/landing/FAQTeaser";
import { CTA } from "@/components/landing/CTA";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <ValueProps />
        <HowItWorks />
        <Stats />
        <EventsPreview />
        <Pricing />
        <Testimonials />
        <FAQTeaser />
        <CTA />
      </main>
      <SiteFooter />
    </>
  );
}
