/**
 * "Esta mensagem foi o PRODUTO que escreveu, não o cliente?"
 *
 * O funil dizia "Engajaram 166/167 = 99%" enquanto 47% das conversas web tinham
 * uma única mensagem do usuário — e ela era o texto do CTA. A causa era literal:
 * `engajou`/`escreveu` eram `EXISTS messages.role='user'`, e o CTA entrega a
 * primeira fala já pronta para a pessoa só apertar enviar
 * (`theater-chat.tsx` manda 480ms depois de o teatro abrir; o `wa.me` do botão
 * flutuante carrega o texto na querystring).
 *
 * **A regra que este módulo respeita.** O `CLAUDE.md` proíbe guard de frase
 * sobre a fala do cliente — e ele está certo, porque o espaço de frases humanas
 * é infinito e um regex sobre ele não converge. Isto não é isso: aqui a
 * comparação é contra texto que **este repositório** gera, importado das
 * constantes reais (`textos-do-cta.ts`). Quem muda a copy do chip muda o
 * predicado junto, no mesmo commit — é a diferença entre ler o próprio código e
 * adivinhar o que o cliente diria.
 *
 * **Igualdade para o fixo, prefixo para o dinâmico.** As sementes de parcela e
 * de valor carregam o número que a pessoa escolheu ("Quero um carro de R$
 * 50.000."): casar por igualdade exigiria listar o espaço inteiro de valores.
 * Igualdade onde o texto é fixo mantém o predicado apertado — "quero um carro
 * de 80 mil no maximo" (medido em produção, minúsculo) NÃO casa.
 */

import { type SQL, sql } from "drizzle-orm";
import {
	CHIP_DE_BEM,
	PRIMEIRA_FALA_WHATSAPP,
	ROTULOS_CATEGORIA_WEB,
	SEMENTE_PARCELA_PREFIXO,
	SEMENTE_VALOR_PREFIXO,
	SEMENTES_DE_BLOCO,
	TITULO_CATEGORIA_WHATSAPP,
} from "./textos-do-cta";

/** O canal da conversa — o mesmo `channel` de `conversations`. */
export type Canal = "web" | "whatsapp";

/** O que o produto escreve na web, por igualdade. */
export const TEXTOS_PRE_PREENCHIDOS_WEB: readonly string[] = [
	...Object.values(CHIP_DE_BEM),
	...ROTULOS_CATEGORIA_WEB,
	...SEMENTES_DE_BLOCO,
];

/** O que o produto escreve na web com valor variável — casa por prefixo. */
export const PREFIXOS_PRE_PREENCHIDOS_WEB: readonly string[] = [
	...Object.values(SEMENTE_PARCELA_PREFIXO),
	...Object.values(SEMENTE_VALOR_PREFIXO),
];

/** O que o produto escreve no WhatsApp, por igualdade. */
export const TEXTOS_PRE_PREENCHIDOS_WHATSAPP: readonly string[] = [
	PRIMEIRA_FALA_WHATSAPP,
	...Object.values(TITULO_CATEGORIA_WHATSAPP),
];

/**
 * Normaliza como a leitura SQL já faz (`regexp_replace(trim(x), '\s+', ' ', 'g')`).
 *
 * Sem isso, "  Quero comprar um carro." com um espaço a mais passaria batido —
 * e o CTA às vezes entrega o texto com espaço de borda.
 */
export function normalizarMensagem(texto: string): string {
	return texto.replace(/\s+/g, " ").trim();
}

/** A mensagem é texto que o produto gerou, e não o que a pessoa escreveu. */
export function ehMensagemPrePreenchida(texto: string, canal: Canal): boolean {
	const normalizado = normalizarMensagem(texto);
	if (!normalizado) return false;

	if (canal === "whatsapp") {
		return TEXTOS_PRE_PREENCHIDOS_WHATSAPP.includes(normalizado);
	}

	return (
		TEXTOS_PRE_PREENCHIDOS_WEB.includes(normalizado) ||
		PREFIXOS_PRE_PREENCHIDOS_WEB.some((prefixo) => normalizado.startsWith(prefixo))
	);
}

/**
 * O mesmo predicado como fragmento `sql`, para uso nas queries do funil.
 *
 * **A união dos dois canais, e não a lista do canal da linha.** A query poderia
 * olhar `c.channel`, mas o custo de errar é assimétrico: um falso positivo
 * exigiria uma pessoa digitar, à mão, exatamente "Oi! Quero comparar
 * consórcios." numa conversa web (ou "Automóvel" no WhatsApp) — e um falso
 * negativo é exatamente o defeito que este módulo existe para corrigir. Fica a
 * união; a lista por canal continua em `ehMensagemPrePreenchida`, onde ela vale
 * a pena.
 *
 * `coluna` é o `content` de `messages` (aceita qualquer expressão que resolva
 * para o texto da mensagem).
 */
export function sqlMensagemPrePreenchida(coluna: SQL): SQL {
	const normalizada = sql`regexp_replace(trim(${coluna}), '\\s+', ' ', 'g')`;

	const exatos = [...TEXTOS_PRE_PREENCHIDOS_WEB, ...TEXTOS_PRE_PREENCHIDOS_WHATSAPP].map(
		(texto) => sql`${texto}`,
	);

	const condicoes = [
		sql`${normalizada} IN (${sql.join(exatos, sql`, `)})`,
		...PREFIXOS_PRE_PREENCHIDOS_WEB.map((prefixo) => sql`${normalizada} LIKE ${`${prefixo}%`}`),
	];

	return sql`(${sql.join(condicoes, sql` OR `)})`;
}

/**
 * A conversa tem ao menos uma mensagem do cliente que o produto NÃO escreveu —
 * o "engajou"/"escreveu" honesto.
 *
 * Recebe a expressão do id da conversa porque cada consulta chega com um alias
 * diferente (`c` no funil, `c` no CTE do Percurso); acoplar a um alias faria o
 * fragmento compilar num lugar e explodir no outro.
 */
export function sqlEscreveuAlgoProprio(idDaConversa: SQL): SQL {
	return sql`EXISTS (SELECT 1 FROM messages mm
      WHERE mm.conversation_id = ${idDaConversa}
        AND mm.role = 'user'
        AND NOT ${sqlMensagemPrePreenchida(sql`mm.content`)})`;
}

/**
 * A pessoa só mandou a mensagem pré-preenchida: existe mensagem do cliente, e
 * NENHUMA que o produto não tenha escrito.
 *
 * É o degrau que faltava — o vazamento real do funil (126 das 167 no recorte do
 * diagnóstico), que estava somado dentro de "Engajaram" e por isso não aparecia.
 */
export function sqlSoPrePreenchida(idDaConversa: SQL): SQL {
	return sql`(EXISTS (SELECT 1 FROM messages mm
      WHERE mm.conversation_id = ${idDaConversa}
        AND mm.role = 'user')
      AND NOT ${sqlEscreveuAlgoProprio(idDaConversa)})`;
}
