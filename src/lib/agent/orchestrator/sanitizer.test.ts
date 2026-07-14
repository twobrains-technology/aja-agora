/**
 * FIX-188 (Camada 1 estrutural) — sanitizer de texto EFÊMERO × FINAL.
 *
 * Print do Kairo (2026-07-01): em turno multi-step, o modelo escreveu preâmbulos
 * de PROCESSO antes de cada tool-call ("deixa eu puxar os números reais", "vou
 * buscar as opções certas", "preciso primeiro buscar os grupos", "um segundo",
 * "deixa eu usar a ferramenta certa"), e TODOS foram persistidos/enviados como
 * mensagem final. A regra soft no prompt não segura (Lei 4); a BARREIRA REAL é
 * este sanitizer determinístico (Lei 1/4): preâmbulo de processo NUNCA vira bolha
 * — só a resposta de RESULTADO.
 *
 * Pós-onda-1 (FIX-186): o erro já vira diretiva e o runner suprime narração após
 * falha; então o sanitizer só cuida de preâmbulo de SUCESSO.
 */
import { describe, expect, it } from "vitest";
import {
	EphemeralTextFilter,
	isBannedLexicon,
	isCatalogResearchClaim,
	isDocumentReceiptClaim,
	isHallucinatedAdministradoraClaim,
	isMechanismNarrationClaim,
	isPrazoReductionClaim,
	isPrematureReservationClaim,
	isProactiveCallbackClaim,
	isProcessPreamble,
	isScorePercentageClaim,
	isProposalCompletionClaim,
	isTaxaContemplacaoClaim,
	isTechnicalFallback,
	joinSeparator,
	normalizeGluedSentences,
	scrubCpf,
	splitSegments,
	stripEmoji,
	stripProcessPreamble,
} from "./sanitizer";

// Frases EXATAS do print (versão Kairo + versão Maria) que NÃO podem vazar.
const PREAMBULOS_DO_PRINT = [
	"Deixa eu puxar os números reais da sua faixa:",
	"Preciso buscar as opções reais primeiro antes de simular.",
	"Deixa eu buscar as melhores opções na sua faixa:",
	"Vou buscar as opções certas pra você:",
	"Preciso primeiro buscar os grupos disponíveis.",
	"Um segundo:",
	"Deixa eu usar a ferramenta certa pra isso:",
];

// Copy LEGÍTIMA (transição honesta / resultado) que TEM de sobreviver.
const COPY_LEGITIMA = [
	"Bora ver o que encaixa na sua faixa:",
	"Olha só o que a gente encontrou na sua faixa de R$ 130.000:",
	"Show, esse plano encaixa bem no seu orçamento.",
	"Você quer buscar em outra faixa?",
	"Vamos ver as opções juntos.",
];

describe("FIX-188 — isProcessPreamble reconhece preâmbulo de processo", () => {
	it("classifica como preâmbulo todas as frases de processo do print", () => {
		for (const p of PREAMBULOS_DO_PRINT) {
			expect(isProcessPreamble(p), `deveria dropar: "${p}"`).toBe(true);
		}
	});

	it("NÃO classifica copy legítima como preâmbulo (zero falso-positivo)", () => {
		for (const c of COPY_LEGITIMA) {
			expect(isProcessPreamble(c), `NÃO pode dropar: "${c}"`).toBe(false);
		}
	});

	it("segmento vazio não é preâmbulo", () => {
		expect(isProcessPreamble("")).toBe(false);
		expect(isProcessPreamble("   ")).toBe(false);
	});
});

describe("FIX-335 — 'Agora vou <ação de produto>' é anúncio de passo (log de pipeline), entra na família de isProcessPreamble", () => {
	// Frases EXATAS do veredito (rodada 1, 4/4 dossiês web) que soam como log de
	// execução em vez de gente vendendo.
	const ANUNCIOS_DE_PASSO = [
		"Agora vou recomendar a melhor opção pra você:",
		"Agora vou te mostrar a mais adequada pro seu perfil:",
		"Agora deixa eu te mostrar como funciona em detalhes:",
		"Vou recomendar a mais adequada pro seu perfil:",
		"Agora deixa eu aprofundar os números dessa opção:",
		"Vou destacar a mais adequada pro seu perfil agora:",
		"Agora dá uma olhada no detalhe dessa opção:",
		"Agora vou te recomendar a mais adequada:",
		"Agora vou simular a melhor opção pra você:",
		"Agora vou detalhar como fica sua simulação:",
		"Agora deixa eu aprofundar a simulação com o cenário completo, incluindo lance:",
	];

	it("isProcessPreamble classifica como preâmbulo todos os anúncios de passo do veredito", () => {
		for (const p of ANUNCIOS_DE_PASSO) {
			expect(isProcessPreamble(p), `deveria dropar: "${p}"`).toBe(true);
		}
	});

	it("NÃO pega narração legítima com conteúdo real (entidade/número nomeados)", () => {
		expect(isProcessPreamble("Vou simular a Rodobens com R$ 900 mil:")).toBe(false);
		expect(isProcessPreamble("Essa é a que eu indicaria pra alguém da minha família:")).toBe(false);
		expect(isProcessPreamble("A parcela fica em R$ 2.778,34 por mês.")).toBe(false);
	});

	it("stripProcessPreamble remove o anúncio de passo mas preserva o resto do texto", () => {
		const input =
			"Encontramos 3 boas opções pra você! Agora vou te recomendar a mais adequada: essa é ótima pro seu perfil.";
		const out = stripProcessPreamble(input);
		expect(out.toLowerCase()).not.toContain("agora vou te recomendar");
		expect(out).toContain("Encontramos 3 boas opções pra você!");
	});
});

describe("FIX-188 — stripProcessPreamble limpa o texto composto", () => {
	it("dropa o segmento de preâmbulo e preserva a saudação/resultado colados", () => {
		const input =
			"Boa, Kairo! Pra simular direitinho, deixa eu puxar os números reais da sua faixa:";
		// A saudação sobrevive; o preâmbulo (2ª frase) some.
		const out = stripProcessPreamble(input);
		expect(out).toContain("Boa, Kairo!");
		expect(out.toLowerCase()).not.toContain("deixa eu puxar");
	});

	it("reconstrói o empilhamento do print SEM nenhum preâmbulo, mantendo o resultado", () => {
		const input =
			"Deixa eu buscar as melhores opções na sua faixa: " +
			"Vou buscar as opções certas pra você: " +
			"Preciso primeiro buscar os grupos disponíveis. Um segundo: " +
			"Olha só o que a gente encontrou na sua faixa:";
		const out = stripProcessPreamble(input);
		expect(out.toLowerCase()).not.toContain("deixa eu buscar");
		expect(out.toLowerCase()).not.toContain("vou buscar");
		expect(out.toLowerCase()).not.toContain("preciso primeiro buscar");
		expect(out.toLowerCase()).not.toContain("um segundo");
		// Só o resultado sobra.
		expect(out).toContain("Olha só o que a gente encontrou na sua faixa:");
	});

	it("não mexe em texto 100% legítimo", () => {
		const input = "Olha só o que a gente encontrou na sua faixa de R$ 130.000:";
		expect(stripProcessPreamble(input)).toBe(input);
	});

	it("string vazia passa incólume", () => {
		expect(stripProcessPreamble("")).toBe("");
	});
});

