"use client";

import { ScrollReveal, StaggerChildren, StaggerItem } from "./scroll-reveal";
import { Card, CardContent } from "@/components/ui/card";

const steps = [
  {
    number: "1",
    title: "Diga o que quer",
    description:
      "Conte seu sonho: um carro, imóvel ou serviço. Nosso consultor entende suas necessidades.",
  },
  {
    number: "2",
    title: "Receba recomendações",
    description:
      "A IA analisa centenas de grupos e encontra o melhor plano para seu bolso e prazo.",
  },
  {
    number: "3",
    title: "Escolha e assine",
    description:
      "Compare opções, simule parcelas e feche seu consórcio. Tudo dentro do chat.",
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="py-8 sm:py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="mb-12 space-y-4 sm:mb-16 lg:mb-24">
            <h2 className="font-serif text-2xl font-semibold md:text-3xl lg:text-4xl">
              Como funciona
            </h2>
            <p className="text-muted-foreground text-xl">
              Três passos simples para encontrar o consórcio ideal para você.
            </p>
          </div>
        </ScrollReveal>

        <StaggerChildren
          className="relative grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          staggerDelay={0.15}
        >
          {/* Connecting dotted line (desktop only) */}
          <div className="pointer-events-none absolute top-14 right-[calc(33.333%+1rem)] left-[calc(16.666%-0.5rem)] hidden h-px border-t-2 border-dashed border-primary/30 lg:block" />
          <div className="pointer-events-none absolute top-14 right-[calc(16.666%-0.5rem)] left-[calc(33.333%+1rem)] hidden h-px border-t-2 border-dashed border-primary/30 lg:block" />

          {steps.map((step) => (
            <StaggerItem key={step.number}>
              <Card className="shadow-none transition-colors duration-300 hover:border-primary">
                <CardContent>
                  <div className="bg-primary text-primary-foreground mb-6 flex size-10 items-center justify-center rounded-full text-lg font-bold">
                    {step.number}
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerChildren>
      </div>
    </section>
  );
}
