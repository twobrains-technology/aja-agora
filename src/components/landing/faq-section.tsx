"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollReveal } from "./scroll-reveal";

const faqItems = [
  {
    question: "O que é consórcio?",
    answer:
      "Consórcio é uma modalidade de compra programada onde um grupo de pessoas contribui mensalmente para formar uma poupança coletiva.",
  },
  {
    question: "Como funciona a IA?",
    answer:
      "Nosso consultor de IA analisa centenas de grupos disponíveis e encontra o melhor plano baseado no seu perfil, orçamento e prazo.",
  },
  {
    question: "Preciso pagar algo para usar?",
    answer:
      "Não! A consulta com nosso consultor de IA é totalmente gratuita. Você só paga quando decidir assinar um consórcio.",
  },
  {
    question: "É seguro?",
    answer:
      "Sim. Seus dados são protegidos e nunca compartilhados. O consórcio é regulado pelo Banco Central do Brasil.",
  },
];

export function FaqSection() {
  return (
    <section id="faq" className="py-8 sm:py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="mb-12 space-y-4 text-center sm:mb-16 lg:mb-24">
            <h2 className="font-serif text-2xl font-semibold md:text-3xl lg:text-4xl">
              Perguntas frequentes
            </h2>
            <p className="text-muted-foreground text-xl">
              Tudo o que você precisa saber sobre consórcio e o Aja Agora.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <Accordion className="w-full" defaultValue={["item-1"]}>
            {faqItems.map((item, index) => (
              <AccordionItem key={index} value={`item-${index + 1}`}>
                <AccordionTrigger className="text-lg">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </ScrollReveal>
      </div>
    </section>
  );
}
