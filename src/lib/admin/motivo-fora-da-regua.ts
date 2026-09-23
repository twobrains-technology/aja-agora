/**
 * POR QUE ESTA CONVERSA NÃO ESTÁ NA RÉGUA — a casca de TELA da fonte canônica.
 *
 * ── O que este arquivo é (e o que deixou de ser) ────────────────────────────
 *
 * A decisão de entrada na régua mora em UM lugar:
 * `src/lib/remarketing/motivo-de-exclusao.ts` (`avaliarElegibilidade`) — é ela
 * que o ciclo chama. Este módulo é a BORDA DE TELA dela: o rótulo com prefixo,
 * o ícone de cada motivo e a leitura das flags de ambiente.
 *
 * Até 22/09/2026 este arquivo era um ESPELHO: repetia a assinatura, a lista de
 * motivos, a tabela de rótulos e a ORDEM das onze guardas — com um comentário
 * dizendo que o merge trocaria o corpo por um `import`. O merge aconteceu, e a
 * repetição era o defeito: duas verdades para a mesma pergunta, com a
 * divergência aparecendo na tela como um motivo que o ciclo não daria.
 * `motivoForaDaRegua` agora **chama `avaliarElegibilidade`** — não há segunda
 * cópia das guardas.
 *
 * Os nomes antigos (`MOTIVOS_FORA_DA_REGUA`, `ROTULO_DO_MOTIVO`,
 * `MotivoForaDaRegua`, `JANELA_DE_ENTRADA_MS`, os motivos de saída) continuam
 * exportados daqui como ALIASES da fonte canônica, porque sete módulos já os
 * importam deste caminho. Alias não é cópia: mudar a fonte muda o alias.
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
import {
	avaliarElegibilidade,
	type ConversaAvaliada,
	JANELA_DE_ENTRADA_MS,
	MOTIVO_SAIDA_EQUIPE,
	MOTIVO_SAIDA_SEGURADO,
	MOTIVO_SAIDA_TESTE,
	MOTIVOS_DE_EXCLUSAO,
	type MotivoDeExclusao,
	motivoDeSaidaLegivel,
	type OpcoesDaElegibilidade,
	ROTULO_DO_MOTIVO_DE_EXCLUSAO,
	ROTULO_DO_MOTIVO_DE_SAIDA,
} from "@/lib/remarketing/motivo-de-exclusao";

// ─── Os nomes que a tela já usa — aliases da fonte canônica ─────────────────

export type MotivoForaDaRegua = MotivoDeExclusao;
export type { ConversaAvaliada, OpcoesDaElegibilidade };

/** A lista de motivos é a do canônico — não há segunda lista. */
export const MOTIVOS_FORA_DA_REGUA = MOTIVOS_DE_EXCLUSAO;

/** A tabela de rótulos é a do canônico — não há segunda tabela. */
export const ROTULO_DO_MOTIVO = ROTULO_DO_MOTIVO_DE_EXCLUSAO;

export {
	JANELA_DE_ENTRADA_MS,
	MOTIVO_SAIDA_EQUIPE,
	MOTIVO_SAIDA_SEGURADO,
	MOTIVO_SAIDA_TESTE,
	motivoDeSaidaLegivel,
	ROTULO_DO_MOTIVO_DE_SAIDA,
};

/**
 * O rótulo como a coluna "Régua" o mostra. O prefixo é aplicado AQUI (e só
 * aqui): Conversas, Percurso e ficha dizem a mesma frase, e o motivo é a cauda.
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

// ─── A decisão — uma linha, delegando à fonte canônica ──────────────────────

/**
 * Por que esta conversa NÃO entra (ou não entrou) na régua.
 *
 * `null` = elegível. Qualquer outro retorno é o PRIMEIRO guarda que falhou, na
 * ordem do canônico — a MESMA função que o ciclo usa, não uma reescrita dela.
 */
export function motivoForaDaRegua(
	conversa: ConversaAvaliada,
	agora: Date,
	opcoes: OpcoesDaElegibilidade,
): MotivoForaDaRegua | null {
	const veredito = avaliarElegibilidade(conversa, agora, opcoes);
	return veredito.elegivel ? null : veredito.motivo;
}

// ─── As flags de ambiente (a tela lê; a decisão não) ────────────────────────

/** Lê um booleano-de-ambiente do jeito do motor: `1`/`true`/`sim` ligam. */
function ligado(valor: string | undefined): boolean {
	const v = (valor ?? "").trim().toLowerCase();
	return v === "1" || v === "true" || v === "sim";
}

/** As opções a partir do ambiente — o I/O fica na borda, não na decisão. */
export function opcoesDoAmbiente(env: Record<string, string | undefined> = process.env): {
	reguaLigada: boolean;
	entradaWeb: boolean;
} {
	return {
		reguaLigada: ligado(env.REMARKETING_ATIVO),
		entradaWeb: ligado(env.REMARKETING_ENTRADA_WEB),
	};
}