describe("FIX-188 — EphemeralTextFilter (stream por frase, nada vaza ao vivo)", () => {
	it("preâmbulo partido entre deltas NUNCA é emitido", () => {
		const f = new EphemeralTextFilter();
		let emitted = "";
		emitted += f.push("Deixa eu ");
		emitted += f.push("buscar as opções");
		emitted += f.push(" certas pra você:");
		emitted += f.flush();
		expect(emitted).toBe("");
	});

	it("frase legítima só é emitida quando COMPLETA, uma vez", () => {
		const f = new EphemeralTextFilter();
		let emitted = "";
		emitted += f.push("Olha só o que a gente");
		// ainda incompleta: nada sai
		expect(emitted).toBe("");
		emitted += f.push(" encontrou na sua faixa:");
		emitted += f.flush();
		expect(emitted).toContain("Olha só o que a gente encontrou na sua faixa:");
	});

	it("mistura: preâmbulo dropado, resultado preservado no mesmo stream", () => {
		const f = new EphemeralTextFilter();
		let emitted = "";
		for (const delta of [
			"Deixa eu buscar as opções na sua faixa: ",
			"Olha só o que ",
			"encontrei pra você:",
		]) {
			emitted += f.push(delta);
		}
		emitted += f.flush();
		expect(emitted.toLowerCase()).not.toContain("deixa eu buscar");
		expect(emitted).toContain("Olha só o que encontrei pra você:");
	});

	it("flush do trailing sem pontuação final também passa pelo filtro", () => {
		const f = new EphemeralTextFilter();
		let emitted = f.push("Vou buscar os grupos agora"); // sem . no fim
		expect(emitted).toBe(""); // incompleto, segurado
		emitted += f.flush(); // trailing → filtrado (é preâmbulo) → dropado
		expect(emitted).toBe("");
	});
});

// FIX-347 (loop-de-goal desamarra, rodada 4, P1.1 — "Acho que me perdi"
// regrediu): quando o sanitizer dropa TODOS os segmentos de um turno, o
// texto final fica vazio e o guard de turno-vazio (empty-turn-guard.ts)
// dispara o fallback enlatado "Acho que me perdi por aqui" — mesmo quando o
// modelo respondeu de verdade e só foi barrado por um invariante. Sem
// nenhuma instrumentação, é impossível distinguir "modelo não disse nada" de
// "modelo disse algo e o sanitizer comeu tudo". `droppedSegmentReasons()`
// expõe QUAL guard bloqueou, pra o runner poder dar ao modelo uma segunda
// chance com o motivo — nunca relaxando o guard, nunca com texto fixo.
describe("FIX-347 — EphemeralTextFilter expõe o MOTIVO de cada drop (turno vazio precisa saber por quê)", () => {
	it("sem nenhum drop, a lista de motivos fica vazia", () => {
		const f = new EphemeralTextFilter();
		f.push("Show, boa escolha!");
		f.flush();
		expect(f.droppedSegmentReasons()).toEqual([]);
	});

	it("preâmbulo de processo dropado registra o motivo 'process-preamble'", () => {
		const f = new EphemeralTextFilter();
		f.push("Deixa eu buscar as opções certas pra você:");
		f.flush();
		expect(f.droppedSegmentReasons()).toEqual(["process-preamble"]);
	});

	it("administradora fora das ofertas reais registra 'hallucinated-administradora'", () => {
		const f = new EphemeralTextFilter(() => ({
			hasReceivedDocuments: false,
			hasSearchToolCall: false,
			hasProposal: false,
			shownAdministradoras: ["ITAU CONSORCIOS"],
		}));
		f.push("A Bradesco tem uma parcela ótima pra você.");
		f.flush();
		expect(f.droppedSegmentReasons()).toEqual(["hallucinated-administradora"]);
	});

	it("turno com 2 segmentos dropados pelo MESMO motivo acumula só uma vez (sem duplicar)", () => {
		const f = new EphemeralTextFilter();
		f.push("Vou buscar as opções certas pra você. Um segundo:");
		f.flush();
		expect(f.droppedSegmentReasons()).toEqual(["process-preamble"]);
	});

	it("segmento legítimo preservado não entra na lista de motivos", () => {
		const f = new EphemeralTextFilter();
		f.push("Deixa eu buscar as opções certas pra você. Olha só o que encontrei:");
		f.flush();
		expect(f.droppedSegmentReasons()).toEqual(["process-preamble"]);
	});
});

// FIX-248 (rodada 3, Fable r2, N1 P0): "Juntando R$ 4." | "000,00 por mês" —
// o splitter tratava o PONTO DE MILHAR como fim de frase e quebrava o valor
// monetário em 2 bolhas ao vivo. Superfície criada pela narração de dinheiro
// do FIX-241 ("juntando R$ 4.000,00 por mês, lá pelo mês X..."). Guarda de
// dígito: um "." colado a um dígito (separador de milhar/decimal) NUNCA é
// fronteira de sentença — só um "." colado a LETRA é.
describe("FIX-248 — guarda de dígito no splitter (valor monetário não quebra em 2 bolhas)", () => {
	it("splitSegments NÃO quebra 'R$ 4.000,00' no ponto de milhar", () => {
		const segments = splitSegments("Juntando R$ 4.000,00 por mês. Isso ajuda muito.");
		expect(segments.some((s) => /^000,00/.test(s.trim()))).toBe(false);
		// reconstrução é lossless (join sem separador reconstitui o original).
		expect(segments.join("")).toBe("Juntando R$ 4.000,00 por mês. Isso ajuda muito.");
	});

	it("splitSegments ainda quebra frases reais (fim de frase real preservado)", () => {
		const segments = splitSegments("Primeira frase. Segunda frase.");
		expect(segments).toEqual(["Primeira frase.", " Segunda frase."]);
	});

	it("splitSegments lida com milhar duplo ('R$ 1.234.567,00') sem quebrar em nenhum ponto interno", () => {
		const segments = splitSegments("O total foi R$ 1.234.567,00 no fim das contas.");
		expect(segments).toHaveLength(1);
	});

	it("EphemeralTextFilter: 'Juntando R$ 4.' seguido de '000,00 por mês.' emite como UMA bolha só", () => {
		const f = new EphemeralTextFilter();
		let emitted = "";
		emitted += f.push("Juntando R$ 4.");
		// o "." de milhar NÃO pode ter disparado emissão prematura aqui.
		expect(emitted).toBe("");
		emitted += f.push("000,00 por mês, lá pelo mês 11 dá.");
		emitted += f.flush();
		expect(emitted).toContain("Juntando R$ 4.000,00 por mês");
		// NUNCA aparece o valor cortado ao meio.
		expect(emitted).not.toContain("R$ 4.\n");
	});

	it("EphemeralTextFilter: frase legítima após o valor monetário ainda quebra normalmente", () => {
		const f = new EphemeralTextFilter();
		let emitted = "";
		emitted += f.push("O valor é R$ 4.000,00. ");
		emitted += f.push("Show, vamos em frente.");
		emitted += f.flush();
		expect(emitted).toContain("O valor é R$ 4.000,00.");
		expect(emitted).toContain("Show, vamos em frente.");
	});
});

