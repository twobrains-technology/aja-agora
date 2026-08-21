import type { ReactNode } from "react";

import { Em } from "@/components/kv/em";

/**
 * As variantes de hero da home, para teste A/B.
 *
 * O que varia é SÓ o bloco de texto do topo — chapéu, manchete e a linha de
 * apoio. O card "Fale com a Aja", o trio de categorias, o CTA e a colagem são
 * os mesmos em todas, e é isso que faz o teste medir a promessa em vez de medir
 * duas páginas diferentes. Foi também o motivo de não duplicar a landing: duas
 * cópias divergem na primeira correção que alguém esquece de aplicar nas duas.
 *
 * Os nomes vêm do vocabulário do próprio comp ("TESTE B — CONSULTIVO", "TESTE A
 * — DIRETO"), e não de letra: daqui a três variantes ninguém lembra o que era a
 * "C", mas todo mundo entende "direto".
 */
export interface HeroConteudo {
	/** Chapéu acima da manchete. TEXTO, nunca botão — a pílula do comp original
	 *  saiu justamente por parecer clicável e disputar o toque com os CTAs. */
	eyebrow?: string;
	manchete: ReactNode;
	apoio: ReactNode;
}

/**
 * O que está no ar desde sempre, e o controle do teste.
 *
 * Descreve o MECANISMO: comparar entre administradoras. É verdade verificável e
 * carrega as palavras que o H1 precisa ter ("consórcios", "administradoras"),
 * mas põe o trabalho no colo de quem chegou justamente cansado de comparar.
 *
 * Está sem chapéu de propósito. O comp propõe "CONSULTORIA INDEPENDENTE" nas
 * duas variantes, mas ligá-lo aqui mudaria o controle — e um teste com duas
 * diferenças ao mesmo tempo não diz qual delas causou o resultado.
 */
export const HERO_CONSULTIVO: HeroConteudo = {
	manchete: (
		<>
			<Em>Compare</Em> consórcios
			<br />
			entre diversas
			<br />
			<Em>administradoras</Em>
		</>
	),
	apoio: (
		<>
			A Aja reúne essas informações em um único lugar para{" "}
			<Em>facilitar sua decisão.</Em>
		</>
	),
};

/**
 * A variante em teste (comp "TESTE A — DIRETO", 2026-08-21).
 *
 * Troca o mecanismo pela PROMESSA e inverte quem faz o trabalho: a Aja encontra,
 * em vez de você comparar. É a frase que um vendedor diria, e ataca a régua pela
 * qual consórcio se decide de verdade — se a parcela cabe no mês.
 *
 * Duas coisas para vigiar quando o resultado chegar, porque nenhuma delas
 * aparece na taxa de clique:
 *
 * 1. **a manchete não diz "consórcio", e diz "crédito".** Quem lê pode entender
 *    empréstimo — crédito na mão, agora —, e consórcio não é isso. Esse visitante
 *    entra, conversa e vai embora ao descobrir que depende de contemplação. É por
 *    isso que a métrica do teste é conversa → lead qualificado, e não clique.
 * 2. **"a menor parcela" é superlativo sem escopo.** A Aja compara entre as
 *    administradoras a que tem acesso, não o mercado inteiro.
 *
 * Sem quebras fixas de linha, ao contrário do consultivo: a frase é mais longa e
 * `<br/>` cravado quebraria feio fora da largura em que foi desenhado.
 */
export const HERO_DIRETO: HeroConteudo = {
	eyebrow: "Consultoria independente",
	manchete: (
		<>
			A AJA encontra <Em>a menor parcela</Em> pro crédito que você procura.
		</>
	),
	apoio: (
		<>
			<Em>A gente compara isso com você</Em> e explica cada diferença, de maneira
			independente.
		</>
	),
};

/** Nome → conteúdo. É o que a rota da variante e (no futuro) o sorteio do proxy consultam. */
export const HEROS = {
	consultivo: HERO_CONSULTIVO,
	direto: HERO_DIRETO,
} as const;

export type HeroVariante = keyof typeof HEROS;
