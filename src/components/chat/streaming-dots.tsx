"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Search, Sparkles, BarChart3 } from "lucide-react";

const loadingSteps = [
  { text: "Analisando seu perfil", icon: Sparkles },
  { text: "Buscando as melhores opções", icon: Search },
  { text: "Comparando grupos", icon: BarChart3 },
];

export function StreamingDots() {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((prev) => (prev + 1) % loadingSteps.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const step = loadingSteps[stepIndex];
  const Icon = step.icon;

  return (
    <div className="flex items-center gap-2 py-1" aria-label="Processando...">
      <AnimatePresence mode="wait">
        <motion.div
          key={stepIndex}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-2"
        >
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          >
            <Icon className="size-3.5 text-primary" />
          </motion.div>
          <span className="text-xs text-muted-foreground">{step.text}</span>
        </motion.div>
      </AnimatePresence>
      <div className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1 rounded-full bg-primary/50"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </div>
  );
}