describe("FIX-190 — fallback técnico ('atualiza a página') é dropado em runtime (barreira em código)", () => {
	const REFRESH_SEGMENTS = [
		"Atualiza a página e tenta de novo.",
		"Recarregue a página, por favor.",
		"Dá um refresh aí que resolve.",
		"Tenta de novo recarregando a tela.",
	];

	it("isTechnicalFallback pega as frases de refresh", () => {
		for (const s of REFRESH_SEGMENTS) {
			expect(isTechnicalFallback(s), `deveria dropar: "${s}"`).toBe(true);
		}
	});

	it("NÃO pega copy legítima que fala de 'página'/'atualizar' sem instruir refresh", () => {
		expect(isTechnicalFallback("Vou atualizar o valor da simulação pra você.")).toBe(false);
		expect(isTechnicalFallback("Essa página da simulação mostra tudo.")).toBe(false);
	});

	it("stripProcessPreamble também remove o segmento de refresh", () => {
		const input = "Ops, deu um probleminha. Atualiza a página e tenta de novo. Beleza?";
		const out = stripProcessPreamble(input);
		expect(out.toLowerCase()).not.toContain("atualiza a página");
		// o resto sobrevive
		expect(out).toContain("Ops, deu um probleminha.");
	});

	it("EphemeralTextFilter NÃO emite a frase de refresh ao vivo", () => {
		const f = new EphemeralTextFilter();
		let emitted = f.push("Atualiza a página e tenta de novo.");
		emitted += f.flush();
		expect(emitted.toLowerCase()).not.toContain("atualiza a página");
	});
});

describe("FIX-234 — redução de prazo é PROIBIDA (D7: abatimento vira parcela menor, nunca prazo menor)", () => {
	const REDUCAO_PRAZO_SEGMENTS = [
		"Com esse lance dá pra reduzir o prazo do seu consórcio.",
		"Isso ajuda a terminar antes do previsto.",
		"Assim você consegue quitar antes do prazo final.",
	];

	it("isPrazoReductionClaim pega as frases de redução de prazo", () => {
		for (const s of REDUCAO_PRAZO_SEGMENTS) {
			expect(isPrazoReductionClaim(s), `deveria dropar: "${s}"`).toBe(true);
		}
	});

	it("NÃO pega copy legítima sobre prazo (menção neutra, sem prometer redução)", () => {
		expect(isPrazoReductionClaim("O prazo desse grupo é de 60 meses.")).toBe(false);
		expect(isPrazoReductionClaim("A parcela fica menor com o abatimento.")).toBe(false);
	});

	it("stripProcessPreamble também remove o segmento de redução de prazo", () => {
		const input =
			"Boa notícia! Com esse lance dá pra reduzir o prazo do seu consórcio. Vamos seguir?";
		const out = stripProcessPreamble(input);
		expect(out.toLowerCase()).not.toContain("reduzir o prazo");
		expect(out).toContain("Boa notícia!");
	});
});

describe("FIX-234 — reserva/garantia PREMATURA é PROIBIDA (invariante #9: nada foi contratado ainda)", () => {
	const RESERVA_PREMATURA_SEGMENTS = [
		"Sua cota já está garantida com esse grupo.",
		"Sua cota está garantida, pode ficar tranquilo.",
		"Já reservado, parabéns!",
		"Você já está no grupo, é só aguardar.",
	];

	it("isPrematureReservationClaim pega as frases de reserva/garantia prematura", () => {
		for (const s of RESERVA_PREMATURA_SEGMENTS) {
			expect(isPrematureReservationClaim(s), `deveria dropar: "${s}"`).toBe(true);
		}
	});

	it("NÃO pega copy legítima que não afirma reserva/garantia", () => {
		expect(isPrematureReservationClaim("Vamos ver se esse grupo faz sentido pra você.")).toBe(
			false,
		);
	});

	it("stripProcessPreamble também remove o segmento de reserva prematura", () => {
		const input = "Boa! Sua cota já está garantida com esse grupo. Só falta assinar depois.";
		const out = stripProcessPreamble(input);
		expect(out.toLowerCase()).not.toContain("garantida");
		expect(out).toContain("Boa!");
	});
});

// FIX-243 (rodada 2, Fable r1, §D5.2 do veredito) — B2 T5, o agente disse "A
// ITAÚ se destaca pela boa taxa de contemplação e uma taxa de administração de
// 13,46% — uma das mais baixas da faixa". `taxaContemplacao` é campo PROIBIDO
// (semântica não documentada, spec 05); o guard existente cobre só payload/UI
// (no-taxa-contemplacao.guard.test.ts) — a FALA do LLM vazava o conceito como
// argumento de venda. Fonte permitida de sinal de contemplação:
// contemplados/mês (contagem real), nunca "taxa".
describe("FIX-243 — 'taxa de contemplação' é PROIBIDA na fala (campo sem semântica documentada)", () => {
	const TAXA_CONTEMPLACAO_SEGMENTS = [
		"A ITAÚ se destaca pela boa taxa de contemplação e uma taxa de administração de 13,46%.",
		"Esse grupo tem uma taxa de contemplação alta.",
		"A taxa de contemplação dessa oferta é de 60%.",
		"Gosto dessa oferta pela taxa de contemplação baixa.",
	];

	it("isTaxaContemplacaoClaim pega as frases que citam taxa de contemplação", () => {
		for (const s of TAXA_CONTEMPLACAO_SEGMENTS) {
			expect(isTaxaContemplacaoClaim(s), `deveria dropar: "${s}"`).toBe(true);
		}
	});

	it("NÃO pega copy legítima sobre contemplação (contagem real, sem 'taxa')", () => {
		expect(isTaxaContemplacaoClaim("Esse grupo contempla 8 pessoas por mês.")).toBe(false);
		expect(isTaxaContemplacaoClaim("A contemplação pode vir por sorteio ou lance.")).toBe(false);
		expect(isTaxaContemplacaoClaim("A taxa de administração é de 13,46%.")).toBe(false);
	});

	it("stripProcessPreamble também remove o segmento de taxa de contemplação", () => {
		const input =
			"Boa! A ITAÚ se destaca pela boa taxa de contemplação e uma taxa de administração de 13,46%. Vamos seguir?";
		const out = stripProcessPreamble(input);
		expect(out.toLowerCase()).not.toContain("taxa de contemplação");
		expect(out).toContain("Boa!");
	});
});

describe("FIX-334 — score/aderência em percentual é PROIBIDO na fala (regressão contra score-label.ts)", () => {
	const SCORE_PERCENTAGE_SEGMENTS = [
		"Você tem a Itaú em destaque com score de 73%.",
		"Essa oferta tem 73% de aderência ao seu perfil.",
		"O score de compatibilidade é 91%.",
		"A aderência dessa oferta é de 60%.",
		"Essa opção tem 85% de compatibilidade com o que você pediu.",
	];

	it("isScorePercentageClaim pega as frases que citam score/aderência/compatibilidade em %", () => {
		for (const s of SCORE_PERCENTAGE_SEGMENTS) {
			expect(isScorePercentageClaim(s), `deveria dropar: "${s}"`).toBe(true);
		}
	});

	it("NÃO pega copy legítima (rótulo qualitativo, sem percentual de score)", () => {
		expect(isScorePercentageClaim("Essa opção encaixa muito bem pra você.")).toBe(false);
		expect(isScorePercentageClaim("É uma boa opção pro seu perfil.")).toBe(false);
		expect(isScorePercentageClaim("A taxa de administração é de 13,46%.")).toBe(false);
		expect(isScorePercentageClaim("Contempla 8 pessoas por mês.")).toBe(false);
	});

	it("stripProcessPreamble também remove o segmento de score percentual", () => {
		const input = "Boa! Você tem a Itaú em destaque com score de 73%. Vamos seguir?";
		const out = stripProcessPreamble(input);
		expect(out.toLowerCase()).not.toContain("score de 73%");
		expect(out).toContain("Boa!");
	});
});

