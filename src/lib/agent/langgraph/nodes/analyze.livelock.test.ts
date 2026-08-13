// FIX-431 (P0 #1) — o livelock que matou a venda de R$ 238 mil.
//
// Produção, WhatsApp, 2026-08-13, sessão `a68b1945`. Dois guards corretos,
// compostos, produzindo um funil imortal:
//
//   • FIX-307 (`qualify-state.ts`, `stuckGateDefaultPatch`): o gate `credit`
//     preso há 3 turnos promove o valor que o cliente JÁ disse
//     (`creditMentionedAtDesire`) para `creditMax`. Escape legítimo.
//   • FIX-378 (`analyze.ts`): `creditMax` que mudou tem de estar ancorado nos
//     números da fala. Guard legítimo.
//
// O problema é a composição. No turno seguinte ao escape, o cliente escreveu
// "Ok 3 anos" — que CONTÉM um número, o 3. O guard viu `creditMax` mudar de
// vazio para 238000, procurou 238000 entre os números da frase, achou só o 3, e
// REVERTEU o patch do escape. Três turnos depois o escape promove de novo, o
// guard reverte de novo. `nextGate` nunca sai de `credit`; `identify` nunca
// chega; a busca nunca é autorizada. O agente, sem tool e sem estado, disse
// "tive um problema na busca" e ofereceu um atendente.
//
// A correção não enfraquece nenhum dos dois: acrescenta a âncora que faltava.
// `creditMentionedAtDesire` só existe porque o CLIENTE disse aquele número —
// é fala dele registrada, apenas em outro turno. Promover o que ele disse não
// é fabricar valor, que é o único caso que o FIX-378 nasceu para impedir.
import { describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import type { AgentGraphStateType } from "../state";
import { createAnalyzeNode } from "./analyze";

const VALOR_DITO = 238_000;

/** O estado no turno seguinte ao escape: `creditMax` já promovido pelo FIX-307,
 *  e o valor que o cliente disse continua registrado em
 *  `creditMentionedAtDesire`. */
function estadoAposEscape(): {
	meta: ConversationMetadata;
	state: AgentGraphStateType;
} {
	const qualifyAnswers = {
		creditMentionedAtDesire: VALOR_DITO,
		desiredItem: "um BYD Song Premium",
	};
	const meta = {
		currentPersona: "auto",
		currentCategory: "auto",
		desireAsked: true,
		desireAnswered: true,
		motivationAsked: true,
		identityCollected: false,
		qualifyAnswers,
	} as ConversationMetadata;

	const state = {
		// A fala real do turno em que o guard reverteu — contém o número 3.
		userText: "Ok 3 anos",
		isUserTurn: true,
		gate: "credit",
		channel: "whatsapp",
		conversationId: "conv-livelock",
		// `creditMentionedAtDesire` vive no metadata PERSISTIDO, não no funnel
		// (não está em `FunnelQualifyAnswers`) — e sobrevive ao ciclo pelo spread
		// de `baseMeta.qualifyAnswers` em `projectToMeta`. O teste monta o estado
		// como ele é de verdade, não como seria conveniente.
		baseMeta: meta,
		funnel: {
			currentPersona: "auto",
			desireAsked: true,
			identityCollected: false,
			searchDispatched: false,
			qualifyAnswers: {},
		},
		messages: [],
	} as unknown as AgentGraphStateType;

	return { meta, state };
}

/** Analyzer que faz o que o escape do FIX-307 fez: promove o valor mencionado.
 *  Muta o `meta` que o NÓ montou (é o contrato de `analyzeAndMerge`). */
function analyzerQuePromove(valor: number) {
	return vi.fn(async (_texto, _persona, meta: ConversationMetadata) => {
		meta.qualifyAnswers = {
			...meta.qualifyAnswers,
			creditMax: valor,
			creditMin: Math.round(valor * 0.9),
		};
		return { analysis: { userIntent: "answer" } } as never;
	});
}

describe("livelock FIX-378 × FIX-307", () => {
	it("não reverte o valor que o próprio cliente disse (o caso da venda perdida)", async () => {
		const { state } = estadoAposEscape();
		const node = createAnalyzeNode(analyzerQuePromove(VALOR_DITO) as never);

		const saida = await node(state);

		expect(
			saida.funnel?.qualifyAnswers?.creditMax,
			"o escape promoveu o valor que o cliente disse; reverter aqui é o livelock",
		).toBe(VALOR_DITO);
	});

	// O guard continua inteiro para o caso que ele nasceu para pegar: valor que
	// NÃO saiu nem da fala do turno nem do que o cliente disse antes.
	it("continua revertendo valor que ninguém disse", async () => {
		const { state } = estadoAposEscape();
		const inventado = 1_000_000;
		const node = createAnalyzeNode(analyzerQuePromove(inventado) as never);

		const saida = await node(state);

		expect(saida.funnel?.qualifyAnswers?.creditMax).not.toBe(inventado);
	});
});

// FIX-431 — o valor que muda sozinho no fim do funil (o último FAIL do gate).
//
// `golden-fecho-nao-anda-pra-tras`, turno 9. O cliente escreve "isso, quero
// contratar" — nenhum número na frase. O analyzer devolveu `creditMax = 92902`
// (log: `credit=null-92902`), o `revealValueTargetChanged` viu faixa nova,
// reabriu a descoberta, os cards do reveal saíram de novo — e, como o turno já
// tinha um card que pede ação, o `contract_form` do gate `contract` (que o
// `route` HAVIA liberado: `gate=contract show=true`) não foi emitido.
//
// O cliente pediu para contratar e recebeu a lista de opções de volta.
//
// O guard do FIX-378 é permissivo de propósito quando a fala não tem número —
// o valor pode ter vindo do slider, de um card ou de um turno anterior. Essa
// permissividade é certa ANTES do reveal. Depois dele, com a faixa já
// descoberta e a oferta na mesa, um valor novo que não veio nem da fala nem de
// uma ação do cliente é ruído do analyzer, e custa a venda.
describe("valor não muda sozinho depois do reveal", () => {
	function estadoPosReveal(userText: string) {
		const qualifyAnswers = { creditMin: 83_000, creditMax: 92_000 };
		const meta = {
			currentPersona: "auto",
			revealCompleted: true,
			discoveredCreditTarget: 92_000,
			qualifyAnswers,
		} as ConversationMetadata;
		return {
			userText,
			isUserTurn: true,
			gate: "contract",
			channel: "web",
			conversationId: "conv-fecho",
			baseMeta: meta,
			funnel: {
				currentPersona: "auto",
				desireAsked: true,
				identityCollected: true,
				searchDispatched: true,
				revealCompleted: true,
				discoveredCreditTarget: 92_000,
				qualifyAnswers,
			},
			messages: [],
		} as unknown as AgentGraphStateType;
	}

	it("fala sem número não reabre a faixa (o caso do turno 9)", async () => {
		const state = estadoPosReveal("isso, quero contratar");
		const node = createAnalyzeNode(analyzerQuePromove(92_902) as never);

		const saida = await node(state);

		expect(
			saida.funnel?.qualifyAnswers?.creditMax,
			"o analyzer inventou uma faixa nova e reabriu a descoberta no turno do fechamento",
		).toBe(92_000);
	});

	// O que continua funcionando: o cliente que REALMENTE pede outro valor.
	it("fala COM número continua trocando a faixa", async () => {
		const state = estadoPosReveal("e se fosse 130 mil?");
		const node = createAnalyzeNode(analyzerQuePromove(130_000) as never);

		const saida = await node(state);

		expect(saida.funnel?.qualifyAnswers?.creditMax).toBe(130_000);
	});
});
