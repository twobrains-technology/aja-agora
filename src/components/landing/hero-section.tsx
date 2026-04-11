"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Bot, Home, Car, Briefcase, Sparkles, MessageCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const goals = [
  {
    id: "imovel",
    icon: Home,
    label: "Imóvel",
    sub: "Casa ou apartamento dos sonhos",
    message: "Quero comprar um imóvel, me ajude a encontrar o melhor consórcio",
    color: "from-blue-500 to-cyan-400",
    bgHover: "hover:border-blue-400/50 hover:bg-blue-50/50 dark:hover:bg-blue-950/20",
  },
  {
    id: "auto",
    icon: Car,
    label: "Carro",
    sub: "Carro novo ou seminovo",
    message: "Quero comprar um carro, qual o melhor consórcio para mim?",
    color: "from-violet-500 to-purple-400",
    bgHover: "hover:border-violet-400/50 hover:bg-violet-50/50 dark:hover:bg-violet-950/20",
  },
  {
    id: "servicos",
    icon: Briefcase,
    label: "Serviços",
    sub: "Reforma, viagem ou investimento",
    message: "Quero fazer um consórcio de serviços, o que vocês têm disponível?",
    color: "from-emerald-500 to-teal-400",
    bgHover: "hover:border-emerald-400/50 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20",
  },
];

interface HeroSectionProps {
  onGoalSelected: (message: string) => void;
}

export function HeroSection({ onGoalSelected }: HeroSectionProps) {
  const [phase, setPhase] = useState<"typing" | "question" | "cards" | "selected">("typing");
  const [typedText, setTypedText] = useState("");
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);

  const fullText = "Olá! Eu sou seu consultor de consórcio.";

  // Typing animation
  useEffect(() => {
    if (phase !== "typing") return;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setTypedText(fullText.slice(0, i));
      if (i >= fullText.length) {
        clearInterval(interval);
        setTimeout(() => setPhase("question"), 400);
      }
    }, 35);
    return () => clearInterval(interval);
  }, [phase]);

  const handleSelect = useCallback(
    (goal: (typeof goals)[number]) => {
      setSelectedGoal(goal.id);
      setPhase("selected");
      setTimeout(() => onGoalSelected(goal.message), 800);
    },
    [onGoalSelected]
  );

  return (
    <section className="relative flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center px-4 py-8">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/4 size-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 size-[400px] rounded-full bg-blue-400/5 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col items-center gap-6">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-2 backdrop-blur-sm">
            <Badge className="gap-1">
              <Sparkles className="size-3" />
              IA
            </Badge>
            <span className="text-muted-foreground text-sm">Consórcio inteligente</span>
          </div>
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.21, 0.47, 0.32, 0.98] }}
          className="text-center font-serif text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl"
        >
          Seu consórcio, do sonho{" "}
          <span className="bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
            à assinatura
          </span>
        </motion.h1>

        {/* Chat Container — THE STAR OF THE SHOW */}
        <motion.div
          className="w-full"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.3 }}
        >
          <Card className="overflow-hidden border-border/50 shadow-2xl shadow-primary/5">
            {/* Window Chrome */}
            <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
              <span className="size-2.5 rounded-full bg-red-400/50" />
              <span className="size-2.5 rounded-full bg-yellow-400/50" />
              <span className="size-2.5 rounded-full bg-green-400/50" />
              <span className="ml-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <MessageCircle className="size-3" />
                Aja Agora
              </span>
            </div>

            <CardContent className="min-h-[320px] space-y-4 p-5 sm:min-h-[360px] sm:p-6">
              {/* Bot message — typing */}
              <div className="flex items-start gap-3">
                <motion.div
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.5 }}
                >
                  <Bot className="size-4 text-primary-foreground" />
                </motion.div>
                <div className="flex flex-col gap-3">
                  <motion.div
                    className="inline-block max-w-[90%] rounded-2xl rounded-tl-sm border bg-card px-4 py-3"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.6 }}
                  >
                    <p className="text-sm leading-relaxed">
                      {typedText}
                      {phase === "typing" && (
                        <motion.span
                          className="ml-0.5 inline-block h-4 w-0.5 bg-foreground"
                          animate={{ opacity: [1, 0] }}
                          transition={{ duration: 0.5, repeat: Infinity }}
                        />
                      )}
                    </p>
                  </motion.div>

                  {/* Question — appears after typing */}
                  <AnimatePresence>
                    {(phase === "question" || phase === "cards" || phase === "selected") && (
                      <motion.div
                        className="inline-block max-w-[90%] rounded-2xl rounded-tl-sm border bg-card px-4 py-3"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        onAnimationComplete={() => {
                          if (phase === "question") setPhase("cards");
                        }}
                      >
                        <p className="text-sm font-medium leading-relaxed">
                          O que você quer conquistar? 👇
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Goal Cards — appear with stagger */}
              <AnimatePresence>
                {(phase === "cards" || phase === "selected") && (
                  <motion.div
                    className="grid gap-3 pt-2 sm:grid-cols-3"
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    variants={{
                      hidden: {},
                      visible: { transition: { staggerChildren: 0.12 } },
                      exit: { transition: { staggerChildren: 0.05 } },
                    }}
                  >
                    {goals.map((goal) => {
                      const isSelected = selectedGoal === goal.id;
                      const isOther = selectedGoal !== null && !isSelected;

                      return (
                        <motion.button
                          key={goal.id}
                          onClick={() => phase === "cards" && handleSelect(goal)}
                          disabled={phase === "selected"}
                          variants={{
                            hidden: { opacity: 0, y: 16, scale: 0.95 },
                            visible: {
                              opacity: 1,
                              y: 0,
                              scale: 1,
                              transition: { type: "spring", stiffness: 200, damping: 20 },
                            },
                            exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } },
                          }}
                          whileHover={
                            phase === "cards"
                              ? { scale: 1.04, y: -4, transition: { type: "spring", stiffness: 400, damping: 15 } }
                              : undefined
                          }
                          whileTap={phase === "cards" ? { scale: 0.97 } : undefined}
                          animate={
                            isSelected
                              ? { scale: 1.05, borderColor: "var(--primary)" }
                              : isOther
                                ? { opacity: 0.3, scale: 0.95 }
                                : undefined
                          }
                          className={`group flex flex-col items-center gap-2 rounded-xl border-2 border-transparent bg-muted/30 p-4 text-center transition-colors sm:p-5 ${
                            phase === "cards" ? `cursor-pointer ${goal.bgHover}` : ""
                          } ${isSelected ? "border-primary bg-primary/5" : ""}`}
                        >
                          <div
                            className={`flex size-12 items-center justify-center rounded-xl bg-gradient-to-br ${goal.color} text-white shadow-lg shadow-primary/10 transition-shadow group-hover:shadow-xl`}
                          >
                            <goal.icon className="size-6" />
                          </div>
                          <span className="text-sm font-semibold">{goal.label}</span>
                          <span className="text-xs text-muted-foreground">{goal.sub}</span>
                        </motion.button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Selected feedback — user message appears */}
              <AnimatePresence>
                {phase === "selected" && selectedGoal && (
                  <motion.div
                    className="flex justify-end"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.3 }}
                  >
                    <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-4 py-3">
                      <p className="text-sm text-primary-foreground">
                        {goals.find((g) => g.id === selectedGoal)?.message}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>

        {/* Sub text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="text-center text-sm text-muted-foreground"
        >
          Sem formulário, sem corretor — 100% IA
        </motion.p>
      </div>
    </section>
  );
}
