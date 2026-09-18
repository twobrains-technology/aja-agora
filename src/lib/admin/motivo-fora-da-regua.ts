/**
 * POR QUE ESTA CONVERSA NÃO ESTÁ NA RÉGUA — o espelho do dicionário canônico.
 *
 * ── O que este arquivo é ────────────────────────────────────────────────────
 *
 * O F6 criou a FONTE ÚNICA do motivo em `src/lib/remarketing/motivo-de-exclusao.ts`
 * (`avaliarElegibilidade`, `MOTIVO_SAIDA_TESTE`, `MOTIVO_SAIDA_EQUIPE`,
 * `motivoDeSaidaLegivel`, `ROTULO_DO_MOTIVO_DE_EXCLUSAO`). Este módulo é o
 * espelho DE TELA dela: mesmos nomes, mesma ordem de guarda, mesmas constantes —
 * para que o merge do F6 troque o corpo por um `import` e nada mais.
 *
 * Enquanto o F6 não está no worktree, a assinatura é repetida AQUI (não o
 * conteúdo: a decisão continua pura e sem I/O). Anotado na válvula.
 *
 * ── Os dois vocabulários, que a tela não pode confundir ─────────────────────
 *
 * "Motivo de EXCLUSÃO" diz por que a conversa nunca entrou (`regua_desligada`,
 * `conversa_web`, `parada_ha_mais_de_7_dias`…). "Motivo de SAÍDA" diz por que
 * ela parou depois de entrar (`teste`, `telefone_da_equipe`,
 * `segurado_pelo_atendente`…). A lista de Conversas mostra os dois em colunas
 * diferentes — misturá-los faria "marcada como teste" aparecer como "fora da
 * régua", o que é falso: ela ESTAVA na régua e foi segurada.
 */

import type { LucideIcon } from "lucide-react";
import {
	CalendarX,
	CircleSlash,
	Clock,
	FlaskConical,
	Globe,
	Headset,
	PhoneOff,
	PowerOff,
	Users,
	UserX,
} from "lucide-react";
import { ESPERA_SILENCIO_MS } from "@/lib/remarketing/regua";
import { chaveTelefoneBR } from "@/lib/whatsapp/mesmo-numero";

/**
 * A janela de entrada da régua: 7 dias. MESMA constante de
 * `remarketing-cycle.ts` e do canônico do F6. Repetida aqui (e não importada do
 * worker) porque este módulo é lido pela tela: importar o worker arrastaria
 * BullMQ e Redis para o bundle.
 */
export const JANELA_DE_ENTRADA_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Os motivos (idênticos a `MOTIVOS_DE_EXCLUSAO`, na mesma ordem) ──────────

export const MOTIVOS_FORA_DA_REGUA = [
	"regua_desligada",
	"teste",
	"encerrada",
	"com_atendente",
	"conversa_web",
	"sem_contato",
	"sem_telefone",
	"telefone_da_equipe",
	"ja_na_regua",
	"ainda_em_silencio",
	"parada_ha_mais_de_7_dias",
] as const;

export type MotivoForaDaRegua = (typeof MOTIVOS_FORA_DA_REGUA)[number];

/**
 * O motivo em português, SEM prefixo — o rótulo canônico do F6.
 *
 * `ja_na_regua` fica de fora do prefixo "Fora da régua": quem está na régua não
 * está fora dela, e a tela usa este rótulo só para dizer o que mudou.
 */
export const ROTULO_DO_MOTIVO: Record<MotivoForaDaRegua, string> = {
	regua_desligada: "Régua desligada",
	teste: "Conversa de teste",
	encerrada: "Conversa encerrada",
	com_atendente: "Com atendente",
	conversa_web: "Conversa da web",
	sem_contato: "Sem contato no cadastro",
	sem_telefone: "Sem telefone válido",
	telefone_da_equipe: "Telefone da equipe",
	ja_na_regua: "Já está na régua",
	ainda_em_silencio: "Ainda em silêncio",
	parada_ha_mais_de_7_dias: "Parada há mais de 7 dias",
};

/**
 * O rótulo como a coluna "Régua" o mostra. O prefixo é aplicado AQUI para
 * Conversas, Percurso e ficha dizerem a mesma frase — o motivo é só a cauda.
 */
export function rotuloForaDaRegua(motivo: MotivoForaDaRegua): string {
	return `Fora da régua · ${ROTULO_DO_MOTIVO[motivo].toLowerCase()}`;
}

/** Ícone por motivo. Estado nunca só por cor: ícone + rótulo sempre juntos. */
export const ICONE_DO_MOTIVO: Record<MotivoForaDaRegua, LucideIcon> = {
	regua_desligada: PowerOff,
	teste: FlaskConical,
	encerrada: CircleSlash,
	com_atendente: Headset,
	conversa_web: Globe,
	sem_contato: UserX,
	sem_telefone: PhoneOff,
	telefone_da_equipe: Users,
	ja_na_regua: Clock,
	ainda_em_silencio: Clock,
	parada_ha_mais_de_7_dias: CalendarX,
};

// ─── Motivos de SAÍDA — o vocabulário de "por que parou depois de entrar" ────

