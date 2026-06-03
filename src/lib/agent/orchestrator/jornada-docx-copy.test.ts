import { describe, expect, it } from "vitest";
import {
	buildExperienceFirstDirective,
	buildSearchSummaryDirective,
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
		expect(q.toLowerCase()).toMatch(/já fez consórcio|ja fez consorcio|consórcio antes|consorcio antes/);
	});

	it("prazo (auto): fala do carro novo, no jeito do docx", () => {
		const q = gateQuestion("timeframe", "auto") ?? "";
		expect(q.toLowerCase()).toMatch(/carro/);
		expect(q.toLowerCase()).toMatch(/quanto tempo/);
	});

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

	it("reveal: a Aja Agora analisa administradoras e recomenda a mais aderente", () => {
		// docx passo 2→3: "a Aja Agora vai analisar várias administradoras e
		// selecionar as opções mais aderentes ao seu perfil e objetivo."
		const d = buildSearchSummaryDirective({
			category: "auto",
			meta: {
				experiencePrev: "first",
				qualifyAnswers: { creditMin: 90_000, creditMax: 100_000, monthlyBudget: 1_700, prazoMeses: 0, hasLance: "yes" },
			},
		}).toLowerCase();
		expect(d).toMatch(/recommend_groups|recomenda/);
		expect(d).toMatch(/present_comparison_table|opções|opcoes/);
	});
});
