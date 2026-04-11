import type { ComponentType } from "react";
import {
  Smartphone,
  Zap,
  Bot,
  Eye,
  MonitorSmartphone,
  ShieldCheck,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Benefit = {
  icon: ComponentType;
  title: string;
  description: string;
  cardBorderColor: string;
  avatarTextColor: string;
  avatarBgColor: string;
};

const benefits: Benefit[] = [
  {
    icon: Smartphone,
    title: "100% digital",
    description: "Sem papel, sem agência, sem filas.",
    cardBorderColor: "hover:border-primary",
    avatarTextColor: "text-primary",
    avatarBgColor: "bg-primary/10",
  },
  {
    icon: Zap,
    title: "Análise em segundos",
    description: "A IA compara planos instantaneamente.",
    cardBorderColor: "hover:border-primary",
    avatarTextColor: "text-primary",
    avatarBgColor: "bg-primary/10",
  },
  {
    icon: Bot,
    title: "Sem corretor",
    description: "Você conversa direto com a IA.",
    cardBorderColor: "hover:border-primary",
    avatarTextColor: "text-primary",
    avatarBgColor: "bg-primary/10",
  },
  {
    icon: Eye,
    title: "Transparência total",
    description: "Taxas, custos e simulações claras.",
    cardBorderColor: "hover:border-primary",
    avatarTextColor: "text-primary",
    avatarBgColor: "bg-primary/10",
  },
  {
    icon: MonitorSmartphone,
    title: "Mobile-first",
    description: "Funciona perfeitamente no celular.",
    cardBorderColor: "hover:border-primary",
    avatarTextColor: "text-primary",
    avatarBgColor: "bg-primary/10",
  },
  {
    icon: ShieldCheck,
    title: "Dados protegidos",
    description: "Suas informações estão seguras.",
    cardBorderColor: "hover:border-primary",
    avatarTextColor: "text-primary",
    avatarBgColor: "bg-primary/10",
  },
];

export function BenefitsSection() {
  return (
    <section id="beneficios" className="py-8 sm:py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 space-y-4 sm:mb-16 lg:mb-24">
          <h2 className="text-2xl font-semibold md:text-3xl lg:text-4xl">
            Por que usar o Aja Agora?
          </h2>
          <p className="text-muted-foreground text-xl">
            A forma mais inteligente de encontrar seu consórcio.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((benefit, index) => (
            <Card
              key={index}
              className={cn(
                "shadow-none transition-colors duration-300",
                benefit.cardBorderColor
              )}
            >
              <CardContent>
                <Avatar className="mb-6 size-10 rounded-md">
                  <AvatarFallback
                    className={cn(
                      "rounded-md [&>svg]:size-6",
                      benefit.avatarBgColor,
                      benefit.avatarTextColor
                    )}
                  >
                    <benefit.icon />
                  </AvatarFallback>
                </Avatar>
                <h6 className="mb-2 text-lg font-semibold">{benefit.title}</h6>
                <p className="text-muted-foreground">{benefit.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
