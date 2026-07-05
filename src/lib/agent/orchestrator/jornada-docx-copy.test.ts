import { describe, expect, it } from "vitest";
import { DECISION_PROMPT_OPTIONS, DECISION_PROMPT_QUESTION } from "@/lib/chat/types";
import { contemplationDialMarks } from "@/lib/consorcio/contemplation-dial";
import { gatePartData } from "@/lib/web/adapter";
import { qualifyConsentToWhatsApp } from "@/lib/whatsapp/formatter";
import type { ConversationMetadata } from "../personas";
import {
	buildExperienceFirstDirective,
	buildSearchSummaryDirective,
	buildTransitionFirstContactDirective,
} from "./directives";
import { gateQuestion } from "./gate-questions";

// ============================================================================
// Camada 1 — fidelidade da cópia/voz ao jornada.docx
// ----------------------------------------------------------------------------
// O eval (tests/eval/jornada-aja-agora.eval.test.ts) prova a experiência com o
// LLM real (nightly). Estes asserts travam, em TODO PR, que a COPY do sistema
// (perguntas de gate, educação de lance embutido, directive de explicação) não
// se afaste do que a Bruna escreveu no docx — sem depender do modelo.
// ============================================================================

describe("perguntas de gate — fiéis ao docx", () => {
	it("experiência: pergunta se já fez consórcio antes (passo 2)", () => {
		const q = gateQuestion("experience") ?? "";
		expect(q.toLowerCase()).toMatch(
			/já fez consórcio|ja fez consorcio|consórcio antes|consorcio antes/,
		);
	});

	// FIX-103 (2026-06-28): o gate de prazo SAIU da qualificação — o agente não
	// pergunta mais "em quanto tempo você quer o bem?" na entrada. A copy do gate
	// timeframe vira legado (não validamos mais fidelidade ao docx pra ela).

	it("lance: pergunta sobre reserva pra antecipar a contemplação", () => {
		const q = gateQuestion("lance") ?? "";
		expect(q.toLowerCase()).toMatch(/reserva/);
		expect(q.toLowerCase()).toMatch(/lance/);
		expect(q.toLowerCase()).toMatch(/antecipar|contempla/);
	});

	it("lance embutido: educa exatamente como o docx (própria carta, sem todo o valor hoje)", () => {
		// docx: "O lance embutido permite usar parte da própria carta de crédito
		// como lance… ajuda quem não possui todo o valor do lance disponível hoje."
		const q = (gateQuestion("lance-embutido") ?? "").toLowerCase();
		expect(q).toMatch(/lance embutido/);
		expect(q).toMatch(/própria carta|propria carta|parte da.*carta/);
		expect(q).toMatch(/chances? de contempla|aumentar/);
		expect(q).toMatch(/sem precisar.*hoje|todo o lance.*hoje|em dinheiro hoje/);
		// Tom acolhedor do docx ("Fica tranquilo, a gente te ajuda!").
		expect(q).toMatch(/tranquil|a gente te ajuda|te ajuda/);
		// Âncoras literais do docx: exemplo da carta de R$ 100 mil + a pergunta
		// "quer considerar esse tipo de lance nas suas simulações?".
		expect(q).toMatch(/r\$ 100 mil/);
		expect(q).toMatch(/quer considerar esse tipo de lance/);
	});

	it("lance-value: pergunta o VALOR aproximado do lance (docx passo 2)", () => {
		const q = (gateQuestion("lance-value") ?? "").toLowerCase();
		expect(q).toMatch(/valor aproximado/);
		expect(q).toMatch(/lance/);
	});

	it("identify: gancho literal do docx (analisar várias administradoras) + LGPD", async () => {
		// FIX-210 (reforma de conversa WhatsApp): o identify virou cadência 2-tempos.
		// O gancho do docx + LGPD migraram do gateQuestion (que agora é só o PEDIDO
		// curto) pro beat de CONTEXTO fixo (IDENTIFY_CONTEXT_WHATSAPP). O gancho segue
		// GARANTIDO e determinístico — só mudou de balão.
		const { IDENTIFY_CONTEXT_WHATSAPP } = await import("@/lib/whatsapp/identify-capture");
		const contexto = IDENTIFY_CONTEXT_WHATSAPP.toLowerCase();
		expect(contexto).toMatch(/analisar várias administradoras|analisar varias administradoras/);
		expect(contexto).toMatch(/aderentes ao seu perfil/);
		expect(contexto).toMatch(/lgpd/);
		// O PEDIDO (beat 2) é curto e não repete o gancho.
		const pedido = (gateQuestion("identify") ?? "").toLowerCase();
		expect(pedido).toMatch(/cpf/);
		expect(pedido).not.toMatch(/administradoras/);
	});

	it("simulator-offer: oferta literal do simulador (3, 6 ou 12 meses — que tal?)", () => {
		const q = (gateQuestion("simulator-offer") ?? "").toLowerCase();
		expect(q).toMatch(/simulador/);
		expect(q).toMatch(/3, 6 ou 12 meses/);
		expect(q).toMatch(/que tal/);
		expect(q).toMatch(/parcelas/);
	});
});