describe("FIX-234 — léxico banido (tom consultivo, não 'brother')", () => {
	const LEXICO_BANIDO_SEGMENTS = [
		"Saco, né? Entendo bem.",
		"Dá pra furar a fila com um lance.",
		"Todo carro-problema incomoda.",
		"Qual carro tá na sua cabeça?",
	];

	it("isBannedLexicon pega as frases do léxico banido", () => {
		for (const s of LEXICO_BANIDO_SEGMENTS) {
			expect(isBannedLexicon(s), `deveria dropar: "${s}"`).toBe(true);
		}
	});

	it("NÃO pega copy legítima equivalente (as versões ✅ do docx)", () => {
		expect(isBannedLexicon("Entendo bem — quando o carro dá trabalho, atrapalha tudo.")).toBe(
			false,
		);
		expect(isBannedLexicon("Dá pra antecipar a contemplação com um lance.")).toBe(false);
		expect(isBannedLexicon("Qual carro você tem em mente?")).toBe(false);
	});
});

// FIX-249 (rodada 3, Fable r2, N2 P0): o agente prometeu "deixa eu resolver
// isso e já te retorno" / "assim que eu conseguir… te retorno" — a WEB NÃO
// TEM canal proativo (nenhum worker manda mensagem depois nesta conversa);
// a promessa é um beco-sem-saída (o run inteiro morreu esperando algo que
// nunca chegaria).
describe("FIX-249 — promessa de retorno/contato proativo é PROIBIDA na web (beco-sem-saída)", () => {
	const PROMESSAS_PROIBIDAS = [
		"Deixa eu resolver isso e já te retorno.",
		"Assim que eu conseguir, te retorno.",
		"Vou verificar e já te aviso.",
		"Entro em contato depois com você.",
	];

	it("isProactiveCallbackClaim pega as promessas de retorno proativo", () => {
		for (const s of PROMESSAS_PROIBIDAS) {
			expect(isProactiveCallbackClaim(s), `deveria dropar: "${s}"`).toBe(true);
		}
	});

	it("NÃO pega copy legítima que não promete contato futuro", () => {
		expect(isProactiveCallbackClaim("Me confirma seus dados de contato pra eu seguir?")).toBe(
			false,
		);
		expect(isProactiveCallbackClaim("Nossa especialista te chama em alguns minutos.")).toBe(false);
		expect(isProactiveCallbackClaim("")).toBe(false);
	});

	it("stripProcessPreamble também remove o segmento de retorno proativo", () => {
		const texto = "Não encontrei essa opção aqui. Deixa eu resolver isso e já te retorno.";
		const limpo = stripProcessPreamble(texto);
		expect(limpo.toLowerCase()).not.toContain("te retorno");
	});
});

// FIX-283 (P2, veredito Sonnet r9pos, G-D — viola D23, jornada-canonica.md):
// o agente parafraseou a instrução server-side do WhatsApp optin
// ("por conta própria", "o SISTEMA [...] automaticamente, com card próprio",
// whatsappOptinSection("done")) como se fosse algo a VERBALIZAR pro usuário
// em vez de regra interna a seguir em silêncio — meta-narrativa do próprio
// mecanismo. D23 é claro: o agente NUNCA narra o próprio mecanismo, mesmo se
// o cliente perguntar diretamente.
describe("FIX-283 — narração do próprio mecanismo interno é PROIBIDA (D23, mesmo se o cliente perguntar)", () => {
	const MECANISMO_NARRADO_SEGMENTS = [
		"Consigo te ajudar com o consórcio automóvel, mas não crio esse tipo de texto por conta própria — isso é conduzido automaticamente pelo sistema quando chega a hora certa.",
		"O sistema decide isso automaticamente.",
		"Isso não sou eu que decido, é o sistema.",
	];

	it("isMechanismNarrationClaim pega as frases que narram o mecanismo interno", () => {
		for (const s of MECANISMO_NARRADO_SEGMENTS) {
			expect(isMechanismNarrationClaim(s), `deveria dropar: "${s}"`).toBe(true);
		}
	});

	it("NÃO pega copy operacional legítima que menciona 'sistema'/'automaticamente' em outro sentido", () => {
		expect(
			isMechanismNarrationClaim("O sistema vai te avisar quando a proposta mudar de status."),
		).toBe(false);
		expect(isMechanismNarrationClaim("Sua parcela é debitada automaticamente todo mês.")).toBe(
			false,
		);
		expect(isMechanismNarrationClaim("")).toBe(false);
	});

	it("stripProcessPreamble também remove o segmento de meta-narrativa do mecanismo — dropa o trecho EXATO do dossiê (mario-sem-lance turno 7)", () => {
		const input =
			"Aqui está o detalhamento completo da ITAÚ. Quer ajustar o valor do bem? Consigo te ajudar com o consórcio automóvel, mas não crio esse tipo de texto por conta própria — isso é conduzido automaticamente pelo sistema quando chega a hora certa. Sobre o carro: quer ajustar o valor do bem ou seguir com o que já vimos da ITAÚ?";
		const out = stripProcessPreamble(input);
		expect(out.toLowerCase()).not.toContain("por conta própria");
		expect(out.toLowerCase()).not.toContain("conduzido automaticamente");
		expect(out).toContain("Aqui está o detalhamento completo da ITAÚ.");
	});
});

describe("FIX-189 — normalizeGluedSentences separa falas coladas pelo modelo", () => {
	it("separa 'corretos.Show' (frase colada sem espaço) em parágrafos", () => {
		const input = "com os dados corretos.Show, esse plano encaixa bem.";
		const out = normalizeGluedSentences(input);
		expect(out).not.toContain("corretos.Show");
		expect(out).toContain("corretos.\n\nShow");
	});

	it("NÃO mexe em valores monetários (R$ 1.000,00) nem em números com ponto", () => {
		expect(normalizeGluedSentences("O valor é R$ 1.000,00 hoje.")).toBe(
			"O valor é R$ 1.000,00 hoje.",
		);
		expect(normalizeGluedSentences("são 72.000 no total")).toBe("são 72.000 no total");
	});

	it("NÃO mexe em sigla com pontos (maiúscula antes do ponto)", () => {
		expect(normalizeGluedSentences("U.S.A. é longe")).toBe("U.S.A. é longe");
	});

	it("NÃO mexe em frase já espaçada corretamente", () => {
		const ok = "Tudo certo. Show, esse plano encaixa.";
		expect(normalizeGluedSentences(ok)).toBe(ok);
	});

	it("string vazia passa incólume", () => {
		expect(normalizeGluedSentences("")).toBe("");
	});
});

