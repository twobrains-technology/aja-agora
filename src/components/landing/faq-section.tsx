import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "O que e consorcio?",
    answer:
      "Consorcio e uma forma de compra colaborativa onde um grupo de pessoas contribui mensalmente para um fundo comum. Periodicamente, um participante e contemplado e recebe o credito para realizar sua compra.",
  },
  {
    question: "O Aja Agora e seguro?",
    answer:
      "Sim. Trabalhamos apenas com administradoras autorizadas pelo Banco Central. Seus dados sao protegidos e nunca compartilhados.",
  },
  {
    question: "Preciso pagar para usar?",
    answer:
      "Nao. A consulta e a recomendacao sao 100% gratuitas. Voce so paga quando decidir aderir a um grupo de consorcio.",
  },
  {
    question: "Quanto tempo demora para ser contemplado?",
    answer:
      "Depende do grupo e da modalidade (lance ou sorteio). Nosso consultor mostra o historico de contemplacao de cada grupo para voce decidir com informacao.",
  },
];

export function FaqSection() {
  return (
    <section id="faq" className="px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
      <div className="mx-auto max-w-3xl">
        {/* Section header */}
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Perguntas frequentes
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Tudo o que voce precisa saber sobre consorcio e o Aja Agora
          </p>
        </div>

        {/* Accordion */}
        <Accordion className="mt-12">
          {faqs.map((faq, i) => (
            <AccordionItem key={i} value={`item-${i}`}>
              <AccordionTrigger className="text-left text-base font-medium">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-base text-muted-foreground">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
