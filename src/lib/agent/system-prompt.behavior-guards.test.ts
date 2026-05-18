import { describe, expect, it } from "vitest";
import { SPECIALIST_BASE_PROMPT, SYSTEM_PROMPT } from "./system-prompt";

/**
 * Camada 1 — Anti-regressão estrutural de behavior guards do prompt.
 *
 * 3 bugs reais combinados (evidências em screenshots tb-dev + eval agent-flow):
 *
 * (1) BUG-META-NARRATIVE — Bruno/moto, agent vazou "O sistema vai te guiar
 *     com botões nas próximas perguntas — é bem rápido" e ainda perguntou
 *     a experience em texto inline em vez de emitir o gate.
 *
 * (2) BUG-PERGUNTAS-RAPIDAS — mesma sessão, agent disse "Vou te fazer
 *     algumas perguntas rápidas pra achar a opção certa pra você." e
 *     terminou o turn sem chamar tool nenhuma — esperando user mandar "ok".
 *     Deveria emitir o gate de experience IMEDIATAMENTE no mesmo turn após
 *     save_contact_name.
 *
 * (3) BUG-TOOL-DUPLICATION — eval agent-flow cenário imovel/Helena mostrou
 *     save_contact_name chamado 3x e present_value_picker 3x na MESMA
 *     conversa. Só present_whatsapp_optin tinha regra dura de não repetir.
 *
 * Estes testes não chamam LLM — leem o source dos prompts e validam que as
 * regras duras existem. Se as regras estão lá e o LLM ainda regredir, a
 * cobertura adicional vive na Camada 2 (cassettes em
 * tests/regression/agent-trajectory.test.ts) e Camada 3 (eval LLM-judge).
 */

// ============================================================================
// Frases meta-narrativas observadas em vazamento real (compartilhado).
// Compartilhamos com o test legado de meta-narrative — fonte unica.
// ============================================================================
const META_NARRATIVE_PHRASES = [
	/o sistema (vai|te|ir[áa]) (te )?(guiar|conduzir|mostrar|ajudar|apresent)/i,
	/o sistema (vai|ir[áa]) mostrar/i,
	/sistema vai .{0,40}(bot[oõ]es|menu|cards?|botoes)/i,
	/(vou|irei) (te )?fazer (algumas )?(perguntas?\s+)?r[áa]pidas?/i,
	/perguntas\s+r[áa]pidas/i,
	/(pr[óo]xim[ao]s? )?perguntas? (com|via|usando|por) bot[oõ]es/i,
	/te (guiar|conduzir|ajudar) com bot[oõ]es/i,
	/(abrir|mostrar) (um |o )?menu/i,
];

// ============================================================================
// BUG 1 — Meta-narrativa do mecanismo da UI
// ============================================================================

describe("BUG-META-NARRATIVE — prompt proíbe vazar mecânica da UI", () => {
	it("contém regra dura proibindo 'sistema vai te guiar/conduzir/mostrar' ou similares", () => {
		// Pega qualquer forma que combine proibição + verbo de fala + alvo
		// (sistema / botoes / menu / proximas perguntas / mecanica).
		expect(SPECIALIST_BASE_PROMPT).toMatch(
			/N(Ã|A)O.{0,200}(vaze|mencione|verbalize|diga|exponha).{0,200}(sistema|bot[õo]es|menu|próximas? perguntas?|mec[âa]nica)/i,
		);
	});

	it("nenhuma das frases tóxicas observadas em vazamento real aparece como exemplo POSITIVO (GOOD) no prompt", () => {
		// Defesa de profundidade: nenhuma das frases meta-narrativas observadas
		// em prod pode aparecer como "exemplo do que dizer" (GOOD:). Aparecer
		// dentro de BAD: ou de lista de termos proibidos entre aspas e OK —
		// na verdade RECOMENDADO porque ensina o LLM o que NAO fazer.
		const reaisOffenders: string[] = [];

		// Procuramos OCORRENCIAS reais e olhamos o contexto imediato (~120 chars
		// pre-match). Se o contexto contem marker de proibicao (BAD:, "NAO ",
		// "NUNCA", "PROIBIDO", "termos"), ignoramos.
		for (const regex of META_NARRATIVE_PHRASES) {
			const globalRe = new RegExp(regex.source, "gi");
			let match: RegExpExecArray | null = globalRe.exec(SPECIALIST_BASE_PROMPT);
			while (match) {
				const start = Math.max(0, match.index - 120);
				const prefix = SPECIALIST_BASE_PROMPT.slice(start, match.index);
				const isInProhibitionContext =
					/BAD:|N(Ã|A)O\s|NUNCA\s|PROIBIDO|termos|"[^"\n]*$/i.test(prefix);
				if (!isInProhibitionContext) {
					reaisOffenders.push(`${regex} → "${match[0]}" (ctx: "...${prefix.slice(-60)}")`);
				}
				match = globalRe.exec(SPECIALIST_BASE_PROMPT);
			}
		}

		expect(
			reaisOffenders,
			"SPECIALIST_BASE_PROMPT não pode conter texto-modelo de meta-narrativa fora de contexto de proibição. " +
				`Encontrados: ${JSON.stringify(reaisOffenders)}`,
		).toEqual([]);
	});

	it("SYSTEM_PROMPT também tem defesa em camadas (regra anti meta-narrativa)", () => {
		// SPECIALIST normalmente vai pro modelo, mas o SYSTEM_PROMPT é baseline.
		expect(SYSTEM_PROMPT).toMatch(
			/N(Ã|A)O.{0,200}(vaze|mencione|verbalize|diga|exponha).{0,200}(sistema|bot[õo]es|menu|próximas? perguntas?|mec[âa]nica)/i,
		);
	});
});

