"use client";

import { WhatsappGlyph } from "@/components/icons/whatsapp-glyph";
import { Button } from "@/components/ui/button";
import type { AtendimentoHandoffPayload } from "@/lib/chat/types";

// O ÚLTIMO passo da jornada: dizer, com clareza, o que acontece depois do
// fechamento. Antes isso era um parágrafo corrido no fim de um balão gigante
// ("Parabéns… assim que a janela abrir… me responde com um oi… em breve um
// atendente… + a URL assinada do PDF inteira, com assinatura AWS e tudo"), e o
// cliente terminava a compra sem saber o que fazer. Agora é um card com UMA
// ação: abrir o WhatsApp oficial.

/** Só dígitos, formato wa.me (55 + DDD + número). */
function waLink(numero: string, texto?: string): string {
	const digits = numero.replace(/\D/g, "");
	const base = `https://wa.me/${digits}`;
	return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}

export function AtendimentoHandoff({ payload }: { payload: AtendimentoHandoffPayload }) {
	const administradora = payload.administradora?.trim();
	return (
		<div className="w-full max-w-sm rounded-[12px] border border-[color:var(--border-strong)] bg-card p-[18px] shadow-lg flex flex-col gap-[14px]">
			<div className="flex flex-col gap-[2px]">
				<div className="flex items-center gap-2">
					<WhatsappGlyph className="size-[17px] text-[#25D366]" />
					<p className="text-sm font-semibold text-foreground">O próximo passo é com a gente</p>
				</div>
				<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
					Um atendente da Aja Agora vai te chamar pra fazer a adesão
					{administradora ? ` na ${administradora}` : " na administradora"} — é ele quem cuida dos
					documentos e do cadastro, você não precisa enviar nada agora.
				</p>
			</div>

			<div className="rounded-[12px] bg-muted border border-border px-[14px] py-[12px]">
				<p className="text-xs text-muted-foreground">Nosso WhatsApp oficial</p>
				<p className="text-sm font-semibold text-foreground">{payload.numeroFormatado}</p>
			</div>

			<Button
				type="button"
				className="w-full h-[46px] min-h-[44px] gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground hover:brightness-105"
				data-testid="atendimento-whatsapp"
				onClick={() =>
					window.open(
						waLink(payload.numero, payload.mensagemInicial),
						"_blank",
						"noopener,noreferrer",
					)
				}
			>
				<WhatsappGlyph className="size-4" />
				Falar no WhatsApp
			</Button>

			<p className="text-[11px] leading-relaxed text-muted-foreground">
				Mandar um "oi" por lá agora deixa nosso contato salvo e adianta o atendimento.
			</p>
		</div>
	);
}