// FIX-270 (rodada 8, veredito Fable r7, D5 — ÚNICO bloqueador pra prod): o
// agente FABRICOU estado no pós-fecho — "os documentos já foram recebidos pela
// administradora" (nenhum upload aconteceu, o cliente pode nunca enviar) e 2×
// "não apareceu nenhum grupo novo na faixa hoje" (toolsCalled=[], nenhuma
// re-busca real). Estado NUNCA vem da narrativa do LLM (Lei 1) — só do evento
// real: upload confirmado (`meta.documentSlotsSent`) ou tool-call de busca de
// fato disparada NESTE turno. `isDocumentReceiptClaim`/`isCatalogResearchClaim`
// classificam o SEGMENTO; a decisão de dropar exige o contexto real (2ª
// barreira — puro texto não decide sozinho, precisa do fato).
describe("FIX-270 — isDocumentReceiptClaim reconhece afirmação de recebimento de documento", () => {
	const CLAIMS = [
		"Os documentos já foram recebidos pela administradora.",
		"Seus documentos já foram recebidos, pode ficar tranquilo.",
		"Já recebemos seus documentos, obrigado!",
		"Recebemos os documentos, vamos seguir com a análise.",
		"Os documentos já chegaram por aqui.",
	];

	it("classifica como afirmação de recebimento todas as frases observadas", () => {
		for (const c of CLAIMS) {
			expect(isDocumentReceiptClaim(c), `deveria classificar: "${c}"`).toBe(true);
		}
	});

	it("NÃO classifica pedido/instrução futura de envio (sem afirmar recebimento)", () => {
		expect(isDocumentReceiptClaim("Pode me mandar seus documentos (RG ou CNH)?")).toBe(false);
		expect(
			isDocumentReceiptClaim(
				"Assim que você enviar os documentos, a gente confirma o recebimento.",
			),
		).toBe(false);
		expect(isDocumentReceiptClaim("Vou precisar do seu RG ou CNH pra seguir.")).toBe(false);
	});

	it("segmento vazio não é afirmação de recebimento", () => {
		expect(isDocumentReceiptClaim("")).toBe(false);
	});
});

describe("FIX-270 — isCatalogResearchClaim reconhece afirmação de re-busca no catálogo", () => {
	const CLAIMS = [
		"Não apareceu nenhum grupo novo na faixa hoje.",
		"Rebusquei e não achei nada novo.",
		"Busquei de novo e não encontrei nenhuma opção nova.",
		"Consultei o catálogo e segue igual.",
		"Verifiquei o catálogo agora e não mudou nada.",
	];

	it("classifica como afirmação de re-busca todas as frases observadas", () => {
		for (const c of CLAIMS) {
			expect(isCatalogResearchClaim(c), `deveria classificar: "${c}"`).toBe(true);
		}
	});

	it("NÃO classifica menção neutra às opções já exibidas (sem afirmar nova busca)", () => {
		expect(isCatalogResearchClaim("Olha as opções que já te mostrei aqui em cima.")).toBe(false);
		expect(isCatalogResearchClaim("Dessas 3 que apareceram, qual te interessa mais?")).toBe(false);
	});

	it("segmento vazio não é afirmação de re-busca", () => {
		expect(isCatalogResearchClaim("")).toBe(false);
	});
});

describe("FIX-270 — stripProcessPreamble com contexto dropa estado sem lastro real", () => {
	it("dropa 'documentos já recebidos' quando hasReceivedDocuments=false", () => {
		const input =
			"Boa! Os documentos já foram recebidos pela administradora. Qualquer coisa te aviso.";
		const out = stripProcessPreamble(input, {
			hasReceivedDocuments: false,
			hasSearchToolCall: false,
			hasProposal: true,
		});
		expect(out.toLowerCase()).not.toContain("recebidos");
		expect(out).toContain("Boa!");
	});

	it("PRESERVA 'documentos já recebidos' quando hasReceivedDocuments=true (evento real aconteceu)", () => {
		const input = "Boa! Os documentos já foram recebidos pela administradora.";
		const out = stripProcessPreamble(input, {
			hasReceivedDocuments: true,
			hasSearchToolCall: false,
			hasProposal: true,
		});
		expect(out).toContain("recebidos");
	});

	it("dropa 'não apareceu grupo novo' quando hasSearchToolCall=false (0 tool-calls no turno)", () => {
		const input =
			"Dei uma olhada aqui. Não apareceu nenhum grupo novo na faixa hoje. Quer ver outra faixa?";
		const out = stripProcessPreamble(input, {
			hasReceivedDocuments: false,
			hasSearchToolCall: false,
			hasProposal: true,
		});
		expect(out.toLowerCase()).not.toContain("apareceu");
		expect(out).toContain("Quer ver outra faixa?");
	});

	it("PRESERVA 'não apareceu grupo novo' quando hasSearchToolCall=true (a tool rodou de fato)", () => {
		const input = "Não apareceu nenhum grupo novo na faixa hoje.";
		const out = stripProcessPreamble(input, {
			hasReceivedDocuments: false,
			hasSearchToolCall: true,
			hasProposal: true,
		});
		expect(out).toContain("apareceu");
	});

	it("sem contexto (chamada antiga, sem 2º argumento) NÃO dropa — comportamento pré-FIX-270 preservado", () => {
		const input = "Os documentos já foram recebidos pela administradora.";
		expect(stripProcessPreamble(input)).toBe(input);
	});
});

describe("FIX-270 — EphemeralTextFilter com getContext dropa estado fabricado ao vivo", () => {
	it("dropa a afirmação de documento recebido quando o getter reporta hasReceivedDocuments=false", () => {
		const f = new EphemeralTextFilter(() => ({
			hasReceivedDocuments: false,
			hasSearchToolCall: false,
			hasProposal: true,
		}));
		let emitted = f.push("Os documentos já foram recebidos pela administradora.");
		emitted += f.flush();
		expect(emitted.toLowerCase()).not.toContain("recebidos");
	});

	it("emite a afirmação de documento recebido quando o getter reporta hasReceivedDocuments=true", () => {
		const f = new EphemeralTextFilter(() => ({
			hasReceivedDocuments: true,
			hasSearchToolCall: false,
			hasProposal: true,
		}));
		let emitted = f.push("Os documentos já foram recebidos pela administradora.");
		emitted += f.flush();
		expect(emitted).toContain("recebidos");
	});

	it("reflete o estado LIVE do getter — tool chamada NO MEIO do turno destrava a claim seguinte", () => {
		let searchCalled = false;
		const f = new EphemeralTextFilter(() => ({
			hasReceivedDocuments: false,
			hasSearchToolCall: searchCalled,
			hasProposal: true,
		}));
		// 1ª claim, ainda sem tool-call — deve ser dropada.
		let emitted = f.push("Não apareceu nenhum grupo novo agora.");
		emitted += f.flush();
		expect(emitted).toBe("");
		// A tool roda (simulado pelo runner entre steps).
		searchCalled = true;
		// 2ª claim, já com a tool chamada — deve sobreviver.
		let emitted2 = f.push("Não apareceu nenhum grupo novo agora.");
		emitted2 += f.flush();
		expect(emitted2).toContain("apareceu");
	});
});

describe("FIX-336 — isProposalCompletionClaim (afirmação de proposta pronta/já saiu)", () => {
	const CLAIMS = [
		"Sua proposta com a ITAÚ já saiu.",
		"Sua proposta está pronta!",
		"Sua proposta ficou pronta, é só assinar.",
		"Vou processar seu interesse agora pra gente fechar tudo certinho.",
		"Já está fechando a sua proposta.",
		"Sua proposta real já foi criada.",
	];

	it("classifica como afirmação de proposta concluída todas as frases observadas", () => {
		for (const c of CLAIMS) {
			expect(isProposalCompletionClaim(c), `deveria classificar: "${c}"`).toBe(true);
		}
	});

	it("NÃO classifica menção neutra a 'proposta' sem afirmar conclusão", () => {
		expect(isProposalCompletionClaim("Quer que eu monte sua proposta?")).toBe(false);
		expect(isProposalCompletionClaim("Assim que você confirmar, eu gero a proposta.")).toBe(false);
	});

	it("segmento vazio não é afirmação de proposta concluída", () => {
		expect(isProposalCompletionClaim("")).toBe(false);
	});
});

