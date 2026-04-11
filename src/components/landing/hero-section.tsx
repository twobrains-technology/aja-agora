"use client";

import Link from "next/link";
import { motion, type Variants } from "motion/react";
import { Bot, User, Car } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const fadeInLeft: Variants = {
  hidden: { opacity: 0, x: -32 },
  visible: (delay: number) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.6, delay, ease: [0.21, 0.47, 0.32, 0.98] as [number, number, number, number] },
  }),
};

const slideInRight: Variants = {
  hidden: { opacity: 0, x: 48 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: "spring" as const, stiffness: 80, damping: 20, delay: 0.3 },
  },
};

const messageFadeIn: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay, ease: "easeOut" as const },
  }),
};

export function HeroSection() {
  return (
    <section className="flex min-h-[calc(100dvh-4rem)] flex-1 flex-col justify-center overflow-x-hidden pt-8 sm:pt-16 lg:pt-24">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-12 px-4 sm:px-6 lg:flex-row lg:gap-16 lg:px-8">
        {/* Left: Copy */}
        <motion.div
          className="flex flex-1 flex-col items-center gap-6 text-center lg:items-start lg:text-left"
          initial="hidden"
          animate="visible"
        >
          <motion.div
            custom={0}
            variants={fadeInLeft}
            className="bg-muted flex items-center gap-2.5 rounded-full border px-3 py-2"
          >
            <Badge>IA</Badge>
            <span className="text-muted-foreground text-sm">
              Consórcio inteligente com IA
            </span>
          </motion.div>

          <motion.h1
            custom={0.1}
            variants={fadeInLeft}
            className="font-serif text-3xl leading-tight font-bold text-balance sm:text-4xl lg:text-5xl"
          >
            Seu consórcio, do sonho
            <br />
            <span className="relative">
              <span className="bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
                à assinatura
              </span>
              <svg
                width="223"
                height="12"
                viewBox="0 0 223 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="absolute inset-x-0 bottom-0 w-full translate-y-1/2 max-sm:hidden"
              >
                <path
                  d="M1.11716 10.428C39.7835 4.97282 75.9074 2.70494 114.894 1.98894C143.706 1.45983 175.684 0.313587 204.212 3.31596C209.925 3.60546 215.144 4.59884 221.535 5.74551"
                  stroke="url(#paint0_linear_hero)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient
                    id="paint0_linear_hero"
                    x1="18.8541"
                    y1="3.72033"
                    x2="42.6487"
                    y2="66.6308"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop stopColor="var(--primary)" />
                    <stop offset="1" stopColor="var(--primary-foreground)" />
                  </linearGradient>
                </defs>
              </svg>
            </span>
          </motion.h1>

          <motion.p
            custom={0.2}
            variants={fadeInLeft}
            className="text-muted-foreground max-w-xl text-lg sm:text-xl"
          >
            Converse com nosso consultor de IA e receba recomendações
            personalizadas de consórcio em segundos. Sem formulário, sem
            corretor.
          </motion.p>

          <motion.div
            custom={0.3}
            variants={fadeInLeft}
            className="flex flex-col items-center gap-4 sm:flex-row"
          >
            <Button
              size="lg"
              className="h-12 px-8 text-base font-semibold"
              render={<Link href="/chat" />}
              nativeButton={false}
            >
              Começar agora
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-12 px-8 text-base shadow-none"
              render={<a href="#como-funciona" />}
              nativeButton={false}
            >
              Veja como funciona
            </Button>
          </motion.div>
        </motion.div>

        {/* Right: Chat Mockup */}
        <motion.div
          className="w-full max-w-md flex-1 lg:max-w-lg"
          initial="hidden"
          animate="visible"
          variants={slideInRight}
        >
          <Card className="overflow-hidden shadow-xl">
            {/* Window Chrome */}
            <div className="bg-muted flex items-center gap-2 border-b px-4 py-3">
              <span className="size-3 rounded-full bg-red-400/60" />
              <span className="size-3 rounded-full bg-yellow-400/60" />
              <span className="size-3 rounded-full bg-green-400/60" />
              <span className="text-muted-foreground ml-2 text-xs font-medium">
                Aja Agora — Chat
              </span>
            </div>

            <CardContent className="space-y-4 p-5">
              {/* User Message */}
              <motion.div
                custom={0.6}
                variants={messageFadeIn}
                initial="hidden"
                animate="visible"
                className="flex items-start gap-3"
              >
                <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full">
                  <User className="text-muted-foreground size-4" />
                </div>
                <div className="bg-muted max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-2.5">
                  <p className="text-sm">
                    Quero comprar um carro de até R$ 80 mil
                  </p>
                </div>
              </motion.div>

              {/* Assistant Message */}
              <motion.div
                custom={1.0}
                variants={messageFadeIn}
                initial="hidden"
                animate="visible"
                className="flex items-start gap-3"
              >
                <div className="bg-primary flex size-8 shrink-0 items-center justify-center rounded-full">
                  <Bot className="text-primary-foreground size-4" />
                </div>
                <div className="bg-primary/5 max-w-[80%] rounded-2xl rounded-tl-sm border px-4 py-2.5">
                  <p className="text-sm">
                    Encontrei o plano ideal para você!
                  </p>
                </div>
              </motion.div>

              {/* Inline Group Card Artifact */}
              <motion.div
                custom={1.4}
                variants={messageFadeIn}
                initial="hidden"
                animate="visible"
                className="ml-11"
              >
                <Card className="border-primary/20 bg-primary/5 shadow-sm">
                  <CardContent className="p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <div className="bg-primary/10 flex size-8 items-center justify-center rounded-lg">
                        <Car className="text-primary size-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Auto</p>
                        <p className="text-muted-foreground text-xs">
                          Consórcio de Veículo
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-muted-foreground text-xs">Crédito</p>
                        <p className="text-sm font-bold">R$ 80.000</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Parcela</p>
                        <p className="text-sm font-bold">R$ 876/mês</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Prazo</p>
                        <p className="text-sm font-bold">72 meses</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="mt-3 w-full text-xs"
                      disabled
                    >
                      Ver detalhes
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}