/** Marca a linha que parou por ser TESTE (`conversations.is_simulated`). */
export const MOTIVO_SAIDA_TESTE = "teste";
/** Marca a linha que parou por o telefone ser da EQUIPE. */
export const MOTIVO_SAIDA_EQUIPE = "telefone_da_equipe";
/** O motivo da ação MANUAL de segurar. */
export const MOTIVO_SAIDA_SEGURADO = "segurado_pelo_atendente";

/** Os motivos de SAÍDA com o rótulo que o operador lê (canônico do F6). */
export const ROTULO_DO_MOTIVO_DE_SAIDA: Record<string, string> = {
	cliente_respondeu: "O cliente respondeu",
	tres_toques_sem_resposta: "Três toques sem resposta",
	optout_do_cliente: "O cliente pediu para sair",
	[MOTIVO_SAIDA_SEGURADO]: "Segurou à mão, pelo painel",
	[MOTIVO_SAIDA_TESTE]: "Conversa de teste",
	[MOTIVO_SAIDA_EQUIPE]: "Telefone da equipe",
};

/** O motivo de saída em português; o cru quando desconhecido (nunca "outro"). */
export function motivoDeSaidaLegivel(motivo: string | null | undefined): string | null {
	if (!motivo) return null;
	return ROTULO_DO_MOTIVO_DE_SAIDA[motivo] ?? motivo;
}

// ─── A decisão ──────────────────────────────────────────────────────────────

/** A conversa como a consulta a devolve — nada derivado, nada resolvido. */
export interface ConversaAvaliada {
	channel: "web" | "whatsapp";
	status: "active" | "handed_off" | "closed";
	isSimulated: boolean;
	contactId: string | null;
	lastInboundAt: Date | null;
	waId: string | null;
	phone: string | null;
	jaNaRegua: boolean;
}

export interface OpcoesDaElegibilidade {
	reguaLigada: boolean;
	entradaWeb: boolean;
	telefoneDaEquipe: boolean;
}

/** Lê um booleano-de-ambiente do jeito do motor: `1`/`true`/`sim` ligam. */
function ligado(valor: string | undefined): boolean {
	const v = (valor ?? "").trim().toLowerCase();
	return v === "1" || v === "true" || v === "sim";
}

/** As opções a partir do ambiente — o I/O fica na borda, não na decisão. */
export function opcoesDoAmbiente(env: Record<string, string | undefined> = process.env) {
	return {
		reguaLigada: ligado(env.REMARKETING_ATIVO),
		entradaWeb: ligado(env.REMARKETING_ENTRADA_WEB),
	};
}

/**
 * O destino do toque: o `wa_id` da conversa e, sem ele, o telefone do contato.
 * Telefone fora do formato brasileiro não conta como destino.
 */
export function destinoDoToque(conversa: Pick<ConversaAvaliada, "waId" | "phone">): string | null {
	for (const candidato of [conversa.waId, conversa.phone]) {
		if (candidato && chaveTelefoneBR(candidato) !== null) return candidato;
	}
	return null;
}

/**
 * Por que esta conversa NÃO entra (ou não entrou) na régua.
 *
 * `null` = elegível. Qualquer outro retorno é a PRIMEIRA guarda que falhou, na
 * MESMA ordem de `avaliarElegibilidade` (F6) — trocar a ordem muda o motivo que
 * a tela mostra.
 */
export function motivoForaDaRegua(
	conversa: ConversaAvaliada,
	agora: Date,
	opcoes: OpcoesDaElegibilidade,
): MotivoForaDaRegua | null {
	// 1. A chave operacional vence tudo.
	if (!opcoes.reguaLigada) return "regua_desligada";

	// 2. Teste nunca é lead.
	if (conversa.isSimulated) return "teste";

	// 3/4. Status fora de `active`.
	if (conversa.status === "closed") return "encerrada";
	if (conversa.status !== "active") return "com_atendente";

	// 5. Canal: a web só entra com a flag ligada.
	if (conversa.channel === "web" && !opcoes.entradaWeb) return "conversa_web";

	// 6. Sem contato não há como contar o teto de 30 dias.
	if (!conversa.contactId) return "sem_contato";

	// 7. Sem destino não há toque.
	if (destinoDoToque(conversa) === null) return "sem_telefone";

	// 8. A casa não recebe o próprio remarketing.
	if (opcoes.telefoneDaEquipe) return "telefone_da_equipe";

	// 9. Já tem linha — quem decide se dispara é o motor, não a entrada.
	if (conversa.jaNaRegua) return "ja_na_regua";

	// 10. Silêncio: 90 min. Data ausente cai aqui (corrida do `last_inbound_at`).
	if (!conversa.lastInboundAt) return "ainda_em_silencio";
	if (conversa.lastInboundAt.getTime() > agora.getTime() - ESPERA_SILENCIO_MS) {
		return "ainda_em_silencio";
	}

	// 11. A janela de 7 dias fechou; não se reabre retroativamente.
	if (conversa.lastInboundAt.getTime() <= agora.getTime() - JANELA_DE_ENTRADA_MS) {
		return "parada_ha_mais_de_7_dias";
	}

	return null;
}