// FIX-336 (bloco-c-whatsapp-invariantes, invariante I4): dossiê auto-whatsapp
// — o agente afirmou "Sua proposta com a ITAÚ já saiu" com `bevi_proposals`
// vazio pra conversa (`SELECT count(*) FROM bevi_proposals WHERE
// conversation_id='90b6c34f-…'` → 0). Mesmo padrão do FIX-270: o fato vem do
// banco (hasProposal), nunca da narrativa do LLM.
describe("FIX-336 — stripProcessPreamble/EphemeralTextFilter dropam promessa de proposta sem bevi_proposals real", () => {
	it("dropa 'sua proposta já saiu' quando hasProposal=false (invariante I4)", () => {
		const input = "Sua proposta com a ITAÚ já saiu.";
		const out = stripProcessPreamble(input, {
			hasReceivedDocuments: false,
			hasSearchToolCall: false,
			hasProposal: false,
		});
		expect(out.toLowerCase()).not.toContain("já saiu");
	});

	it("PRESERVA 'sua proposta já saiu' quando hasProposal=true (bevi_proposals tem linha real)", () => {
		const input = "Sua proposta com a ITAÚ já saiu.";
		const out = stripProcessPreamble(input, {
			hasReceivedDocuments: false,
			hasSearchToolCall: false,
			hasProposal: true,
		});
		expect(out).toContain("já saiu");
	});

	it("dossiê auto-whatsapp real: dropa a alucinação de fechamento sem derrubar o resto do balão", () => {
		const input =
			"Madalena, a gente já está fechando! Sua proposta com a ITAÚ já saiu — é só acompanhar pelo WhatsApp que você confirmou agora pouco.";
		const out = stripProcessPreamble(input, {
			hasReceivedDocuments: false,
			hasSearchToolCall: false,
			hasProposal: false,
		});
		expect(out.toLowerCase()).not.toContain("já saiu");
	});

	it("EphemeralTextFilter dropa ao vivo quando o getter reporta hasProposal=false", () => {
		const f = new EphemeralTextFilter(() => ({
			hasReceivedDocuments: false,
			hasSearchToolCall: false,
			hasProposal: false,
		}));
		let emitted = f.push("Sua proposta está pronta! Já pode conferir.");
		emitted += f.flush();
		expect(emitted.toLowerCase()).not.toContain("pronta");
	});

	it("EphemeralTextFilter PRESERVA quando o getter reporta hasProposal=true", () => {
		const f = new EphemeralTextFilter(() => ({
			hasReceivedDocuments: false,
			hasSearchToolCall: false,
			hasProposal: true,
		}));
		let emitted = f.push("Sua proposta está pronta! Já pode conferir.");
		emitted += f.flush();
		expect(emitted).toContain("pronta");
	});
});

// FIX-337 (bloco-c-whatsapp-invariantes, invariante I6): defesa em
// profundidade — mesma barreira do formatter.ts (`scrubCpf` em
// whatsapp/formatter.ts), aqui como segunda linha pro texto que sai da
// stream do modelo. CPF de teste: 529.982.247-25 (mesmo de identity.test.ts).
describe("FIX-337 — scrubCpf mascara CPF real (dígito verificador válido)", () => {
	it("mascara CPF com pontuação", () => {
		expect(scrubCpf("seu CPF é 529.982.247-25, certo?")).toBe("seu CPF é ***.***.247-25, certo?");
	});

	it("mascara CPF sem pontuação", () => {
		expect(scrubCpf("seu CPF é 52998224725")).toBe("seu CPF é ***.***.247-25");
	});

	it("NÃO mascara sequência de 11 dígitos que falha o dígito verificador", () => {
		expect(scrubCpf("pedido nº 12345678901")).toBe("pedido nº 12345678901");
	});

	it("texto sem CPF passa incólume", () => {
		expect(scrubCpf("Show, vamos seguir com a simulação.")).toBe(
			"Show, vamos seguir com a simulação.",
		);
	});

	it("string vazia não quebra", () => {
		expect(scrubCpf("")).toBe("");
	});
});

describe("FIX-337 — stripProcessPreamble/EphemeralTextFilter mascaram CPF no texto final", () => {
	it("stripProcessPreamble mascara CPF ecoado pelo modelo (dossiê auto-whatsapp t10)", () => {
		const out = stripProcessPreamble(
			"Perfeito, anotei seu CPF: 529.982.247-25. E qual é o celular?",
		);
		expect(out).not.toContain("529.982.247-25");
		expect(out).toContain("***.***.247-25");
	});

	it("EphemeralTextFilter mascara CPF ao vivo, no meio do stream", () => {
		const f = new EphemeralTextFilter();
		let emitted = f.push("Perfeito, anotei seu CPF: 529.982.247-25.");
		emitted += f.flush();
		expect(emitted).not.toContain("529.982.247-25");
		expect(emitted).toContain("***.***.247-25");
	});
});

describe("FIX-188 — joinSeparator evita colagem de falas distintas", () => {
	it("insere \\n\\n quando o acumulado termina sem espaço e o próximo começa sem espaço", () => {
		expect(joinSeparator("...na sua faixa:", "Olha")).toBe("\n\n");
	});

	it("NÃO insere separador quando já há espaço em volta", () => {
		expect(joinSeparator("...na sua faixa: ", "Olha")).toBe("");
		expect(joinSeparator("...na sua faixa:", " Olha")).toBe("");
	});

	it("nada a separar quando algum lado é vazio", () => {
		expect(joinSeparator("", "Olha")).toBe("");
		expect(joinSeparator("texto", "")).toBe("");
	});
});

