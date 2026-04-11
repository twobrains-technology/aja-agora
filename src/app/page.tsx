import { Navbar } from "@/components/landing/navbar";
import { HeroSection } from "@/components/landing/hero-section";
import { HowItWorks } from "@/components/landing/how-it-works";
import { BenefitsSection } from "@/components/landing/benefits-section";
import { SocialProof } from "@/components/landing/social-proof";
import { FaqSection } from "@/components/landing/faq-section";
import { CtaSection } from "@/components/landing/cta-section";
import { Footer } from "@/components/landing/footer";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <Navbar />
      <HeroSection />
      <HowItWorks />
      <BenefitsSection />
      <SocialProof />
      <FaqSection />
      <CtaSection />
      <Footer />
    </main>
  );
}
