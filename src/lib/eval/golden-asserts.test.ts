// checkScenario — o juiz DETERMINÍSTICO do golden-set: valida trajetória
// (artifacts/gates por turno), nunca prosa (CLAUDE.md: conversa é do modelo).
// Contaminação (fallback degradado com HTTP 200) é FALHA — o repo já pagou
// esse pedágio no driver r9.
import { describe, expect, it } from "vitest";
import { checkScenario, DEFAULT_CONTAMINATION_MARKERS } from "./golden-asserts";

function turn(over: Partial<Parameters<typeof checkScenario>[0][0]> = {}) {
	return {
		userMsg: "oi",
		agentText: "Olá! Vamos comparar consórcios?",
		artifactTypes: ["welcome"],
		httpStatus: 200,
		error: null,
		...over,
	};
}

describe("checkScenario", () => {
	it("passa quando todos os expectArtifacts aparecem no turno", () => {
		const out = checkScenario([turn()], { turns: [{ expectArtifacts: ["welcome"] }] });
		expect(out).toEqual({ pass: true, failures: [] });
	});

	it("falha quando artifact esperado não veio", () => {
		const out = checkScenario([turn({ artifactTypes: [] })], {
			turns: [{ expectArtifacts: ["gate:credit"] }],
		});
		expect(out.pass).toBe(false);
		expect(out.failures[0]).toContain("gate:credit");
	});

	it("falha quando artifact PROIBIDO aparece (ex.: busca antes de identify)", () => {
		const out = checkScenario([turn({ artifactTypes: ["comparison_table"] })], {
			turns: [{ forbidArtifacts: ["comparison_table"] }],
		});
		expect(out.pass).toBe(false);
		expect(out.failures[0]).toContain("comparison_table");
	});

	it("falha em HTTP != 200 ou erro de transporte", () => {
		const bad = checkScenario([turn({ httpStatus: 500 })], {});
		expect(bad.pass).toBe(false);
		const err = checkScenario([turn({ error: "timeout apos 90000ms" })], {});
		expect(err.pass).toBe(false);
	});

	it("falha em CONTAMINAÇÃO (fallback degradado com 200)", () => {
		const out = checkScenario(
			[turn({ agentText: `Hmm. ${DEFAULT_CONTAMINATION_MARKERS[0]}` })],
			{},
		);
		expect(out.pass).toBe(false);
		expect(out.failures[0].toLowerCase()).toContain("contamina");
	});

	it("markers extras do cenário somam aos default", () => {
		const out = checkScenario([turn({ agentText: "ainda não terminei de montar as opções" })], {
			forbidTextMarkers: ["ainda não terminei de montar"],
		});
		expect(out.pass).toBe(false);
	});

	it("turno sem asserts (null) é livre — só as checagens globais valem", () => {
		const out = checkScenario([turn(), turn({ artifactTypes: [] })], {
			turns: [{ expectArtifacts: ["welcome"] }, null],
		});
		expect(out.pass).toBe(true);
	});

	it("nunca asserta prosa: texto qualquer com trajetória certa passa", () => {
		const out = checkScenario(
			[turn({ agentText: "QUALQUER fraseado que o modelo escolher aqui." })],
			{ turns: [{ expectArtifacts: ["welcome"] }] },
		);
		expect(out.pass).toBe(true);
	});
});

