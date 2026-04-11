import type { ComponentType } from "react";
import { MessageCircle, Search, CheckCircle } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Step = {
  icon: ComponentType;
  title: string;
  description: string;
  cardBorderColor: string;
  avatarTextColor: string;
  avatarBgColor: string;
};

const steps: Step[] = [
  {
    icon: MessageCircle,
    title: "Diga o que quer",
    description:
      "Conte seu sonho: um carro, imóvel ou serviço. Nosso consultor entende suas necessidades.",
    cardBorderColor: "hover:border-primary",
    avatarTextColor: "text-primary",
    avatarBgColor: "bg-primary/10",
  },
  {
    icon: Search,
    title: "Receba recomendações",
    description:
      "A IA analisa centenas de grupos e encontra o melhor plano para seu bolso e prazo.",
    cardBorderColor: "hover:border-primary",
    avatarTextColor: "text-primary",
    avatarBgColor: "bg-primary/10",
  },
  {
    icon: CheckCircle,
    title: "Escolha e assine",
    description:
      "Compare opções, simule parcelas e feche seu consórcio. Tudo dentro do chat.",
    cardBorderColor: "hover:border-primary",
    avatarTextColor: "text-primary",
    avatarBgColor: "bg-primary/10",
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="py-8 sm:py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 space-y-4 sm:mb-16 lg:mb-24">
          <h2 className="text-2xl font-semibold md:text-3xl lg:text-4xl">
            Como funciona
          </h2>
          <p className="text-muted-foreground text-xl">
            Três passos simples para encontrar o consórcio ideal para você.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((step, index) => (
            <Card
              key={index}
              className={cn(
                "shadow-none transition-colors duration-300",
                step.cardBorderColor
              )}
            >
              <CardContent>
                <Avatar className="mb-6 size-10 rounded-md">
                  <AvatarFallback
                    className={cn(
                      "rounded-md [&>svg]:size-6",
                      step.avatarBgColor,
                      step.avatarTextColor
                    )}
                  >
                    <step.icon />
                  </AvatarFallback>
                </Avatar>
                <h6 className="mb-2 text-lg font-semibold">{step.title}</h6>
                <p className="text-muted-foreground">{step.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
