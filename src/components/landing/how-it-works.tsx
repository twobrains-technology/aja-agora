import { MessageCircle, Search, CheckCircle } from "lucide-react";
import { ScrollFade } from "./scroll-fade";

const steps = [
  {
    icon: MessageCircle,
    step: "01",
    title: "Diga o que quer",
    description:
      "Conte seu sonho: um carro, imovel, ou servico. Sem formularios, sem burocracia.",
  },
  {
    icon: Search,
    step: "02",
    title: "Receba recomendacoes",
    description:
      "Nosso consultor analisa centenas de grupos e encontra o melhor pra voce.",
  },
  {
    icon: CheckCircle,
    step: "03",
    title: "Escolha e assine",
    description:
      "Revise a recomendacao, tire duvidas, e assine. Tudo no chat.",
  },
];

export function HowItWorks() {
  return (
    <section
      id="como-funciona"
      className="bg-muted/30 px-4 py-20 sm:px-6 sm:py-28 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        {/* Section header */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Como funciona
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Tres passos simples para o seu consorcio ideal
          </p>
        </div>

        {/* Steps grid */}
        <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-12">
          {steps.map((item, i) => (
            <ScrollFade key={item.step} delay={i * 0.1}>
              <div className="group relative flex flex-col items-center text-center">
                {/* Connector line (hidden on mobile, visible between cards on sm+) */}
                {i < steps.length - 1 && (
                  <div
                    aria-hidden="true"
                    className="absolute top-10 left-[calc(50%+2.5rem)] hidden h-0.5 w-[calc(100%-5rem)] bg-gradient-to-r from-primary/30 to-primary/10 sm:block"
                  />
                )}

                {/* Icon container */}
                <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                  <item.icon className="h-8 w-8" strokeWidth={1.5} />
                  <span className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {item.step}
                  </span>
                </div>

                {/* Text */}
                <h3 className="mt-6 text-xl font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-3 max-w-xs text-base text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </ScrollFade>
          ))}
        </div>
      </div>
    </section>
  );
}
