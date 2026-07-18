import { FaqSection } from "@/components/landing/faq-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingHero } from "@/components/landing/landing-hero";
import { PlatformSection } from "@/components/landing/platform-section";
import { PricingSection } from "@/components/landing/pricing-section";
import { SolutionsSection } from "@/components/landing/solutions-section";
import { WhyDomeraSection } from "@/components/landing/why-domera-section";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-slate-950">
      <LandingHeader />
      <main>
        <LandingHero />
        <WhyDomeraSection />
        <FeaturesSection />
        <PlatformSection />
        <SolutionsSection />
        <PricingSection />
        <FaqSection />
      </main>
      <LandingFooter />
    </div>
  );
}
