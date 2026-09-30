// O REGISTRO de experimentos A/B do painel — a fonte única de "quais testes
// existem, com que braços, e qual etapa o teste move".
//
// ── Por que um registro, e não o nome do teste espalhado ─────────────────────
//
// O painel responde uma pergunta só: *"a etapa que o cliente avançou, ele veio
// por qual A/B?"* (decisão do dono, 30/09/2026), e isso vale para TODO teste A/B
// do produto — não só o do telefone. Se o filtro, o fragmento SQL, a coluna da
// exportação e o seletor da tela soubessem o nome `telefoneDoDesbloqueio`, um
// teste novo exigiria mexer em quatro lugares. Aqui o teste novo é uma ENTRADA
// nova na lista: ninguém fora deste arquivo conhece o nome da chave.
//
// ── Módulo PURO de propósito ─────────────────────────────────────────────────
//
// Sem `drizzle` e sem `@/db`: o seletor de recorte é componente de CLIENTE e
// precisa listar os experimentos sem arrastar o driver do Postgres para o bundle
// do navegador. O que toca SQL mora em `@/lib/admin/filtro-variante`.
//
// ── Sobre o valor desconhecido ───────────────────────────────────────────────
//
// Mesma régua do `filtro-origem`: par que não bate com o registro NÃO é erro nem
// tela vazia — é descartado. Um link velho ou adulterado (`?ab=x:y`) mostra o
// painel inteiro, nunca um recorte silencioso.

import { CHAVE_DO_TESTE_NO_METADATA, VARIANTES_DO_TELEFONE } from "@/lib/chat/variante-da-visita";

/** Os degraus do funil, na ordem em que acontecem.
 *
 *  É o vocabulário da ETAPA ÂNCORA: cada experimento diz qual degrau ele move, e
 *  a partir dele as etapas seguintes herdam o braço (a pessoa não troca de braço
 *  no meio da jornada). */
export type EtapaDoFunil =
	| "visitas"
	| "conversas"
	| "com_contato"
	| "identificados"
	| "qualificados"
	| "propostas"
	| "fechados";

/** Um teste A/B do produto, do ponto de vista de quem lê o painel. */
export interface Experimento {
	/** A chave em `conversations.metadata` onde o braço é gravado. */
	id: string;
	/** O nome que a tela mostra ("Teste do telefone"). */
	rotulo: string;
	/** Os braços válidos (`["A","B"]`). Qualquer outro valor no metadata é
	 *  "sem variante" — a allowlist não quebra o fechamento. */
	bracos: readonly string[];
	/** O texto de cada braço, para o seletor e para o rótulo do recorte. */
	rotulosDosBracos: Record<string, string>;
	/** A etapa que o teste move — a âncora da atribuição da pessoa. */
	etapaAncora: EtapaDoFunil;
}

/** O balde de quem está fora do teste: WhatsApp, conversa pré-teste, pessoa sem
 *  conversa com braço. `A + B + sem variante = total` tem que fechar em toda
 *  tela. */
export const SEM_BRACO = "sem-variante";

/** O cookie que faz o recorte atravessar a navegação. Cookie de SESSÃO (o
 *  seletor não escreve `max-age`): o recorte acompanha a navegação, mas não
 *  sobrevive a fechar o navegador — ninguém abre o painel amanhã vendo "só A"
 *  sem saber. */
export const COOKIE_DO_RECORTE_AB = "aja_ab";

/** O nome do parâmetro de querystring que carrega o recorte. */
export const PARAMETRO_DO_RECORTE_AB = "ab";

/** O recorte ativo: zero ou mais pares (experimento, braço).
 *
 *  `[]` = nenhum recorte = "todas". Dois experimentos no mesmo recorte são um E
 *  lógico (a linha precisa satisfazer os dois). */
export type RecorteAB = ReadonlyArray<{ experimento: string; braco: string }>;

/** OS EXPERIMENTOS VIVOS. Hoje um só — a lista existe para o segundo ser barato. */
export const EXPERIMENTOS: readonly Experimento[] = [
	{
		id: CHAVE_DO_TESTE_NO_METADATA,
		rotulo: "Teste do telefone",
		bracos: VARIANTES_DO_TELEFONE,
		rotulosDosBracos: {
			A: "A — telefone antes das ofertas",
			B: "B — ofertas embaçadas",
		},
		// O teste existe para esvaziar a etapa "não identificado": a pessoa é
		// atribuída ao braço da conversa em que ELA SE IDENTIFICOU.
		etapaAncora: "identificados",
	},
];

function experimentoPorId(id: string, registro: readonly Experimento[]): Experimento | undefined {
	return registro.find((exp) => exp.id === id);
}

/** O braço é válido para ESTE experimento (ou é o balde `sem variante`)? */
function bracoValido(exp: Experimento, braco: string): boolean {
	return braco === SEM_BRACO || exp.bracos.includes(braco);
}

/**
 * Lê o recorte cru (querystring ou cookie) para a lista de pares.
 *
 * Formato: `experimento:braco[,experimento:braco]`. Descarta par cujo
 * experimento não está no registro ou cujo braço não pertence ao experimento.
 * Um experimento por vez (o primeiro par vence) — dois pares do mesmo
 * experimento seriam um `= A AND = B`, que não casa nada.
 *
 * Nunca lança: o valor vem do usuário.
 */
export function lerRecorteAB(
	valor: unknown,
	registro: readonly Experimento[] = EXPERIMENTOS,
): RecorteAB {
	if (typeof valor !== "string") return [];
	const texto = valor.trim();
	if (!texto) return [];

	const pares: Array<{ experimento: string; braco: string }> = [];
	for (const parte of texto.split(",")) {
		const separador = parte.indexOf(":");
		if (separador <= 0) continue;

		const id = parte.slice(0, separador).trim();
		const braco = parte.slice(separador + 1).trim();
		const exp = experimentoPorId(id, registro);
		if (!exp || !bracoValido(exp, braco)) continue;
		if (pares.some((par) => par.experimento === exp.id)) continue;

		pares.push({ experimento: exp.id, braco });
	}

	return pares;
}

/** O caminho de volta: `[]` ⇒ `null` (o parâmetro some da URL). */
export function serializarRecorteAB(recorte: RecorteAB): string | null {
	if (recorte.length === 0) return null;
	return recorte.map((par) => `${par.experimento}:${par.braco}`).join(",");
}

/**
 * O texto do recorte ativo — o rótulo ESCRITO (o dono é daltônico: cor nunca é
 * o único sinal). `[]` ⇒ `null`: sem recorte, a tela não escreve nada.
 */
export function rotuloDoRecorte(
	recorte: RecorteAB,
	registro: readonly Experimento[] = EXPERIMENTOS,
): string | null {
	if (recorte.length === 0) return null;

	const partes = recorte.map((par) => {
		const exp = experimentoPorId(par.experimento, registro);
		const nome = exp?.rotulo ?? par.experimento;
		if (par.braco === SEM_BRACO) return `${nome} · sem variante`;
		return `${nome} · braço ${par.braco}`;
	});

	return `Recorte: ${partes.join(" · ")}`;
}
