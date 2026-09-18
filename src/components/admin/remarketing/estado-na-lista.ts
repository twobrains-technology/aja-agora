"use client";

/**
 * O ESTADO DE REMARKETING NUMA CÉLULA — ícone + rótulo + tooltip, sem "—".
 *
 * A coluna "Remarketing" de Conversas e a coluna "Régua" do Percurso respondem a
 * MESMA pergunta com o MESMO vocabulário: por isso a lógica mora aqui, uma vez,
 * em vez de repetida (e divergindo) em duas tabelas.
 *
 * Regra que o componente segue: **célula vazia é proibida quando existe um fato
 * do servidor que a explica.** Quando não há linha na régua há um motivo; quando
 * há linha há um passo, um próximo toque ou um desfecho. O único caso sem dado é
 * "não carregou ainda", e aí a tela mostra skeleton.
 *
 * Module puro (recebe `agora`), testável sem banco.
 */

import type { LucideIcon } from "lucide-react";
import { Ban, Check, Clock, Flag, FlaskConical, Megaphone, PauseCircle, Users } from "lucide-react";
import {
	ICONE_DO_MOTIVO,
	MOTIVO_SAIDA_EQUIPE,
	MOTIVO_SAIDA_SEGURADO,
	MOTIVO_SAIDA_TESTE,
	type MotivoForaDaRegua,
	rotuloForaDaRegua,
} from "@/lib/admin/motivo-fora-da-regua";

export type VarianteDoEstado = "success" | "warning" | "secondary" | "outline" | "destructive";

export interface EstadoNaLista {
	icone: LucideIcon;
	rotulo: string;
	tooltip: string;
	variante: VarianteDoEstado;
}

export interface LinhaDeRegua {
	status: string;
	step: number;
	nextTouchAt: Date | null;
	ultimoToqueEm: Date | null;
	/** `remarketing_touches.motivo_saida` — separa "respondeu" de "segurada".
	 * Opcional: a coluna do Percurso não lê o motivo de saída da linha. */
	motivoSaida?: string | null;
}

function passoCurto(step: number): string {
	return `${Math.min(Math.max(step, 0), 3)} de 3`;
}

function quando(d: Date, agora: Date): string {
	const min = Math.round((d.getTime() - agora.getTime()) / 60_000);
	if (min <= 0) return "a qualquer momento";
	if (min < 60) return `em ${min} min`;
	const horas = Math.round(min / 60);
	if (horas < 24) return `em ${horas} h`;
	const dia = String(d.getDate()).padStart(2, "0");
	const mes = String(d.getMonth() + 1).padStart(2, "0");
	const hh = String(d.getHours()).padStart(2, "0");
	const mm = String(d.getMinutes()).padStart(2, "0");
	return `${dia}/${mes} às ${hh}:${mm}`;
}

/**
 * O estado da linha. `regua` tem precedência: quem está na régua mostra o passo
 * e o próximo toque, não um motivo de exclusão.
 */
export function estadoNaLista(args: {
	regua: LinhaDeRegua | null;
	motivo: MotivoForaDaRegua | null;
	agora: Date;
}): EstadoNaLista {
	const { regua, motivo, agora } = args;

	if (regua) {
		const passo = passoCurto(regua.step);
		switch (regua.status) {
			case "ATIVO":
				if (regua.nextTouchAt) {
					return {
						icone: Megaphone,
						rotulo:
							regua.step > 0
								? `${passo} · próximo ${quando(regua.nextTouchAt, agora)}`
								: `Entra ${quando(regua.nextTouchAt, agora)}`,
						tooltip: "Toques enviados e quando sai o próximo. A régua para se a pessoa responder.",
						variante: "secondary",
					};
				}
				return {
					icone: Megaphone,
					rotulo: `${passo}`,
					tooltip: "Está na régua; o próximo toque é recalculado a cada silêncio.",
					variante: "secondary",
				};
			case "RESPONDEU":
				if (regua.motivoSaida === MOTIVO_SAIDA_TESTE) {
					return {
						icone: FlaskConical,
						rotulo: "Segurada por ser teste",
						tooltip: "Conversa marcada como teste: saiu das métricas e da régua.",
						variante: "outline",
					};
				}
				if (regua.motivoSaida === MOTIVO_SAIDA_EQUIPE) {
					return {
						icone: Users,
						rotulo: "Segurada · telefone da equipe",
						tooltip: "O número é da casa — nunca recebe toque.",
						variante: "outline",
					};
				}
				if (regua.motivoSaida === MOTIVO_SAIDA_SEGURADO) {
					return {
						icone: PauseCircle,
						rotulo: "Segurada pelo atendente",
						tooltip: "Um atendente parou a régua à mão; dá para soltar na lista da Régua.",
						variante: "secondary",
					};
				}
				return {
					icone: Check,
					rotulo: `Respondeu após o toque ${Math.min(Math.max(regua.step, 1), 3)}`,
					tooltip: "O cliente respondeu — a sequência parou e a conversa voltou para a mesa.",
					variante: "success",
				};
			case "OPTOUT":
				return {
					icone: Ban,
					rotulo: "Pediu para sair",
					tooltip: "Opt-out é definitivo: esta pessoa não recebe mais toque automático.",
					variante: "destructive",
				};
			case "ESGOTADO":
				return {
					icone: Flag,
					rotulo: "Esgotou os 3 toques",
					tooltip: "Os três toques saíram sem resposta — a régua para aqui.",
					variante: "warning",
				};
			case "CONVERTEU":
				return {
					icone: Check,
					rotulo: "Fechou contrato",
					tooltip: "A conversa virou venda.",
					variante: "success",
				};
			default:
				return {
					icone: Megaphone,
					rotulo: passo,
					tooltip: "Na régua.",
					variante: "secondary",
				};
		}
	}

	if (motivo) {
		return {
			icone: ICONE_DO_MOTIVO[motivo],
			rotulo: rotuloForaDaRegua(motivo),
			tooltip:
				"A régua automática só alcança conversas de WhatsApp ativas, com telefone, paradas entre 90 minutos e 7 dias. Quem está fora precisa de ação humana.",
			variante: motivo === "regua_desligada" ? "warning" : "outline",
		};
	}

	// Sem linha e sem motivo: elegível, a régua liga no próximo ciclo.
	return {
		icone: Clock,
		rotulo: "Entra na régua no próximo ciclo",
		tooltip: "Passou em todas as guardas e entra na régua quando o ciclo rodar.",
		variante: "secondary",
	};
}
