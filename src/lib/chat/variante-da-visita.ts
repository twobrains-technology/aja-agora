// src/lib/chat/variante-da-visita.ts
//
// FIX-394 — a variante do teste do telefone é atribuída por VISITA, não por
// pessoa. Decisão da call de 29/09/2026 (docs/correcoes/todo/bloco-telefone-ab/
// _bloco.md): o sorteio é "na entrada" — mesma visita, mesmo caminho; visita
// nova, sorteio novo.
//
// Módulo PURO de propósito: sem banco, sem framework, sem relógio. É ele que
// decide QUAL experiência a pessoa recebe, então precisa ser testável sem subir
// nada — e determinístico sem `Math.random()`, porque a recarga da página não
// pode trocar o caminho (senão os dois lados do teste deixam de ser comparáveis
// entre si).
//
// A única coisa que muda o resultado é a SEMENTE (o id da visita, ou da conversa
// quando não há visita). O hash é FNV-1a de 32 bits — estável, barato e com
// distribuição boa o bastante para 50/50 em ids (uuid) que já são uniformes.

/** As DUAS variantes vivas do teste. `A` ("como está hoje") foi descartada na
 *  call: medir o problema já conhecido gasta massa que não temos. Esta
 *  constante é a fonte única — o número de variantes e seus nomes saem daqui. */
export const VARIANTES_DO_TELEFONE = ["B", "C"] as const;

export type VarianteDoTelefone = (typeof VARIANTES_DO_TELEFONE)[number];

const VARIANTES_VALIDAS: ReadonlySet<string> = new Set(VARIANTES_DO_TELEFONE);

/** Guard barato: "este valor é uma variante reconhecida?". Usado onde um erro
 *  alto seria pior que um `false` (ex.: filtrar um JSON lido do banco). */
export function ehVarianteDoTelefone(valor: unknown): valor is VarianteDoTelefone {
	return typeof valor === "string" && VARIANTES_VALIDAS.has(valor);
}

/**
 * FNV-1a de 32 bits sobre a semente → inteiro sem sinal.
 *
 * Exportado porque a estabilidade do hash É o contrato: se ele mudar, visitas
 * em andamento trocam de variante no meio do teste e a leitura do dia 01/10
 * vira pó. Um teste que só olha `varianteDaVisita` não veria isso.
 */
export function hashDaSemente(semente: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < semente.length; i++) {
		hash ^= semente.charCodeAt(i);
		// FNV prime (16777619) por shift+soma, sem estourar o inteiro de 32 bits.
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

function exigirSemente(semente: unknown): string {
	if (typeof semente !== "string" || semente.trim().length === 0) {
		throw new TypeError(
			"varianteDaVisita: semente vazia ou inválida — a variante do teste precisa de um id de visita/conversa (nunca um caminho mudo)",
		);
	}
	return semente;
}

/**
 * A variante de uma visita. Mesma semente ⇒ mesma variante, sempre.
 *
 * Lança com semente vazia: uma visita sem id não pode receber um caminho
 * arbitrário em silêncio — o defeito apareceria como "50% dos leads num caminho
 * só" no dia da leitura, longe da causa.
 */
export function varianteDaVisita(semente: string): VarianteDoTelefone {
	const valida = exigirSemente(semente);
	const indice = hashDaSemente(valida) % VARIANTES_DO_TELEFONE.length;
	// `indice` é sempre 0..1 (módulo do tamanho da tupla) — o non-null aqui é
	// consequência da aritmética, não um chute.
	return VARIANTES_DO_TELEFONE[indice] as VarianteDoTelefone;
}

/**
 * A variante de uma conversa: a VISITA manda (é ela que define o sorteio da
 * entrada); sem visita — WhatsApp orgânico, conversa anterior ao cookie, teste —
 * a conversa é a semente. Nunca `Math.random()`: a mesma conversa recarregada
 * continua no mesmo caminho.
 */
export function varianteDaConversa(input: {
	visitId?: string | null;
	conversationId?: string | null;
}): VarianteDoTelefone {
	const visita = typeof input.visitId === "string" ? input.visitId.trim() : "";
	if (visita.length > 0) return varianteDaVisita(visita);
	return varianteDaVisita(input.conversationId ?? "");
}

/**
 * Lê uma variante já persistida. Desconhecida ⇒ LANÇA.
 *
 * É o oposto de "cair no default": um valor estranho no banco é sinal de que
 * alguém gravou errado (ou de que a lista mudou sem migração), e engolir isso
 * produziria um teste medindo um caminho que ninguém percorreu.
 */
export function lerVariante(valor: unknown): VarianteDoTelefone {
	if (ehVarianteDoTelefone(valor)) return valor;
	throw new TypeError(
		`lerVariante: variante desconhecida (${JSON.stringify(valor)}) — as válidas são ${VARIANTES_DO_TELEFONE.join(", ")}`,
	);
}