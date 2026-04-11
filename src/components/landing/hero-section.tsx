import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";

export function HeroSection() {
  return (
    <section
      id="hero"
      className="relative flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center overflow-hidden px-4 pt-20 pb-16 sm:px-6 lg:px-8"
    >
      {/* Background gradient */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-background to-background"
      />

      {/* Decorative circles */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/4 -left-32 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 bottom-1/4 h-48 w-48 rounded-full bg-accent/15 blur-3xl"
      />

      <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
          <MessageCircle className="h-4 w-4" />
          <span>Consultor de consorcio com IA</span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
          Seu consorcio, do sonho{" "}
          <span className="text-primary">a assinatura</span>
        </h1>

        {/* Sub-headline */}
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
          Converse com nosso consultor de IA e receba recomendacoes
          personalizadas de consorcio em segundos. 100% digital, sem corretor,
          sem formulario.
        </p>

        {/* CTA */}
        <div className="mt-10 flex flex-col items-center gap-4">
          <Link href="/chat">
            <Button
              size="lg"
              className="h-14 cursor-pointer px-8 text-lg font-semibold shadow-lg shadow-primary/25 transition-shadow hover:shadow-xl hover:shadow-primary/30"
            >
              Comecar agora
            </Button>
          </Link>
          <p className="text-sm text-muted-foreground">
            Gratis, sem compromisso
          </p>
        </div>
      </div>
    </section>
  );
}
