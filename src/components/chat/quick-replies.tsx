"use client";

import { motion } from "motion/react";
import { Card } from "@/components/ui/card";
import type { QuickReplyPayload } from "@/lib/chat/types";

interface QuickRepliesProps {
  payload: QuickReplyPayload;
  onSelect: (text: string) => void;
  disabled?: boolean;
}

export function QuickReplies({ payload, onSelect, disabled }: QuickRepliesProps) {
  return (
    <motion.div
      className="flex flex-wrap gap-2"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.08 } },
      }}
    >
      {payload.options.map((option) => (
        <motion.button
          key={option.value}
          variants={{
            hidden: { opacity: 0, y: 8, scale: 0.95 },
            visible: {
              opacity: 1,
              y: 0,
              scale: 1,
              transition: { type: "spring", stiffness: 300, damping: 20 },
            },
          }}
          whileHover={disabled ? undefined : { scale: 1.04, y: -2 }}
          whileTap={disabled ? undefined : { scale: 0.97 }}
          onClick={() => !disabled && onSelect(option.value)}
          disabled={disabled}
          className="group cursor-pointer disabled:cursor-default disabled:opacity-50"
        >
          <Card className="flex items-center gap-2.5 border-primary/20 bg-primary/5 px-4 py-2.5 shadow-none transition-colors hover:border-primary/40 hover:bg-primary/10">
            {option.emoji && (
              <span className="text-lg">{option.emoji}</span>
            )}
            <span className="text-sm font-medium">{option.label}</span>
          </Card>
        </motion.button>
      ))}
    </motion.div>
  );
}
