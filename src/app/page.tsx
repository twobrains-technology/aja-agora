import { Navbar } from "@/components/landing/navbar";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <Navbar />
      {/* Landing page sections will be added by Plan 01 (hero, how-it-works, benefits, social-proof, cta, footer) */}
      <section className="flex flex-1 items-center justify-center pt-16">
        <p className="text-muted-foreground">Landing page sections loading...</p>
      </section>
    </main>
  );
}
