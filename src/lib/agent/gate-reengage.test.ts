// D8 (FIX-437) — o watchdog não cobra gate de coleta com o desbloqueio do
// telefone pendente.
//
// As "perguntas repetidas 3×" de 30/09 (`576e5b66` 12:16–12:22, `ef18fd09`
// 14:45–14:51) são o `gate-reengage` cobrando "valor do bem" com a escada fixa
// enquanto o cliente estava parado no CARD DO TELEFONE. O bloqueio real era o
// número, não o crédito.
//
// Aqui vivem as DUAS pontas da correção, e elas precisam concordar:
//  1. a decisão pura (`pendingGateAfterTurn`) — com o desbloqueio pendente o
//     gate de coleta não é armado, e um gate de outra natureza segue igual;
//  2. a fiação (`persist`) — o estado do desbloqueio chega de verdade à decisão,
//     o que só o cenário ponta-a-ponta prova.
//
// O controle por canal é o item: no WhatsApp não há card de telefone, então a
// mesma conversa parada no `credit` CONTINUA sendo armada. Sem ele, um
// `desbloqueioPendente: true` fixo passaria nos dois lados e mataria o watchdog
// no canal que mais vende.

import { afterAll, describe, expect, it } from "vitest";
import { pendingGateAfterTurn } from "./gate-reengage";
import { limparCenario, runScenario } from "./langgraph/testing/scenario";
import type { ConversationMetadata } from "./personas";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Quem escolheu a categoria e já respondeu ao `desire`, mas ainda deve o valor
 *  do bem: `nextGate` = `credit` (gate de COLETA). É o estado exato da
 *  reprodução — e `desireAnswered` sem motivo faz `decideShowGate` segurar o card
 *  do `credit` neste turno (o beat de "por que agora" tem turno próprio), que é o
 *  que deixa a pendência ser ARMADA sem que o card conduza o turno. */
const META_NO_CREDIT = {
	currentCategory: "auto",
	desireAsked: true,
	desireAnswered: true,
} as ConversationMetadata;

/** Pós-reveal com a experiência respondida: `nextGate` = `timeframe`, que NÃO é
 *  gate de coleta — a prova de que D8 é cirúrgico, não um "bloqueia tudo". */
const META_NO_TIMEFRAME = {
	currentPersona: "auto",
	currentCategory: "auto",
	desireAsked: true,
	desireAnswered: true,
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	experiencePrev: "first",
	topicPickerDispatched: true,
	qualifyAnswers: { creditMin: 108_000, creditMax: 120_000 },
} as ConversationMetadata;

describe("pendingGateAfterTurn — desbloqueio do telefone retém o gate de coleta (D8)", () => {
	it("com o desbloqueio pendente, o gate `credit` NÃO é armado", () => {
		expect(
			pendingGateAfterTurn({
				meta: META_NO_CREDIT,
				gateFired: false,
				isUserTurn: true,
				hasContactName: true,
				desbloqueioPendente: true,
			}),
		).toBeNull();
	});

	it("sem o desbloqueio pendente, o comportamento de hoje volta", () => {
		expect(
			pendingGateAfterTurn({
				meta: META_NO_CREDIT,
				gateFired: false,
				isUserTurn: true,
				hasContactName: true,
				desbloqueioPendente: false,
			}),
		).toBe("credit");
	});

	it("gate que NÃO é de coleta segue armado mesmo com o desbloqueio pendente", () => {
		expect(
			pendingGateAfterTurn({
				meta: META_NO_TIMEFRAME,
				gateFired: false,
				isUserTurn: true,
				hasContactName: true,
				desbloqueioPendente: true,
			}),
		).toBe("timeframe");
	});
});

describeIfDb("persist — o estado do desbloqueio chega à pendência do watchdog (D8)", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("web sem telefone, parado no gate de coleta → o watchdog NÃO é armado", async () => {
		const r = await runScenario({
			metaInicial: META_NO_CREDIT,
			turns: [
				{
					user: "entendi",
					// `off_topic` faz `decideShowGate` segurar o CARD do `credit` neste
					// turno: sem card, sem pergunta e sem tool, `conduziu` é falso e o
					// marcador seria armado — se o desbloqueio não o retivesse.
					intent: "off_topic",
					beats: [{ text: "Que bom que ficou claro." }],
				},
			],
		});
		criadas.push(r.conversationId);

		expect(r.meta.pendingGate).toBeFalsy();
		expect(r.meta.pendingGateSince).toBeFalsy();
	});

	it("whatsapp (não há card de telefone) → arma como sempre", async () => {
		const r = await runScenario({
			channel: "whatsapp",
			metaInicial: META_NO_CREDIT,
			turns: [
				{
					user: "entendi",
					// Mesmo turno do caso web: o card do `credit` fica retido, então o
					// marcador é armado (é o comportamento que queremos preservar no
					// canal sem card de telefone).
					intent: "off_topic",
					beats: [{ text: "Que bom que ficou claro." }],
				},
			],
		});
		criadas.push(r.conversationId);

		expect(r.meta.pendingGate).toBe("credit");
	});
});