// ── Regressões reportadas no WhatsApp em 05/08/2026 (grupo AJA AGORA + Twobrains)
// Os dois defeitos abaixo são de NÚMERO, não de prosa — logo são invariante
// verificável e viram assert determinístico, não rubrica de juiz.
describe("checkScenario — regressões do report de 05/08", () => {
	/** Oferta como ela chega no payload do artifact (só os campos que os asserts leem). */
	function oferta(over: Record<string, unknown> = {}) {
		return {
			administradora: "CANOPUS",
			creditValue: 1_000_000,
			monthlyPayment: 6252,
			termMonths: 222,
			...over,
		};
	}

	it("FALHA quando a MESMA oferta aparece duas vezes na lista (Bruna: 'Está repetindo grupos iguais')", () => {
		// Print de 05/08 21:47: CANOPUS 1,0M · 6.252/mês · 222m aparece 2x
		// idêntico, e ÂNCORA idem. Os dois BANCO DO BRASIL do mesmo print têm
		// parcela/prazo diferentes — são grupos distintos e NÃO podem ser
		// tratados como duplicata.
		const out = checkScenario(
			[
				turn({
					artifactTypes: ["offer_options"],
					artifacts: [
						{
							type: "offer_options",
							data: {
								offers: [
									oferta({
										administradora: "BANCO DO BRASIL",
										monthlyPayment: 6396,
										termMonths: 209,
									}),
									oferta(),
									oferta({ administradora: "ITAÚ", monthlyPayment: 8988, termMonths: 148 }),
									oferta({ administradora: "ÂNCORA", monthlyPayment: 6915, termMonths: 196 }),
									oferta(), // ← duplicata exata de CANOPUS
									oferta({ administradora: "ÂNCORA", monthlyPayment: 6915, termMonths: 196 }), // ← duplicata exata
									oferta({
										administradora: "BANCO DO BRASIL",
										monthlyPayment: 10272,
										termMonths: 125,
									}),
								],
							},
						},
					],
				}),
			],
			{ turns: [{ forbidDuplicateOffers: true }] },
		);
		expect(out.pass).toBe(false);
		expect(out.failures.join(" ")).toContain("CANOPUS");
	});

	it("passa quando a mesma administradora repete com NÚMEROS diferentes (grupos distintos)", () => {
		const out = checkScenario(
			[
				turn({
					artifactTypes: ["offer_options"],
					artifacts: [
						{
							type: "offer_options",
							data: {
								offers: [
									oferta({
										administradora: "BANCO DO BRASIL",
										monthlyPayment: 6396,
										termMonths: 209,
									}),
									oferta({
										administradora: "BANCO DO BRASIL",
										monthlyPayment: 10272,
										termMonths: 125,
									}),
								],
							},
						},
					],
				}),
			],
			{ turns: [{ forbidDuplicateOffers: true }] },
		);
		expect(out.pass).toBe(true);
	});

	it("FALHA quando o agente ENCOLHE a carta pra baixar o lance (Bruna: 'não diminuir a minha carta')", () => {
		// Print de 05/08 16:19: pediu 200k, perguntou por grupo com menor lance,
		// e voltaram cartas de 150k/144k/144k/145k. A resposta certa já estava na
		// tela do print anterior — BANCO DO BRASIL, carta 208.780, lance 99.150.
		const out = checkScenario(
			[
				turn({
					artifactTypes: ["offer_options"],
					artifacts: [
						{
							type: "offer_options",
							data: {
								offers: [
									oferta({ administradora: "ITAÚ", creditValue: 150_000 }),
									oferta({ administradora: "ÂNCORA", creditValue: 144_000 }),
									oferta({ administradora: "RODOBENS", creditValue: 144_000 }),
									oferta({ administradora: "CANOPUS", creditValue: 145_000 }),
								],
							},
						},
					],
				}),
			],
			{ turns: [{ minCreditValue: 200_000 }] },
		);
		expect(out.pass).toBe(false);
		expect(out.failures.join(" ")).toMatch(/144\.?000|144000/);
	});

	it("FALHA quando o agente REPETE o próprio bloco (Bruna: 'Não saio do lugar')", () => {
		// Print de 05/08 21:44 (WhatsApp): o agente manda "Consultando as
		// administradoras agora, só um instante." e "Uns R$ 1.000.000 então, é
		// isso?", o usuário responde, e ele repete os DOIS de novo. Repetir a
		// própria fala entre turnos é a assinatura do loop.
		const out = checkScenario(
			[
				turn({
					userMsg: "Ape em Sao Paulo",
					agentText:
						"Consultando as administradoras agora, só um instante. Uns R$ 1.000.000 então, é isso? Pode ajustar se quiser.",
				}),
				turn({
					userMsg: "Pode ser esse valor",
					agentText:
						"Perfeito, Bruna! Consultando as administradoras agora, só um instante. Uns R$ 1.000.000 então, é isso? Pode ajustar se quiser.",
				}),
			],
			{ turns: [null, { forbidRepeatedAgentText: true }] },
		);
		expect(out.pass).toBe(false);
		expect(out.failures.join(" ").toLowerCase()).toContain("repet");
	});

	it("não acusa repetição em fala curta de confirmação (não é loop)", () => {
		const out = checkScenario(
			[
				turn({ agentText: "Beleza!" }),
				turn({ agentText: "Beleza! Vou buscar as opções pra você agora." }),
			],
			{ turns: [null, { forbidRepeatedAgentText: true }] },
		);
		expect(out.pass).toBe(true);
	});

	it("FALHA quando o agente crava valor de lance SEM lastro em tool (Bernardo: 'a IA tá chapada')", () => {
		// Print de 05/08 21:52: carta de R$ 1.000.000 e o agente sugere lance
		// "entre R$ 19 mil e R$ 26 mil" (3-4x a parcela). Nenhum artifact traz
		// esses valores — saiu da cabeça do modelo. O prompt já proíbe inventar
		// número; a regra-no-prompt não segurou, então vira código.
		const out = checkScenario(
			[
				turn({
					userMsg: "O que você sugere?",
					agentText:
						"Com prazo de até 6 meses e tendo capacidade de lance, o ideal é você dar um lance de umas 3 a 4 vezes a parcela mensal. Nesse caso, algo entre R$ 19 mil e R$ 26 mil.",
					artifactTypes: ["simulation"],
					artifacts: [
						{
							type: "simulation",
							data: { administradora: "CANOPUS", creditValue: 1_000_000, monthlyPayment: 6252 },
						},
					],
				}),
			],
			{ turns: [{ forbidUngroundedMoney: true }] },
		);
		expect(out.pass).toBe(false);
		expect(out.failures.join(" ")).toMatch(/19\.?000|26\.?000/);
	});

	it("passa quando todo valor citado tem lastro em artifact ou na fala do usuário", () => {
		const out = checkScenario(
			[
				turn({
					userMsg: "quero uma carta de R$ 1.000.000",
					agentText:
						"Fechado, R$ 1.000.000. A parcela fica em R$ 6.252 por mês e o lance estimado é de R$ 99.150.",
					artifactTypes: ["simulation"],
					artifacts: [
						{
							type: "simulation",
							data: { administradora: "CANOPUS", monthlyPayment: 6252, avgBidValue: 99_150 },
						},
					],
				}),
			],
			{ turns: [{ forbidUngroundedMoney: true }] },
		);
		expect(out.pass).toBe(true);
	});

	it("FALHA quando a recomendação ignora o eixo pedido (Bruna: 'esse não seria o grupo com menor lance')", () => {
		// Print de 05/08 16:21: ela pediu menor lance; a recomendação veio ÂNCORA
		// com lance médio 154.700, enquanto BANCO DO BRASIL na MESMA tela tinha
		// 99.150. "Melhor opção" tem que ser melhor no eixo que o cliente pediu.
		const out = checkScenario(
			[
				turn({
					userMsg: "a minha dúvida é: teria um grupo com menor lance?",
					artifactTypes: ["offer_options", "recommendation"],
					artifacts: [
						{
							type: "offer_options",
							data: {
								offers: [
									oferta({ administradora: "ITAÚ", avgBidValue: 164_591 }),
									oferta({ administradora: "ÂNCORA", avgBidValue: 154_700 }),
									oferta({ administradora: "BANCO DO BRASIL", avgBidValue: 99_150 }),
									oferta({ administradora: "RODOBENS", avgBidValue: 105_200 }),
								],
							},
						},
						{ type: "recommendation", data: { administradora: "ÂNCORA", avgBidValue: 154_700 } },
					],
				}),
			],
			{ turns: [{ recommendationMustMinimize: "avgBidValue" }] },
		);
		expect(out.pass).toBe(false);
		expect(out.failures.join(" ")).toContain("BANCO DO BRASIL");
	});

	it("passa quando a recomendação É a melhor no eixo pedido", () => {
		const out = checkScenario(
			[
				turn({
					artifactTypes: ["offer_options", "recommendation"],
					artifacts: [
						{
							type: "offer_options",
							data: {
								offers: [
									oferta({ administradora: "ÂNCORA", avgBidValue: 154_700 }),
									oferta({ administradora: "BANCO DO BRASIL", avgBidValue: 99_150 }),
								],
							},
						},
						{
							type: "recommendation",
							data: { administradora: "BANCO DO BRASIL", avgBidValue: 99_150 },
						},
					],
				}),
			],
			{ turns: [{ recommendationMustMinimize: "avgBidValue" }] },
		);
		expect(out.pass).toBe(true);
	});

	it("FALHA quando o funil TRAVA no mesmo gate (reproduzido na web em 09/08: 4 turnos em gate:name)", () => {
		// O agente perguntou "como posso te chamar?" em 4 turnos seguidos — mesmo
		// depois de save_contact_name ter rodado. O texto muda a cada turno (o
		// modelo reformula), então assert de texto NÃO pega. O que não muda é o
		// gate: `gate:name` em todos. Travar no gate É o defeito.
		const out = checkScenario(
			[
				turn({ artifactTypes: ["gate:name"] }),
				turn({ artifactTypes: ["transition:auto", "gate:name"] }),
				turn({ artifactTypes: ["tool:save_contact_name", "gate:name"] }),
				turn({ artifactTypes: ["gate:name"] }),
			],
			{ maxConsecutiveSameGate: 2 },
		);
		expect(out.pass).toBe(false);
		expect(out.failures.join(" ")).toContain("gate:name");
	});

	it("não acusa travamento quando o funil avança de gate", () => {
		const out = checkScenario(
			[
				turn({ artifactTypes: ["gate:name"] }),
				turn({ artifactTypes: ["gate:name"] }),
				turn({ artifactTypes: ["gate:desire"] }),
				turn({ artifactTypes: ["gate:credit"] }),
			],
			{ maxConsecutiveSameGate: 2 },
		);
		expect(out.pass).toBe(true);
	});

	it("tolera a variação normal da administradora acima do alvo (208.780 pra um alvo de 200k)", () => {
		const out = checkScenario(
			[
				turn({
					artifactTypes: ["offer_options"],
					artifacts: [
						{
							type: "offer_options",
							data: {
								offers: [oferta({ administradora: "BANCO DO BRASIL", creditValue: 208_780 })],
							},
						},
					],
				}),
			],
			{ turns: [{ minCreditValue: 200_000 }] },
		);
		expect(out.pass).toBe(true);
	});
});
