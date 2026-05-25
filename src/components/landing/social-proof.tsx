"use client";

import Image from "next/image";
import { Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MotionPreset } from "@/components/ui/motion-preset";

const testimonials = [
  {
    name: "Maria S.",
    role: "Compradora de imóvel",
    avatar: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-1.png",
    content:
      "Achei meu consórcio em 5 minutos. Nunca foi tão fácil!",
    rating: 5,
  },
  {
    name: "Carlos R.",
    role: "Comprador de automóvel",
    avatar: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-2.png",
    content:
      "A IA me mostrou opções que nenhum corretor apresentou.",
    rating: 5,
  },
  {
    name: "Ana L.",
    role: "Consórcio de serviços",
    avatar: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-3.png",
    content:
      "Simulei diferentes cenários até encontrar a parcela ideal.",
    rating: 5,
  },
];

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: rating }).map((_, i) => (
        <Star
          key={i}
          className="size-4 fill-foreground text-foreground"
          strokeWidth={1.5}
        />
      ))}
    </div>
  );
}

export function SocialProof() {
  return (
    <section id="depoimentos" className="py-12 sm:py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <MotionPreset fade blur="4px" slide={{ direction: "up", offset: 16 }}>
          <div className="mb-12 space-y-4 text-center sm:mb-16">
            <Badge variant="outline">Depoimentos</Badge>
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl lg:text-4xl">
              O que nossos usuarios dizem
            </h2>
            <p className="text-muted-foreground mx-auto max-w-lg text-lg">
              Experiencias reais de quem ja usou o Aja Agora para encontrar o
              consorcio ideal.
            </p>
          </div>
        </MotionPreset>

        {/* Testimonial Cards */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((testimonial, index) => (
            <MotionPreset
              key={index}
              fade
              blur="4px"
              slide={{ direction: "up", offset: 24 }}
              delay={index * 0.1}
            >
              <Card className="h-full shadow-none transition-colors duration-300 hover:border-foreground/20">
                <CardContent className="flex flex-col gap-5">
                  <StarRating rating={testimonial.rating} />

                  <p className="text-sm leading-relaxed sm:text-base">
                    &ldquo;{testimonial.content}&rdquo;
                  </p>

                  <div className="flex items-center gap-3 pt-2">
                    <Image
                      src={testimonial.avatar}
                      alt={testimonial.name}
                      width={40}
                      height={40}
                      className="size-10 rounded-full object-cover"
                    />
                    <div>
                      <p className="text-sm font-semibold">
                        {testimonial.name}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {testimonial.role}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </MotionPreset>
          ))}
        </div>
      </div>
    </section>
  );
}