describe("card de decisão — pergunta e 3 opções (docx passo 4, terminologia atualizada pela Ata 2026-07-04)", () => {
	it('pergunta canônica: "Esse plano faz sentido para você?"', () => {
		expect(DECISION_PROMPT_QUESTION).toBe("Esse plano faz sentido para você?");
	});

	it("as 3 labels — Ata 2026-07-04 (FIX-216) substitui 'contratar' por 'reservar'", () => {
		expect(DECISION_PROMPT_OPTIONS.map((o) => o.label)).toEqual([
			"Sim, quero reservar agora",
			"Quero ver outras opções",
			"Quero falar com um especialista da Aja Agora",
		]);
	});

	it("títulos de botão WhatsApp respeitam o limite de 20 chars", () => {
		for (const o of DECISION_PROMPT_OPTIONS) {
			expect(o.waTitle.length, `waTitle "${o.waTitle}"`).toBeLessThanOrEqual(20);
		}
	});
});

describe("simulador-agulha — marcos default cobrem 3/6/12 do docx", () => {
	it("contemplationDialMarks sem months explícito inclui os meses 3, 6 e 12", () => {
		const marks = contemplationDialMarks({ creditValue: 60_000, termMonths: 80 });
		const months = marks.map((m) => m.targetMonth);
		expect(months).toContain(3);
		expect(months).toContain(6);
		expect(months).toContain(12);
	});
});

describe('consent pós-explicação de primeira vez — botão "Entendi, pode continuar" (docx passo 2)', () => {
	const metaFirst = { experiencePrev: "first" } as ConversationMetadata;
	const metaReturning = { experiencePrev: "returning" } as ConversationMetadata;

	it("web: chips do consent pra primeira vez usam a label literal do docx", () => {
		const data = gatePartData("consent", metaFirst);
		if (data?.kind !== "chips") throw new Error("consent deveria ser chips");
		expect(data.options.map((o) => o.label)).toContain("Entendi, pode continuar");
	});

	it("web: quem já conhece consórcio mantém o convite curto (Bora!)", () => {
		const data = gatePartData("consent", metaReturning);
		if (data?.kind !== "chips") throw new Error("consent deveria ser chips");
		expect(data.options.map((o) => o.label)).toContain("Bora!");
	});

	it("whatsapp: botão de consent pra primeira vez ecoa o docx (≤20 chars)", () => {
		const res = qualifyConsentToWhatsApp(undefined, { firstTime: true });
		const interactive = res.interactive as
			| { action?: { buttons?: Array<{ reply: { title: string } }> } }
			| undefined;
		const titles = interactive?.action?.buttons?.map((b) => b.reply.title) ?? [];
		expect(titles.some((t) => /entendi/i.test(t))).toBe(true);
		for (const t of titles) expect(t.length).toBeLessThanOrEqual(20);
	});
});

describe("texto-ponte do passo 1 — docx linha 14", () => {
	it('directive de primeiro contato carrega a ponte "perguntinhas… de cerca de X"', () => {
		const d = buildTransitionFirstContactDirective("Automóvel", "").toLowerCase();
		expect(d).toMatch(/perguntinhas/);
		expect(d).toMatch(/melhor consórcio|melhor consorcio/);
		expect(d).toMatch(/de cerca de/);
	});
});

// FIX-103 (2026-06-28): o gate de prazo SAIU da qualificação. TIMEFRAME_OPTIONS
// permanece como LEGADO (compat web/whatsapp dos blocos irmãos), mas não é mais
// parte da jornada conversacional — a coerência das constantes legadas é
// validada em qualify-config.timeframe.test.ts, não como copy do docx aqui.

describe('passo 3 — "Encontramos 3 boas opções" (docx linha 32)', () => {
	it("directive do reveal manda anunciar as 3 boas opções pro perfil", () => {
		const d = buildSearchSummaryDirective({
			category: "auto",
			meta: {
				experiencePrev: "first",
				qualifyAnswers: {
					creditMin: 45_000,
					creditMax: 55_000,
					monthlyBudget: 1_100,
					prazoMeses: 0,
					hasLance: "yes",
				},
			},
		});
		expect(d).toMatch(/3 boas opcoes|3 boas opções/i);
		expect(d).toMatch(/para o seu perfil/i);
	});
});

