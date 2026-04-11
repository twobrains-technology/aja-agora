// TODO: Import Navbar from Plan 02
import { HeroSection } from "@/components/landing/hero-section";
import { HowItWorks } from "@/components/landing/how-it-works";
import { BenefitsSection } from "@/components/landing/benefits-section";
import { SocialProof } from "@/components/landing/social-proof";
import { FaqSection } from "@/components/landing/faq-section";
import { CtaSection } from "@/components/landing/cta-section";
import { Footer } from "@/components/landing/footer";
import { ScrollFade } from "@/components/landing/scroll-fade";

export default function LandingPage() {
  return (
    <main className="flex flex-col">
      {/* <Navbar /> -- Plan 02 */}
      <HeroSection />
      <ScrollFade>
        <HowItWorks />
      </ScrollFade>
      <ScrollFade>
        <BenefitsSection />
      </ScrollFade>
      <ScrollFade>
        <SocialProof />
      </ScrollFade>
      <ScrollFade>
        <FaqSection />
      </ScrollFade>
      <ScrollFade>
        <CtaSection />
      </ScrollFade>
      <Footer />
    </main>
  );
}
