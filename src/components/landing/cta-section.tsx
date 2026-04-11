import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function CtaSection() {
  return (
    <section
      id="cta"
      className="relative overflow-hidden px-4 py-20 sm:px-6 sm:py-28 lg:px-8"
    >
      {/* Background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-primary/5 to-background"
      />

      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Pronto para realizar seu sonho?
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          Converse com nosso consultor agora e descubra o melhor consorcio pra
          voce. E rapido, gratis e sem compromisso.
        </p>
        <div className="mt-10">
          <Link href="/chat">
            <Button
              size="lg"
              className="h-14 cursor-pointer px-8 text-lg font-semibold shadow-lg shadow-primary/25 transition-shadow hover:shadow-xl hover:shadow-primary/30"
            >
              Comecar agora
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