describe("directives — carregam a didática/voz do docx", () => {
	it("explicação de primeira vez: sem juros, sorteio ou lance, grupo, ≠ financiamento", () => {
		const d = buildExperienceFirstDirective("É a primeira vez").toLowerCase();
		expect(d).toMatch(/sem juros/);
		expect(d).toMatch(/sorteio/);
		expect(d).toMatch(/lance/);
		expect(d).toMatch(/grupo|parcelas/);
		expect(d).toMatch(/financiamento/);
		// E manda NÃO jogar jargão técnico no leigo (fidelidade ao tom do docx).
		expect(d).toMatch(/sem jargao|sem jargão|jargao tecnico|jargão técnico/);
	});

	it("explicação de primeira vez: inclui o papel da Aja Agora (docx passo 1 — FIX-1)", () => {
		// docx: "Nosso papel na Aja Agora é encontrar o grupo com maior chance de
		// atender seu objetivo no prazo que você deseja." — bullet que FALTAVA na
		// explicação (teste manual Kairo 2026-06-05, FIX-1).
		const d = buildExperienceFirstDirective("É a primeira vez").toLowerCase();
		expect(d).toMatch(/papel/);
		expect(d).toMatch(/aja agora/);
		expect(d).toMatch(/encontrar o grupo/);
		expect(d).toMatch(/maior chance/);
		expect(d).toMatch(/prazo que (voce|você) deseja/);
	});

	it("reveal: a Aja Agora analisa administradoras e recomenda a mais aderente", () => {
		// docx passo 2→3: "a Aja Agora vai analisar várias administradoras e
		// selecionar as opções mais aderentes ao seu perfil e objetivo."
		const d = buildSearchSummaryDirective({
			category: "auto",
			meta: {
				experiencePrev: "first",
				qualifyAnswers: {
					creditMin: 90_000,
					creditMax: 100_000,
					monthlyBudget: 1_700,
					prazoMeses: 0,
					hasLance: "yes",
				},
			},
		}).toLowerCase();
		expect(d).toMatch(/recommend_groups|recomenda/);
		expect(d).toMatch(/present_comparison_table|opções|opcoes/);
	});

	// Teste manual Kairo (2026-06-11): "ele disse que tinha 3 opções mas mostrou
	// só uma nos cards". O reveal anunciava 3 mas só destacava a recomendada — as
	// outras 2 só apareciam sob demanda. Fix: com 2+ grupos, o reveal mostra o
	// CARROSSEL das opções (present_comparison_table, a recomendada destacada) no
	// próprio reveal. Mais fiel ao docx (linha 32 "Encontramos 3 boas opções" +
	// linha 37 "ver outras opções pra comparação").
	it("reveal com 2+ grupos mostra o carrossel das opções (present_comparison_table)", () => {
		const d = buildSearchSummaryDirective({
			category: "auto",
			meta: {
				experiencePrev: "first",
				qualifyAnswers: {
					creditMin: 90_000,
					creditMax: 100_000,
					monthlyBudget: 1_700,
					prazoMeses: 0,
					hasLance: "yes",
				},
			},
		});
		expect(d).toMatch(/present_comparison_table/);
		// todas as opções no carrossel, com a recomendada destacada
		expect(d).toMatch(/TODOS|TODAS|todas as op|todos os grupos/i);
		expect(d).toMatch(/destac|highlightBestIndex|recomendada/i);
		// e NÃO deve mais dizer pra evitar comparison no reveal
		expect(d).not.toMatch(/N[AÃ]O chame present_comparison_table neste turno/i);
	});
});

describe("FIX-7 — reveal honesto com menos de 3 opções (teste manual Kairo 2026-06-05)", () => {
	const meta = {
		experiencePrev: "first",
		qualifyAnswers: {
			creditMin: 15_000,
			creditMax: 20_000,
			monthlyBudget: 500,
			prazoMeses: 6,
			hasLance: "yes",
		},
	} as Parameters<typeof buildSearchSummaryDirective>[0]["meta"];

	it("directive manda anunciar o número REAL (sem plural enganoso com 1 opção)", () => {
		const d = buildSearchSummaryDirective({ category: "moto", meta });
		// O anúncio é condicionado ao resultado da busca, não fixo em "3".
		expect(d).toMatch(/apenas 1|UMA op[cç][aã]o|uma op[cç][aã]o/i);
		expect(d).toMatch(/n[aã]o anuncie "3/i);
	});

	it("directive: com 1 opção NÃO chama present_recommendation_card (evita card duplicado)", () => {
		const d = buildSearchSummaryDirective({ category: "moto", meta });
		expect(d).toMatch(/1 grupo[\s\S]{0,400}N[AÃ]O chame present_recommendation_card/i);
	});

	it("directive: insufficientOptions=true → comunicar a escassez com transparência", () => {
		const d = buildSearchSummaryDirective({ category: "moto", meta });
		expect(d).toMatch(/insufficientOptions/);
		expect(d).toMatch(/transpar|escass|limitad/i);
	});
});
