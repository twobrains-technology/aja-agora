"use client";

import { useState, useCallback } from "react";
import { motion } from "motion/react";
import { Home, Car, Briefcase, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useChatStore, type ChatState } from "@/lib/chat/store";

export interface ValuePickerPayload {
  category: "imovel" | "auto" | "servicos";
  fields: ValuePickerField[];
}

export interface ValuePickerField {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  prefix?: string;
  suffix?: string;
  format?: "currency" | "months";
}

const categoryConfig = {
  imovel: { icon: Home, label: "Imóvel", color: "from-blue-500 to-cyan-400" },
  auto: { icon: Car, label: "Automóvel", color: "from-violet-500 to-purple-400" },
  servicos: { icon: Briefcase, label: "Serviços", color: "from-emerald-500 to-teal-400" },
};

function formatValue(value: number, format?: "currency" | "months"): string {
  if (format === "currency") {
    if (value >= 1000) {
      return `R$ ${(value / 1000).toFixed(0)} mil`;
    }
    return `R$ ${value.toLocaleString("pt-BR")}`;
  }
  if (format === "months") {
    return `${value} meses`;
  }
  return `R$ ${value.toLocaleString("pt-BR")}`;
}

export function ValuePicker({ payload }: { payload: ValuePickerPayload }) {
  const sendMessage = useChatStore((s: ChatState) => s.sendMessage);
  const isStreaming = useChatStore((s: ChatState) => s.isStreaming);
  const [values, setValues] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const field of payload.fields) {
      initial[field.id] = field.default;
    }
    return initial;
  });
  const [submitted, setSubmitted] = useState(false);

  const config = categoryConfig[payload.category];
  const Icon = config.icon;

  const handleSubmit = useCallback(() => {
    setSubmitted(true);
    const parts: string[] = [];
    for (const field of payload.fields) {
      const val = values[field.id];
      if (field.format === "currency") {
        parts.push(`${field.label}: R$ ${val.toLocaleString("pt-BR")}`);
      } else if (field.format === "months") {
        parts.push(`${field.label}: ${val} meses`);
      } else {
        parts.push(`${field.label}: R$ ${val.toLocaleString("pt-BR")}/mês`);
      }
    }
    sendMessage(parts.join(", "));
  }, [values, payload.fields, sendMessage]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <Card className="overflow-hidden border-primary/20 shadow-lg shadow-primary/5">
        {/* Header gradient strip */}
        <div className={`h-1.5 bg-gradient-to-r ${config.color}`} />

        <CardContent className="space-y-5 p-5">
          {/* Category header */}
          <div className="flex items-center gap-3">
            <div className={`flex size-10 items-center justify-center rounded-xl bg-gradient-to-br ${config.color} text-white shadow-md`}>
              <Icon className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">{config.label}</p>
              <p className="text-xs text-muted-foreground">Ajuste os valores abaixo</p>
            </div>
            <Badge variant="outline" className="ml-auto text-xs">
              Interativo
            </Badge>
          </div>

          <Separator />

          {/* Slider fields */}
          <div className="space-y-6">
            {payload.fields.map((field) => (
              <div key={field.id} className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <label className="text-sm font-medium text-muted-foreground">
                    {field.label}
                  </label>
                  <motion.span
                    key={values[field.id]}
                    initial={{ scale: 1.1 }}
                    animate={{ scale: 1 }}
                    className="font-mono text-lg font-bold text-foreground"
                  >
                    {formatValue(values[field.id], field.format)}
                  </motion.span>
                </div>
                <Slider
                  value={[values[field.id]]}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  onValueChange={(val) => {
                    if (!submitted) {
                      const v = Array.isArray(val) ? val[0] : val;
                      setValues((prev) => ({ ...prev, [field.id]: v }));
                    }
                  }}
                  disabled={submitted}
                  className="cursor-pointer"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{formatValue(field.min, field.format)}</span>
                  <span>{formatValue(field.max, field.format)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Submit button */}
          <motion.div
            whileHover={!submitted ? { scale: 1.02 } : undefined}
            whileTap={!submitted ? { scale: 0.98 } : undefined}
          >
            <Button
              onClick={handleSubmit}
              disabled={submitted || isStreaming}
              className="w-full gap-2 font-semibold"
              size="lg"
            >
              {submitted ? (
                "Enviado!"
              ) : (
                <>
                  Buscar opções
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
