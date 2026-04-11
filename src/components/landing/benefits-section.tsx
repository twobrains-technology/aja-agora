import {
  Zap,
  Shield,
  Smartphone,
  Bot,
  DollarSign,
  Clock,
} from "lucide-react";
import { ScrollFade } from "./scroll-fade";

const benefits = [
  {
    icon: Zap,
    title: "Rapido",
    description: "Recomendacao em segundos, nao dias.",
  },
  {
    icon: Shield,
    title: "Transparente",
    description: "Taxas, custos e simulacoes abertas, sem surpresas.",
  },
  {
    icon: Smartphone,
    title: "100% digital",
    description: "Do sonho a assinatura sem sair do celular.",
  },
  {
    icon: Bot,
    title: "IA especialista",
    description: "Consultor que entende de consorcio de verdade.",
  },
  {
    icon: DollarSign,
    title: "Sem corretor",
    description: "Economize a comissao do intermediario.",
  },
  {
    icon: Clock,
    title: "Disponivel 24h",
    description: "Converse quando quiser, sem agendamento.",
  },
];

export function BenefitsSection() {
  return (
    <section
      id="beneficios"
      className="px-4 py-20 sm:px-6 sm:py-28 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        {/* Section header */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Por que usar o Aja Agora?
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            A forma mais inteligente de encontrar seu consorcio
          </p>
        </div>

        {/* Benefits grid */}
        <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((benefit, i) => (
            <ScrollFade key={benefit.title} delay={i * 0.1}>
              <div className="group relative rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/30 hover:bg-primary/5">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                  <benefit.icon className="h-6 w-6" strokeWidth={1.5} />
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  {benefit.title}
                </h3>
                <p className="mt-2 text-base text-muted-foreground">
                  {benefit.description}
                </p>
              </div>
            </ScrollFade>
          ))}
        </div>
      </div>
    </section>
  );
}