// FIX-298 (loop-de-goal r10, P4 — transcrição REAL com Qwen 3.5 Fast,
// 2026-07-12): "Quer ajustar o valor do bem ou seguir com essa opção da ITAÚ
// mesmo? Você já fez consórcio antes?" — duas sentenças interrogativas no
// mesmo balão; o usuário só conseguiu responder uma. A regra "nunca mais de
// uma pergunta por mensagem" só existia como texto no system-prompt (Lei 4:
// instruction-following degrada sob modelo mais fraco) — este é o invariante
// em CÓDIGO. Cuidado de precisão: o corte é por SENTENÇA (delimitada por
// . ! ? : \n), não por "pedido" — uma frase composta com um único "?" é uma
// sentença válida e não pode ser cortada (mockup Mario, cenário F2).
describe("FIX-298 — no máximo 1 sentença interrogativa por balão (cassette real)", () => {
	const BUG_TRANSCRIPT =
		"Quer ajustar o valor do bem ou seguir com essa opção da ITAÚ mesmo? Você já fez consórcio antes?";

	it("stripProcessPreamble dropa a PRIMEIRA pergunta e mantém só a ÚLTIMA", () => {
		const out = stripProcessPreamble(BUG_TRANSCRIPT);
		const questionMarks = out.match(/\?/g) ?? [];
		expect(questionMarks.length).toBe(1);
		expect(out).not.toContain(
			"Quer ajustar o valor do bem ou seguir com essa opção da ITAÚ mesmo?",
		);
		expect(out).toContain("Você já fez consórcio antes?");
	});

	it("EphemeralTextFilter (stream frase-a-frase) também nunca deixa 2 perguntas passarem ao vivo", () => {
		const f = new EphemeralTextFilter();
		let emitted = "";
		for (const delta of [
			"Quer ajustar o valor do bem ",
			"ou seguir com essa opção da ITAÚ mesmo? ",
			"Você já fez consórcio ",
			"antes?",
		]) {
			emitted += f.push(delta);
		}
		emitted += f.flush();
		const questionMarks = emitted.match(/\?/g) ?? [];
		expect(questionMarks.length).toBe(1);
		expect(emitted).not.toContain("seguir com essa opção da ITAÚ mesmo?");
		expect(emitted).toContain("Você já fez consórcio antes?");
	});

	// Teste POSITIVO obrigatório: frase composta do mockup (Mario, F2) — UMA
	// sentença, dois pedidos, um "?" só. NÃO pode ser cortada.
	it("NÃO corta frase composta com dois pedidos e um único '?' (mockup Mario, F2)", () => {
		const composta = "Que carro você tem em mente, e quanto custa mais ou menos?";
		expect(stripProcessPreamble(composta)).toBe(composta);

		const f = new EphemeralTextFilter();
		let emitted = f.push(composta);
		emitted += f.flush();
		expect(emitted).toBe(composta);
	});

	it("texto com só 1 pergunta (comum) continua sobrevivendo normalmente", () => {
		const input = "Boa! Olha as opções que separei. Você quer buscar em outra faixa?";
		expect(stripProcessPreamble(input)).toBe(input);
	});
});

// FIX-326 (rodada 10, veredito Sonnet A.5/A.6 — P4, teto explícito da r10):
// o FIX-298 acima garante no máximo 1 pergunta do MODELO por balão — mas não
// sabe que um GATE estrutural (com pergunta própria, ex. "Você já fez
// consórcio antes?") vai disparar em seguida no MESMO turno. `runner.ts`
// precisa de um jeito de DESCARTAR a pergunta segurada (sem emiti-la) quando
// prevê que um gate vai anexar a PRÓPRIA pergunta — `discardHeldQuestion()` é
// esse mecanismo: limpa o estado interno sem produzir texto nenhum.
describe("hasHeldQuestion() — a pergunta do MODELO vence o card (desamarra 2026-07-13)", () => {
	// Antes (FIX-326), `discardHeldQuestion()` JOGAVA FORA a pergunta do modelo
	// quando um gate com pergunta canônica ia disparar: o modelo ficava mudo e o
	// card falava sozinho, sempre a mesma frase. Agora a prioridade inverteu — a
	// pergunta do modelo é emitida e o CARD é que se cala (`modelAsked`). A regra
	// do cliente ("nunca 2 perguntas no mesmo balão") continua valendo.
	it("acusa a pergunta segurada, pro runner saber que o card deve calar", () => {
		const f = new EphemeralTextFilter();
		f.push("Boa, anotado. ");
		expect(f.hasHeldQuestion()).toBe(false);
		f.push("Quanto custa esse Corolla hoje? ");
		expect(f.hasHeldQuestion()).toBe(true);
	});

	it("a pergunta segurada é EMITIDA no flush (nunca mais descartada)", () => {
		const f = new EphemeralTextFilter();
		f.push("Perfeito. ");
		f.push("Você já fez consórcio antes? ");
		const out = f.push("") + f.flush();
		expect(out).toMatch(/já fez consórcio antes\?/i);
	});

	it("sem pergunta nenhuma, hasHeldQuestion é false", () => {
		const f = new EphemeralTextFilter();
		f.push("Show, vamos seguir. ");
		expect(f.hasHeldQuestion()).toBe(false);
	});
});

// FIX-330 (rodada 10, achado ao vivo pós-FIX-329 — 3ª variante de P4, distinta
// do FIX-326/328/329): dossiê fresco Mario mostrou "Quer ajustar o valor do
// bem? [...] Você já fez consórcio antes?" no MESMO turno — 2 perguntas reais,
// vindas de blocos DIFERENTES da mesma resposta multi-tool-call. Causa: o
// runner chama `flush()` em CADA fronteira de bloco/pré-tool-call (não só no
// fim real do turno) — e `flush()` SEMPRE libera a pergunta segurada
// (FIX-298), mesmo nessas fronteiras INTERMEDIÁRIAS. A pergunta do bloco 1
// escapava ANTES do fim do turno, ANTES até de o runner saber se um gate ia
// disparar depois (P4 escapando pela ponta CONTRÁRIA do que FIX-326 cobre).
describe("FIX-330 — flushPending() nunca libera a pergunta segurada (só o fim REAL do turno pode)", () => {
	it("flushPending() esvazia o pending mas MANTÉM a pergunta segurada (não libera)", () => {
		const f = new EphemeralTextFilter();
		let emitted = "";
		emitted += f.push("Quer ajustar o valor do bem? ");
		emitted += f.flushPending();
		expect(emitted).not.toContain("Quer ajustar o valor do bem?");
		// a pergunta continua segurada — surge só no flush() FINAL:
		emitted += f.push("Você já fez consórcio antes?");
		emitted += f.flush();
		expect(emitted).not.toContain("Quer ajustar o valor do bem?");
		expect(emitted).toContain("Você já fez consórcio antes?");
	});

	it("regressão — flushPending() continua liberando texto NÃO-interrogativo pendente normalmente", () => {
		const f = new EphemeralTextFilter();
		let emitted = "";
		emitted += f.push("A parcela fica em R$ 1.635,21 por mês");
		emitted += f.flushPending();
		expect(emitted).toContain("A parcela fica em R$ 1.635,21 por mês");
	});

	it("cassette real reproduzido: 2 blocos, cada um terminando em pergunta, com flushPending() entre eles — só a ÚLTIMA sobrevive", () => {
		const f = new EphemeralTextFilter();
		let emitted = "";
		emitted += f.push("Aqui está o detalhamento completo da ITAÚ. Quer ajustar o valor do bem?");
		emitted += f.flushPending(); // fronteira de bloco/pré-tool-call — NÃO libera
		emitted += f.push("Essas são as melhores alternativas pro seu perfil. ");
		emitted += f.push("Você já fez consórcio antes?");
		emitted += f.flush(); // fim REAL do turno — libera só a última
		const questionMarks = emitted.match(/\?/g) ?? [];
		expect(questionMarks.length).toBe(1);
		expect(emitted).not.toContain("Quer ajustar o valor do bem?");
		expect(emitted).toContain("Você já fez consórcio antes?");
	});
});

