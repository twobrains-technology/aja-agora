"use client";

import { ExternalLink } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { WhatsappGlyph } from "@/components/icons/whatsapp-glyph";
import { Button } from "@/components/ui/button";
import { carimbarOrigem, lerCodigoDeOrigemDoCookie } from "@/lib/attribution/codigo-de-origem";
import type { AtendimentoHandoffPayload } from "@/lib/chat/types";

// Card ÚNICO de finalização (web): parabéns com confete, o aviso de que um
// atendente vai chamar (sem prazo, D-0004) e a proposta como ação secundária.

const CORES_CONFETE = ["#E5322D", "#F5B700", "#25D366", "#3B82F6", "#A855F7", "#FFFFFF"];
const PECAS = Array.from({ length: 18 }, (_, i) => {
	const ang = (i / 18) * Math.PI * 2;
	const raio = 70 + (i % 3) * 22;
	return {
		x: Math.cos(ang) * raio,
		y: Math.sin(ang) * raio - 20,
		cor: CORES_CONFETE[i % CORES_CONFETE.length],
		giro: (i % 2 ? 1 : -1) * (180 + i * 20),
	};
});

/** Confete decorativo: uma explosão só, ao montar. Sem movimento quando o
 * usuário pede (prefers-reduced-motion) — o parabéns vive no texto. */
function Confete() {
	const [ativo, setAtivo] = useState(false);
	useEffect(() => {
		setAtivo(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
	}, []);
	if (!ativo) return null;
	return (
		<div
			data-testid="confete"
			aria-hidden="true"
			className="pointer-events-none absolute left-1/2 top-6 size-0"
		>
			{PECAS.map((p, i) => (
				<motion.span
					// biome-ignore lint/suspicious/noArrayIndexKey: lista estática
					key={i}
					className="absolute h-[8px] w-[5px] rounded-[1px]"
					style={{ backgroundColor: p.cor, boxShadow: "0 0 0 1px rgba(0,0,0,0.15)" }}
					initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
					animate={{ x: p.x, y: p.y + 60, opacity: 0, rotate: p.giro }}
					transition={{ duration: 1.4, ease: "easeOut" }}
				/>
			))}
		</div>
	);
}

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
		<div className="relative w-full max-w-sm overflow-hidden rounded-[12px] border border-[color:var(--border-strong)] bg-card p-[18px] shadow-lg flex flex-col gap-[14px]">
			<Confete />
			<p className="text-base font-semibold leading-snug text-foreground">
				Parabéns! Agora você está oficialmente mais perto da sua conquista!
			</p>
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
				// A3 aplicado ao ponto onde a continuidade mais vale (30/08/2026).
				//
				// Este é o salto web → WhatsApp no MAIOR momento de intenção do funil:
				// o cliente acabou de fechar a proposta. Sem carimbo, a conversa que
				// nasce do outro lado é órfã de origem, e a venda inteira — que veio de
				// um anúncio, passou pelo site e fechou no WhatsApp — aparece no
				// relatório como duas coisas sem parentesco.
				//
				// O código é lido no CLIQUE (e não na montagem): este card pode ficar na
				// tela por bastante tempo enquanto o cliente lê, e o que interessa é a
				// visita corrente no instante do salto.
				onClick={() =>
					window.open(
						waLink(
							payload.numero,
							carimbarOrigem(payload.mensagemInicial ?? "", lerCodigoDeOrigemDoCookie()),
						),
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

			{payload.proposalUrl ? (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="self-center h-8 gap-1.5 rounded-full border border-border bg-white px-3 text-xs font-medium text-foreground hover:bg-muted"
					data-testid="signature-link"
					onClick={() => window.open(payload.proposalUrl, "_blank", "noopener,noreferrer")}
				>
					<ExternalLink className="size-3.5" />
					Ver minha proposta
				</Button>
			) : null}
		</div>
	);
}
