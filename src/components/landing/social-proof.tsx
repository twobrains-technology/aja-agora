import { Star, Smartphone, UserX, Timer } from "lucide-react";
import { ScrollFade } from "./scroll-fade";

const testimonials = [
  {
    quote:
      "Nunca imaginei que comprar um consorcio seria tao simples. Em 5 minutos eu tinha a recomendacao perfeita.",
    author: "Maria S.",
    location: "Goiania",
  },
  {
    quote:
      "O consultor me explicou tudo sobre taxas e prazos. Melhor que qualquer corretor.",
    author: "Carlos R.",
    location: "Sao Paulo",
  },
  {
    quote:
      "Fechei meu consorcio de imovel pelo celular, no sofa de casa. Incrivel.",
    author: "Ana P.",
    location: "Brasilia",
  },
];

const trustIndicators = [
  { icon: Smartphone, label: "100% digital" },
  { icon: UserX, label: "Sem corretor" },
  { icon: Timer, label: "Analise em segundos" },
];

export function SocialProof() {
  return (
    <section
      id="depoimentos"
      className="bg-muted/30 px-4 py-20 sm:px-6 sm:py-28 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        {/* Section header */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            O que nossos usuarios dizem
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Experiencias reais de quem ja usou o Aja Agora
          </p>
        </div>

        {/* Testimonials grid */}
        <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
          {testimonials.map((testimonial, i) => (
            <ScrollFade key={testimonial.author} delay={i * 0.1}>
              <div className="flex h-full flex-col rounded-xl border border-border bg-card p-6 shadow-sm">
                {/* Stars */}
                <div className="mb-4 flex gap-1">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star
                      key={j}
                      className="h-4 w-4 fill-primary text-primary"
                    />
                  ))}
                </div>

                {/* Quote */}
                <blockquote className="flex-1 text-base text-foreground">
                  &ldquo;{testimonial.quote}&rdquo;
                </blockquote>

                {/* Author */}
                <div className="mt-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {testimonial.author.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {testimonial.author}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {testimonial.location}
                    </p>
                  </div>
                </div>
              </div>
            </ScrollFade>
          ))}
        </div>

        {/* Trust indicators */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-8 sm:gap-12">
          {trustIndicators.map((indicator) => (
            <div
              key={indicator.label}
              className="flex items-center gap-2 text-muted-foreground"
            >
              <indicator.icon className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">{indicator.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
