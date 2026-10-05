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

/** As DUAS variantes vivas do teste, na nomenclatura do dono (29/09/2026):
 *
 *  - `A` — o telefone é pedido ANTES de qualquer oferta aparecer.
 *  - `B` — as ofertas aparecem EMBACADAS, com um clique para desbloquear; o
 *    telefone vem em seguida.
 *
 * NÃO existe `C`. A versão anterior deste arquivo usava `["B", "C"]` (o
 * `pede-antes` chamava-se B e o borrado chamava-se C, com a parcela legível) — o
 * dono renomeou e cortou a terceira ponta: "teste C nao existe, sao somente esses
 * 2". Esta constante é a fonte única do número e dos nomes das variantes.
 *
 * Renomear é seguro: nenhuma conversa em produção tinha variante gravada quando
 * a troca foi feita (medido: 0 linhas com `telefoneDoDesbloqueio` no metadata). */
export const VARIANTES_DO_TELEFONE = ["A", "B"] as const;

/** A chave em `conversations.metadata` onde o braço SORTEADO do teste é gravado.
 *
 *  Mora aqui — e não no módulo de leitura do resultado — porque este arquivo é
 *  PURO (sem banco): o registro de experimentos (`src/lib/experimentos/`), que
 *  roda também no cliente, precisa do id do experimento sem arrastar o driver do
 *  Postgres para o bundle do navegador. O módulo antigo da constante a
 *  reexporta para quem já a lia de lá.
 *
 *  Fonte única: quem grava (`api/chat/route.ts`) e quem lê (painel, exportação)
 *  usam ESTA constante. */
export const CHAVE_DO_TESTE_NO_METADATA = "telefoneDoDesbloqueio";

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
 * A variante FORÇADA por query string (`?variante=A`), para QA e para o dono.
 *
 * Existe porque o sorteio é por VISITA e determinístico: no mesmo navegador a
 * pessoa cai sempre na MESMA ponta — o dono testou quatro vezes e viu quatro
 * vezes o mesmo caminho. Sem um override, validar as duas pontas à mão é
 * loteria. Valor desconhecido é IGNORADO (não vira sorteio nem erro): o pedido
 * de QA não pode derrubar o chat de um visitante. */
export function varianteForcada(valor: unknown): VarianteDoTelefone | null {
	if (typeof valor !== "string") return null;
	const limpo = valor.trim().toUpperCase();
	return VARIANTES_VALIDAS.has(limpo) ? (limpo as VarianteDoTelefone) : null;
}

/**
 * A variante de uma conversa: a VISITA manda (é ela que define o sorteio da
 * entrada); sem visita — WhatsApp orgânico, conversa anterior ao cookie, teste —
 * a conversa é a semente. Nunca `Math.random()`: a mesma conversa recarregada
 * continua no mesmo caminho.
 *
 * A precedência é `forcar` > `daFila` > hash. O `daFila` é o braço que a FILA
 * (`src/lib/experimentos/fila.ts`) já reservou para uma conversa web NOVA — a
 * alternância estrita A, B, A, B. O hash virou o ÚLTIMO recurso, para conversa
 * que nunca passou pela criação (legado, backfill): ali não se consome a fila,
 * senão uma leitura de conversa antiga mexeria no sorteio de quem chega.
 */
export function varianteDaConversa(input: {
	visitId?: string | null;
	conversationId?: string | null;
	/** `?variante=A|B` — pedido explícito de QA/dono, ganha de tudo. */
	forcar?: unknown;
	/** Braço JÁ RESOLVIDO pela fila para uma conversa web nova. Null/ausente quando
	 *  não há fila (não se consome a fila para conversa que já existe). */
	daFila?: VarianteDoTelefone | null;
}): VarianteDoTelefone {
	const forcada = varianteForcada(input.forcar);
	if (forcada) return forcada;
	if (ehVarianteDoTelefone(input.daFila)) return input.daFila;
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
