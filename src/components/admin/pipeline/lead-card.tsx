"use client";

import { useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, Smartphone, Clock, DollarSign, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";

export interface Lead {
  id: string;
  conversationId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  stage: string;
  creditValue: string | null;
  createdAt: string;
  updatedAt: string;
  conversation: {
    channel: "web" | "whatsapp";
    createdAt: string;
    updatedAt: string;
  };
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function getDisplayName(lead: Lead): string {
  if (lead.name) return lead.name;
  if (lead.phone) return lead.phone;
  return "Lead sem nome";
}

function ChannelIcon({ channel }: { channel: "web" | "whatsapp" }) {
  if (channel === "whatsapp") {
    return <Smartphone className="size-3.5 text-green-600" />;
  }
  return <Globe className="size-3.5 text-blue-600" />;
}

export function LeadCard({
  lead,
  isDragging,
  onLeadClick,
}: {
  lead: Lead;
  isDragging: boolean;
  onLeadClick?: (leadId: string) => void;
}) {
  const wasDragging = useRef(false);
  useEffect(() => {
    wasDragging.current = isDragging;
  }, [isDragging]);
  const timeInStage = formatDistanceToNow(new Date(lead.updatedAt), {
    addSuffix: true,
    locale: ptBR,
  });

  const lastInteraction = formatDistanceToNow(
    new Date(lead.conversation.updatedAt),
    { addSuffix: true, locale: ptBR },
  );

  const creditDisplay = lead.creditValue
    ? currencyFormatter.format(Number(lead.creditValue))
    : "\u2014";

  return (
    <Card
      size="sm"
      className={`cursor-pointer transition-opacity ${isDragging ? "opacity-50" : ""}`}
      onClick={() => {
        if (wasDragging.current) return;
        onLeadClick?.(lead.id);
      }}
    >
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium truncate text-sm">
            {getDisplayName(lead)}
          </span>
          <Badge variant="secondary" className="shrink-0">
            <ChannelIcon channel={lead.conversation.channel} />
            <span className="ml-0.5 text-[10px]">
              {lead.conversation.channel === "whatsapp" ? "WA" : "Web"}
            </span>
          </Badge>
        </div>

        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <DollarSign className="size-3" />
            <span>{creditDisplay}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="size-3" />
            <span>{timeInStage}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MessageSquare className="size-3" />
            <span>{lastInteraction}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
