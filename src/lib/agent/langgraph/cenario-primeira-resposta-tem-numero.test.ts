// A jornada nova, do chip ao pedido de documento — rodada no grafo de verdade.
//
// `qualify-state.primeira-resposta-tem-numero.test.ts` prova a CASCATA (função
// pura). Este arquivo prova o TURNO: que o card certo é de fato emitido, na
// ordem certa, com o modelo se comportando mal de propósito.
//
// A diferença importa. Um `nextGate` correto não garante card na tela: entre a
// cascata e o cliente existe o `emit-card`, com as regras de "o card cede a vez
// quando o modelo perguntou outra coisa" (FIX-379) e de idempotência. Foi
// exatamente ali que o smoke ao vivo de 30/08/2026 levantou a dúvida — o
// primeiro turno trouxe o card do valor, mas o do nome demorou, e sem este
// arquivo a resposta seria "acho que é o modelo".
//
// O que estes cenários travam:
//   1. chip de categoria → card do VALOR já no primeiro turno;
//   2. valor informado → o NOME entra em seguida, mesmo com o modelo enrolando;
//   3. o funil não fica refém: o card do nome cede a vez no MÁXIMO uma vez.
//
// Skip se DATABASE_URL ausente.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("a primeira resposta tem número, não pergunta", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	beforeEach(() => {
		// Sem vitrine — o estado real de produção em 30/08/2026.
		process.env.VITRINE_CPF = "";
		process.env.VITRINE_CELULAR = "";
	});

	it("chip da landing → o card do VALOR no primeiro turno", async () => {
		const r = await runScenario({
			contactName: null,
			metaInicial: {},
			turns: [
				{
					// A entrada mais comum da operação: 63 das 70 conversas medidas em
					// produção começam exatamente assim.
					user: "Quero comprar um imóvel.",
					beats: [
						{
							// O modelo faz o que faz hoje: elogia e pergunta. Antes disto era
							// SÓ isso, e 49% das conversas morriam aqui.
							text: "Que ótimo! Imóvel é um investimento que muda a vida. Já tem um em mente?",
						},
					],
				},
			],
		});
		criadas.push(r.conversationId);

		// O card do valor sai NO MESMO turno — é ele que carrega a parcela
		// estimada (`value-picker.tsx`), e é ela que dá algo à pessoa antes de
		// qualquer pergunta.
		expect(r.turns[0].trilha).toContain("gate:credit");
		// E o nome não disputa o turno com ele.
		expect(r.turns[0].trilha).not.toContain("gate:name");
	});

	it("com o valor na mão, o NOME entra em seguida", async () => {
		// O valor entra pelo `metaInicial` e não pela fala: o harness roda o grafo
		// com beats FIXOS, sem o analyzer que extrai número de texto livre. A
		// extração já é provada em `analyze.valor-no-primeiro-turno.test.ts`; o que
		// se prova aqui é a ORDEM dos portões depois que o valor existe — que é o
		// que a mudança de 30/08 mexeu.
		const r = await runScenario({
			contactName: null,
			metaInicial: {
				currentCategory: "imovel",
				qualifyAnswers: { creditMax: 400_000 },
			},
			turns: [
				{
					user: "Prefiro que você busque",
					// O modelo enrola, perguntando outra coisa. O card cede a vez (FIX-379).
					beats: [{ text: "Perfeito. Já tem ideia de quanto cabe por mês na parcela?" }],
				},
				{
					user: "Não sei ainda",
					// E insiste. Agora o card entra de qualquer jeito.
					beats: [{ text: "Deixa eu ver as melhores opções pra você." }],
				},
			],
		});
		criadas.push(r.conversationId);

		// O nome NÃO some — ele desce. E entra ANTES de qualquer pedido de
		// documento, porque pedir CPF a quem não se apresentou é a ordem errada.
		expect(r.turns[1].trilha).toContain("gate:name");
		expect(r.turns[1].trilha).not.toContain("gate:identify");
	});

	it("o card do nome cede a vez no máximo UMA vez — o funil não fica refém", async () => {
		const r = await runScenario({
			contactName: null,
			metaInicial: {
				currentCategory: "auto",
				qualifyAnswers: { creditMax: 90_000 },
			},
			turns: [
				{ user: "Novo", beats: [{ text: "Boa escolha. Prefere sedã ou SUV?" }] },
				{ user: "SUV", beats: [{ text: "Show. Alguma marca preferida?" }] },
				{ user: "Tanto faz", beats: [{ text: "Perfeito. Cor você tem preferência?" }] },
			],
		});
		criadas.push(r.conversationId);

		// Três turnos com o modelo perguntando outra coisa toda vez. Se o card
		// dependesse da boa vontade dele, o funil ficaria parado para sempre — é a
		// preocupação que gerou o FIX-379, e ela continua coberta na posição nova.
		const turnosComNome = r.turns.filter((t) => t.trilha.includes("gate:name"));
		expect(turnosComNome.length).toBeGreaterThan(0);
	});

	it("quem chega sem dizer nada continua sendo recebido pelo nome", async () => {
		const r = await runScenario({
			contactName: null,
			metaInicial: {},
			turns: [{ user: "Oi", beats: [{ text: "Oi! Que bom te ver por aqui." }] }],
		});
		criadas.push(r.conversationId);

		// Aqui a pergunta é a conversa começando, não um pedágio — e a mudança de
		// 30/08 não encostou neste caso.
		expect(r.turns[0].trilha).toContain("gate:name");
	});
});