// ============================================================================
// BUG 2 — "Perguntas rápidas" sem gate
// ============================================================================

describe("BUG-PERGUNTAS-RAPIDAS — prompt proíbe prometer perguntas sem ação + obriga gate IMEDIATO após nome", () => {
	it("contém regra dura proibindo 'perguntas rápidas/seguintes' como promessa textual sem ação", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(
			/N(Ã|A)O.{0,200}(prometa|fale|diga|escreva).{0,200}(perguntas? r[áa]pidas?|próximas? perguntas?)/i,
		);
	});

	it("contém instrução obrigando emit gate experience IMEDIATAMENTE após save_contact_name (canal web)", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(
			/ap[óo]s\s+save_contact_name.{0,150}(emit|chame|dispare|inicie).{0,80}gate|experience/i,
		);
	});

	it("orientações de coleta não dizem 'o sistema vai mostrar a proxima pergunta' em formato facilmente parafraseável", () => {
		// Bug subjacente: prompt instruía "O sistema vai mostrar a proxima
		// pergunta com botoes logo apos sua mensagem" — frase escrita em PT puro
		// fácil de parafrasear. Fix força reescrever pra forma inequívoca.
		const frasesArriscadas = [
			/sistema vai mostrar a pr[oó]xima pergunta com bot[oõ]es logo ap[oó]s sua mensagem/i,
			/sistema vai mandar logo em seguida os bot[oõ]es da pr[oó]xima etapa/i,
		];
		const violacoes: string[] = [];
		for (const regex of frasesArriscadas) {
			const m = SPECIALIST_BASE_PROMPT.match(regex);
			if (m) violacoes.push(m[0]);
		}
		expect(
			violacoes,
			"Frases de orientação interna sobre 'próxima pergunta com botões' não podem aparecer em PT puro. " +
				`Encontradas: ${JSON.stringify(violacoes)}`,
		).toEqual([]);
	});
});

// ============================================================================
// BUG 3 — Tool duplication (save_contact_name 3x, present_value_picker 3x...)
// ============================================================================

describe("BUG-TOOL-DUPLICATION — prompt tem guard contra repetir tools idempotentes", () => {
	it("tem regra dura: tools de captura/picker chamadas NO MÁXIMO 1x por conversa", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(
			/(N(Ã|A)O|nunca).{0,150}(repita|chame.{0,30}mais.{0,30}uma|chame.{0,30}duas|reaproveite).{0,150}(save_contact|present_value_picker|present_topic_picker)/i,
		);
	});

	it("a regra cobre as 6 tools idempotentes conhecidas (save_contact_name, save_contact_whatsapp, present_value_picker, present_topic_picker, present_whatsapp_optin, present_lead_form)", () => {
		// Cada tool precisa aparecer na lista próxima da regra dura. Pega o
		// bloco da regra (até 600 chars) e confere todas as 6.
		const tools = [
			"save_contact_name",
			"save_contact_whatsapp",
			"present_value_picker",
			"present_topic_picker",
			"present_whatsapp_optin",
			"present_lead_form",
		];

		const blocoRegra = SPECIALIST_BASE_PROMPT.match(
			/(N(Ã|A)O|nunca)[\s\S]{0,150}(repita|chame.{0,30}mais.{0,30}uma|reaproveite)[\s\S]{0,600}/i,
		);

		expect(
			blocoRegra,
			"Não encontrei o bloco da regra dura de anti-duplicação no SPECIALIST_BASE_PROMPT. " +
				"Esperado: 'NÃO/NUNCA repita/chame mais de uma vez ...' seguido da lista de tools.",
		).not.toBeNull();

		if (!blocoRegra) return;
		const blocoTexto = blocoRegra[0];
		const faltando = tools.filter((t) => !blocoTexto.includes(t));

		expect(
			faltando,
			"Tools idempotentes ausentes da regra dura de anti-duplicação: " +
				JSON.stringify(faltando),
		).toEqual([]);
	});
});