// FIX-299 (loop-de-goal r10, P9/P10 — mesma transcrição): "Show, kairo!" (nome
// em minúscula) e "Perfeito, kairo! ✅" (emoji fora da parcimônia esperada) com
// Qwen 3.5 Fast. Casca determinística — independe do modelo obedecer ao prompt.
describe("FIX-299 — strip de emoji determinístico (independe do modelo)", () => {
	it("stripEmoji remove emoji isolado sem tocar no resto do texto", () => {
		expect(stripEmoji("Perfeito, kairo! ✅").trim()).toBe("Perfeito, kairo!");
	});

	it("stripEmoji remove múltiplos emoji em posições diferentes", () => {
		expect(stripEmoji("🎉 Sua reserva foi confirmada 🎉").trim()).toBe(
			"Sua reserva foi confirmada",
		);
	});

	it("stripEmoji não mexe em acentuação pt-BR", () => {
		const texto = "Você não vai perder a simulação, é rapidinho: informação, atenção.";
		expect(stripEmoji(texto)).toBe(texto);
	});

	it("string vazia passa incólume", () => {
		expect(stripEmoji("")).toBe("");
	});

	it("stripProcessPreamble também limpa emoji do texto final", () => {
		const out = stripProcessPreamble("Perfeito, kairo! ✅ Vamos seguir com a simulação.");
		expect(out).not.toContain("✅");
		expect(out).toContain("Perfeito, kairo!");
		expect(out).toContain("Vamos seguir com a simulação.");
	});

	it("EphemeralTextFilter nunca emite emoji ao vivo, em qualquer modelo", () => {
		const f = new EphemeralTextFilter();
		let emitted = f.push("Perfeito, kairo! ✅ Bora simular.");
		emitted += f.flush();
		expect(emitted).not.toContain("✅");
		expect(emitted).toContain("Perfeito, kairo!");
		expect(emitted).toContain("Bora simular.");
	});
});

// FIX-342 (P0, veredito Sonnet rodada 2, "P0.1 — alucinação de administradora
// inexistente": o agente recomendou "Bradesco" (imóvel-web) e "Estrela"
// (serviços-web) — nenhuma das duas jamais esteve entre as ofertas REAIS
// retornadas pela Bevi nessas conversas; o usuário perseguiu a oferta
// fantasma por 4 turnos. `ctx.shownAdministradoras` é o FATO (runner.ts —
// união do histórico persistido via `listShownOffersForConversation`,
// choose-offer.ts, com os grupos indexados NESTE turno) — nunca a narrativa
// do LLM decide quais administradoras existem.
describe("FIX-342 — isHallucinatedAdministradoraClaim (administradora do mercado fora das ofertas reais)", () => {
	const OFERTAS_REAIS = ["ITAÚ", "ÂNCORA"];

	it("classifica 'recomendo a Bradesco' como alucinação quando as ofertas reais são [ITAÚ, ÂNCORA]", () => {
		expect(
			isHallucinatedAdministradoraClaim(
				"A recomendada no topo (Bradesco) é a que melhor equilibra parcela e prazo.",
				{
					hasReceivedDocuments: false,
					hasSearchToolCall: false,
					hasProposal: false,
					shownAdministradoras: OFERTAS_REAIS,
				},
			),
		).toBe(true);
	});

	it("NÃO classifica 'recomendo a ITAÚ' — a administradora está entre as ofertas reais", () => {
		expect(
			isHallucinatedAdministradoraClaim("Recomendo a ITAÚ, que encaixa bem no seu orçamento.", {
				hasReceivedDocuments: false,
				hasSearchToolCall: false,
				hasProposal: false,
				shownAdministradoras: OFERTAS_REAIS,
			}),
		).toBe(false);
	});

	it("NÃO classifica menção à segunda oferta real (ÂNCORA)", () => {
		expect(
			isHallucinatedAdministradoraClaim("A ÂNCORA também é uma opção sólida pra você.", {
				hasReceivedDocuments: false,
				hasSearchToolCall: false,
				hasProposal: false,
				shownAdministradoras: OFERTAS_REAIS,
			}),
		).toBe(false);
	});

	it("classifica 'Estrela' como alucinação (dossiê servicos-web real) quando as ofertas são [Rodobens, Âncora]", () => {
		expect(
			isHallucinatedAdministradoraClaim(
				"Essa que mostrei primeiro (a Estrela) tem uma compatibilidade ótima com o que você pediu.",
				{
					hasReceivedDocuments: false,
					hasSearchToolCall: false,
					hasProposal: false,
					shownAdministradoras: ["Rodobens", "Âncora"],
				},
			),
		).toBe(true);
	});

	it("sem shownAdministradoras no contexto, nunca classifica (compat retroativa)", () => {
		expect(isHallucinatedAdministradoraClaim("Recomendo a Bradesco.")).toBe(false);
		expect(
			isHallucinatedAdministradoraClaim("Recomendo a Bradesco.", {
				hasReceivedDocuments: false,
				hasSearchToolCall: false,
				hasProposal: false,
			}),
		).toBe(false);
	});

	it("segmento vazio nunca é alucinação", () => {
		expect(
			isHallucinatedAdministradoraClaim("", {
				hasReceivedDocuments: false,
				hasSearchToolCall: false,
				hasProposal: false,
				shownAdministradoras: OFERTAS_REAIS,
			}),
		).toBe(false);
	});

	it("nome fora da lista fechada de administradoras do mercado nunca é bloqueado (falso-negativo aceitável)", () => {
		expect(
			isHallucinatedAdministradoraClaim("A Cooperfumas tem uma proposta interessante.", {
				hasReceivedDocuments: false,
				hasSearchToolCall: false,
				hasProposal: false,
				shownAdministradoras: OFERTAS_REAIS,
			}),
		).toBe(false);
	});
});

describe("FIX-342 — stripProcessPreamble/EphemeralTextFilter dropam administradora fantasma sem mordaçar as ofertas reais", () => {
	const OFERTAS_REAIS = ["ITAÚ", "ÂNCORA"];

	it("dropa a fala inteira sobre a Bradesco (dossiê imóvel-web real) quando as ofertas reais são [ITAÚ, ÂNCORA]", () => {
		const input = "A recomendada no topo (Bradesco) é a que melhor equilibra parcela e prazo pra você.";
		const out = stripProcessPreamble(input, {
			hasReceivedDocuments: false,
			hasSearchToolCall: false,
			hasProposal: false,
			shownAdministradoras: OFERTAS_REAIS,
		});
		expect(out.toLowerCase()).not.toContain("bradesco");
	});

	it("PRESERVA a fala sobre a ITAÚ — não vira mordaça pras ofertas que EXISTEM", () => {
		const input = "Recomendo a ITAÚ, que encaixa bem no seu orçamento.";
		const out = stripProcessPreamble(input, {
			hasReceivedDocuments: false,
			hasSearchToolCall: false,
			hasProposal: false,
			shownAdministradoras: OFERTAS_REAIS,
		});
		expect(out).toContain("ITAÚ");
	});

	it("EphemeralTextFilter dropa a administradora fantasma (Estrela) ao vivo, no meio do stream", () => {
		const f = new EphemeralTextFilter(() => ({
			hasReceivedDocuments: false,
			hasSearchToolCall: false,
			hasProposal: false,
			shownAdministradoras: OFERTAS_REAIS,
		}));
		let emitted = f.push("Recomendo a Estrela, que fica ótima pra você.");
		emitted += f.flush();
		expect(emitted.toLowerCase()).not.toContain("estrela");
	});

	it("EphemeralTextFilter PRESERVA a administradora real (ÂNCORA) ao vivo", () => {
		const f = new EphemeralTextFilter(() => ({
			hasReceivedDocuments: false,
			hasSearchToolCall: false,
			hasProposal: false,
			shownAdministradoras: OFERTAS_REAIS,
		}));
		let emitted = f.push("A ÂNCORA também fica boa pra você, quer ver o detalhe?");
		emitted += f.flush();
		expect(emitted).toContain("ÂNCORA");
	});
});
