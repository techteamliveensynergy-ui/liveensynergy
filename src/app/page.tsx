import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Hero } from "@/components/landing/Hero";
import { ValueProps } from "@/components/landing/ValueProps";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Stats } from "@/components/landing/Stats";
import { LiveSponsoredEvents } from "@/components/landing/LiveSponsoredEvents";
import { CampaignBenefits } from "@/components/landing/CampaignBenefits";
import { Pricing } from "@/components/landing/Pricing";
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
        {/* Real events only; renders nothing when none are open. */}
        <LiveSponsoredEvents />
        <CampaignBenefits />
        <Pricing />
        <FAQTeaser />
        <CTA />
      </main>
      <SiteFooter />
    </>
  );
}
