"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

interface ScrollFadeProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export function ScrollFade({
  children,
  delay = 0,
  className,
}: ScrollFadeProps) {
  const prefersReduced = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={
        prefersReduced
          ? { duration: 0 }
          : { duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] }
      }
      className={className}
    >
      {children}
    </motion.div>
  );
}
