// O card de ESCOLHA é payload que o modelo escreve — então é payload que o
// servidor confere. Estes testes mordem: cada recusa some se a validação
// correspondente sair, e o card de fato (número) só sai de tool.
import { describe, expect, it, vi } from "vitest";
import type { GroupSummary } from "@/lib/adapters/types";
import type { ClosingItem } from "@/lib/bevi/closing-presentation";

// Identidade FIXA com CPF em claro: o que este arquivo prova é que o número não
// volta para o modelo em nenhuma fala das tools.
vi.mock("@/lib/conversation/identity", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/conversation/identity")>()),
	loadIdentity: async () => ({ cpf: "52998224725", celular: "" }),
}));

import {
	type ContextoDeFato,
	cardDeEscolha,
	DESTINO_DOS_CARDS,
	destinoDoCard,
	MAX_OPCOES_NO_CARD,
	montarCardDeFato,
	TIPOS_DE_ESCOLHA,
} from "./cards-livres";
import { cenariosDaCarta } from "./cenarios";
import { aplicarItensDoFecho, buildToolsLivres, type ContextoDasTools } from "./tools-livres";

function ctxVazio(): ContextoDasTools {
	return {
		conversationId: "conv-teste",
		channel: "web",
		userText: null,
		nomeDoCliente: null,
		cards: [],
		falasDoFecho: [],
		cartasNaTela: [],
		gruposRevelados: new Map(),
		pediuHumano: false,
		estadoDepoisDaBusca: null,
	};
}

type ToolChamavel = {
	execute: (input: unknown, opts: unknown) => Promise<unknown>;
};

/** Chama `mostrar_card` do jeito que o pi chama e devolve o texto pro modelo. */
async function mostrarCard(
	ctx: ContextoDasTools,
	tipo: string,
	payload: Record<string, unknown>,
): Promise<string> {
	const tools = buildToolsLivres(ctx) as unknown as Record<string, ToolChamavel>;
	const saida = await tools.mostrar_card.execute(
		{ tipo, payload },
		{ toolCallId: "call-1", messages: [] },
	);
	return typeof saida === "string" ? saida : JSON.stringify(saida);
}

describe("cardDeEscolha — quick_reply", () => {
	it("2 opções com label viram card, na ordem em que o modelo escreveu", () => {
		const r = cardDeEscolha("quick_reply", {
			options: [{ label: "Até 80 mil" }, { label: "Até 120 mil" }],
		});

		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.card.type).toBe("quick_reply");
		const options = r.card.payload.options as Array<{ label: string; replyId: string }>;
		expect(options.map((o) => o.label)).toEqual(["Até 80 mil", "Até 120 mil"]);
	});

	it("cada atalho nasce com replyId do servidor — é por ele que o clique é consumido (L26)", () => {
		const r = cardDeEscolha("quick_reply", {
			options: [{ label: "Sim, quero" }, { label: "Ainda não" }],
		});

		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const ids = (r.card.payload.options as Array<{ replyId: string }>).map((o) => o.replyId);
		expect(ids).toHaveLength(2);
		for (const id of ids) expect(id).toMatch(/^[0-9a-f-]{36}$/);
		expect(new Set(ids).size).toBe(2);
	});

	it("groupId do modelo só sobrevive conferido contra as cartas REAIS da tela (L26)", () => {
		const grupos = new Map<string, GroupSummary>([
			[
				"cota-1",
				{
					id: "cota-1",
					administradora: "Canopus",
					category: "auto",
					creditValue: 80_000,
					monthlyPayment: 1_100,
					adminFeePercent: 17,
					termMonths: 96,
					totalParticipants: 1_200,
					availableSlots: 9,
				},
			],
			[
				"cota-2",
				{
					id: "cota-2",
					administradora: "Canopus",
					category: "auto",
					creditValue: 80_000,
					monthlyPayment: 1_400,
					adminFeePercent: 17,
					termMonths: 84,
					totalParticipants: 900,
					availableSlots: 4,
				},
			],
		]);
		const options = (r: { card: { payload: Record<string, unknown> } }) =>
			r.card.payload.options as Array<{ label: string; groupId?: string }>;

		// O rótulo BATE com a cota declarada: o id viaja e o clique vira escolha.
		const conferido = cardDeEscolha(
			"quick_reply",
			{
				options: [
					{ label: "a de menor parcela", groupId: "cota-1" },
					{ label: "a de prazo mais curto", groupId: "cota-2" },
				],
			},
			grupos,
		);
		expect(conferido.ok).toBe(true);
		if (!conferido.ok) return;
		expect(options(conferido).map((o) => o.groupId)).toEqual(["cota-1", "cota-2"]);

		// O rótulo aponta para OUTRA cota: o id cai (fail-closed da main).
		const trocado = cardDeEscolha(
			"quick_reply",
			{
				options: [
					{ label: "a de menor parcela", groupId: "cota-2" },
					{ label: "a de prazo mais curto", groupId: "cota-1" },
				],
			},
			grupos,
		);
		expect(trocado.ok).toBe(true);
		if (!trocado.ok) return;
		expect(options(trocado).map((o) => o.groupId)).toEqual([undefined, undefined]);

		// Grupo inventado, cota não exibida: id nenhum no payload.
		const inventado = cardDeEscolha(
			"quick_reply",
			{ options: [{ label: "A primeira", groupId: "cota-fantasma" }, { label: "A segunda" }] },
			grupos,
		);
		expect(inventado.ok).toBe(true);
		if (!inventado.ok) return;
		expect(options(inventado).map((o) => o.groupId)).toEqual([undefined, undefined]);

		// Sem cartas no turno, nada é adivinhado.
		const semCartas = cardDeEscolha("quick_reply", {
			options: [
				{ label: "a de menor parcela", groupId: "cota-1" },
				{ label: "a de prazo mais curto", groupId: "cota-2" },
			],
		});
		expect(semCartas.ok).toBe(true);
		if (!semCartas.ok) return;
		expect(options(semCartas).map((o) => o.groupId)).toEqual([undefined, undefined]);
	});

	it("lista vazia de opções é recusada e não produz card", () => {
		const r = cardDeEscolha("quick_reply", { options: [] });

		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.erro.length).toBeGreaterThan(0);
	});

	it(`aceita ${MAX_OPCOES_NO_CARD} opções e recusa a quinta`, () => {
		const quatro = cardDeEscolha("quick_reply", {
			options: ["a", "b", "c", "d"].map((label) => ({ label })),
		});
		expect(quatro.ok).toBe(true);

		const cinco = cardDeEscolha("quick_reply", {
			options: ["a", "b", "c", "d", "e"].map((label) => ({ label })),
		});
		expect(cinco.ok).toBe(false);
		if (cinco.ok) return;
		expect(cinco.erro).toContain(String(MAX_OPCOES_NO_CARD));
	});

	it("opção sem label (ou com label vazio) é recusada", () => {
		expect(cardDeEscolha("quick_reply", { options: [{ label: "sim" }, {}] }).ok).toBe(false);
		expect(cardDeEscolha("quick_reply", { options: [{ label: "   " }] }).ok).toBe(false);
	});
});

describe("cardDeEscolha — value_picker", () => {
	const campo = (over: Record<string, unknown> = {}) => ({
		id: "valor-do-bem",
		label: "Até 80 mil",
		min: 10_000,
		max: 80_000,
		step: 10_000,
		default: 50_000,
		format: "currency",
		...over,
	});

	it("faixa de intenção (até 80 mil / até 120 mil) vira card com os campos intactos", () => {
		const campos = [
			campo(),
			campo({ id: "valor-do-bem-120", label: "Até 120 mil", max: 120_000, default: 100_000 }),
		];

		const r = cardDeEscolha("value_picker", { category: "auto", fields: campos });

		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.card.type).toBe("value_picker");
		expect(r.card.payload.category).toBe("auto");
		expect(r.card.payload.fields).toEqual(campos);
	});

	it("max <= min é recusado mesmo quando o default cai no ponto que a faixa descreve", () => {
		expect(
			cardDeEscolha("value_picker", {
				category: "auto",
				fields: [campo({ min: 80_000, max: 80_000, default: 80_000 })],
			}).ok,
		).toBe(false);
		expect(
			cardDeEscolha("value_picker", {
				category: "auto",
				fields: [campo({ min: 80_000, max: 50_000, default: 60_000 })],
			}).ok,
		).toBe(false);
	});

	it("default fora da faixa é recusado", () => {
		expect(
			cardDeEscolha("value_picker", { category: "auto", fields: [campo({ default: 200_000 })] }).ok,
		).toBe(false);
		expect(
			cardDeEscolha("value_picker", { category: "auto", fields: [campo({ default: 0 })] }).ok,
		).toBe(false);
	});

	it("categoria 'servicos' é recusada — o payload só admite imovel, auto e moto", () => {
		const r = cardDeEscolha("value_picker", { category: "servicos", fields: [campo()] });

		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.erro).toContain("imovel");
	});

	it("fields: [] é recusado", () => {
		expect(cardDeEscolha("value_picker", { category: "auto", fields: [] }).ok).toBe(false);
	});
});

describe("cardDeEscolha — topic_picker", () => {
	it("válido vira card com os tópicos e o botão de voltar", () => {
		const r = cardDeEscolha("topic_picker", {
			prompt: "Sobre o que você quer saber?",
			topics: ["Prazo", "Lance"],
			includeBackButton: true,
		});

		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.card.type).toBe("topic_picker");
		expect(r.card.payload.topics).toEqual(["Prazo", "Lance"]);
		expect(r.card.payload.includeBackButton).toBe(true);
	});

	it("sem topics é recusado", () => {
		expect(cardDeEscolha("topic_picker", { includeBackButton: true }).ok).toBe(false);
		expect(cardDeEscolha("topic_picker", { topics: [], includeBackButton: true }).ok).toBe(false);
	});

	it("sem includeBackButton é recusado — o campo é a única parte do payload que não é óbvia", () => {
		expect(cardDeEscolha("topic_picker", { topics: ["Prazo"] }).ok).toBe(false);
	});
});

describe("mostrar_card — a escolha entra na tela, o fato não", () => {
	it("quick_reply aprovado empurra o card no contexto", async () => {
		const ctx = ctxVazio();
		const texto = await mostrarCard(ctx, "quick_reply", {
			options: [{ label: "Sim, quero" }, { label: "Ainda não" }],
		});

		expect(ctx.cards).toHaveLength(1);
		expect(ctx.cards[0].type).toBe("quick_reply");
		expect(texto).not.toContain("NÃO");
	});

	it("quick_reply inválido não empurra card nenhum", async () => {
		const ctx = ctxVazio();
		const texto = await mostrarCard(ctx, "quick_reply", { options: [] });

		expect(ctx.cards).toHaveLength(0);
		expect(texto).toContain("NÃO");
	});

	it.each(["real_offer", "comparison_table", "scarcity"])(
		"card de FATO (%s) numa conversa sem busca é recusado com texto, sem card",
		async (tipo) => {
			const ctx = ctxVazio();
			const texto = await mostrarCard(ctx, tipo, {});

			expect(ctx.cards).toHaveLength(0);
			expect(texto).toContain("NÃO");
		},
	);
});

describe("mostrar_card no WhatsApp — FIX-109, o value_picker não sai", () => {
	const faixas = [
		{ id: "valor-do-bem", label: "Até 80 mil", min: 10_000, max: 80_000, default: 50_000 },
	];

	it("no WhatsApp o value_picker é RECUSADO e nenhum card aparece", async () => {
		const ctx = { ...ctxVazio(), channel: "whatsapp" as const };

		const texto = await mostrarCard(ctx, "value_picker", { category: "auto", fields: faixas });

		expect(ctx.cards).toHaveLength(0);
		expect(texto).toContain("NÃO");
		// A recusa ENSINA o caminho: lá o valor do bem é conversa.
		expect(texto).toContain("conversa");
		expect(texto).toContain("Pergunte");
	});

	it("no web o mesmo value_picker sai", async () => {
		const ctx = ctxVazio();

		const texto = await mostrarCard(ctx, "value_picker", { category: "auto", fields: faixas });

		expect(ctx.cards).toHaveLength(1);
		expect(ctx.cards[0].type).toBe("value_picker");
		expect(texto).not.toContain("NÃO");
	});

	it("quick_reply e topic_picker continuam valendo no WhatsApp (o formatter renderiza)", async () => {
		const doWhatsApp = () => ({ ...ctxVazio(), channel: "whatsapp" as const });

		// Um card interativo por turno (o segundo é recusado de propósito), então
		// cada tipo é provado no seu turno.
		const atalhos = doWhatsApp();
		await mostrarCard(atalhos, "quick_reply", { options: [{ label: "Sim" }] });
		const topicos = doWhatsApp();
		await mostrarCard(topicos, "topic_picker", { topics: ["Prazo"], includeBackButton: true });

		expect([...atalhos.cards, ...topicos.cards].map((c) => c.type)).toEqual([
			"quick_reply",
			"topic_picker",
		]);
	});
});

describe("fazer_proposta — o CPF nunca chega ao modelo", () => {
	it("a fala do celular faltando fala do CPF sem dígito nenhum", async () => {
		const ctx = ctxVazio();
		ctx.cartasNaTela = [
			{
				groupId: "grupo-na-tela",
				administradora: "Canopus",
				carta: 80_000,
				parcela: 1_200,
				prazoMeses: 96,
			},
		];
		const tools = buildToolsLivres(ctx) as unknown as Record<string, ToolChamavel>;

		const saida = await tools.fazer_proposta.execute(
			{ groupId: "grupo-na-tela", aceiteLgpd: true },
			{ toolCallId: "call-1", messages: [] },
		);
		const fala = typeof saida === "string" ? saida : JSON.stringify(saida);

		expect(fala).toContain("CPF");
		expect(fala).toContain("guardado");
		// Nem um dígito do CPF na fala (antes ia `529…` e o logToolIO gravava).
		expect(fala).not.toMatch(/\d/);
	});
});

describe("DESTINO_DOS_CARDS — os 22 tipos têm destino declarado", () => {
	it("tem exatamente 22 chaves", () => {
		expect(Object.keys(DESTINO_DOS_CARDS)).toHaveLength(22);
	});

	it("todo card fora-do-motor diz por quê", () => {
		for (const [tipo, destino] of Object.entries(DESTINO_DOS_CARDS)) {
			if (destino.classe !== "fora-do-motor") continue;
			expect(destino.motivo.trim().length, `${tipo} sem motivo`).toBeGreaterThan(0);
		}
	});

	it("os três tipos de escolha são emitíveis por escolha", () => {
		for (const tipo of TIPOS_DE_ESCOLHA) {
			expect(DESTINO_DOS_CARDS[tipo]).toEqual({ classe: "emitivel", origem: "escolha" });
		}
	});
});

describe("fecho do fazer_proposta — o tipo do item é respeitado", () => {
	it("signature_handoff sai como signature_handoff, não colapsado em real_offer", () => {
		const ctx = ctxVazio();
		const itens: ClosingItem[] = [
			{ kind: "text", text: "Proposta gerada." },
			{ kind: "artifact", type: "signature_handoff", payload: { proposalUrl: "https://x" } },
		];

		aplicarItensDoFecho(ctx, itens);

		expect(ctx.falasDoFecho).toEqual(["Proposta gerada."]);
		expect(ctx.cards).toEqual([
			{ type: "signature_handoff", payload: { proposalUrl: "https://x" } },
		]);
	});
});

const CARTA_DA_TELA: GroupSummary = {
	id: "cota-1",
	administradora: "Canopus",
	category: "auto",
	creditValue: 80_000,
	monthlyPayment: 1_234.56,
	adminFeePercent: 17,
	termMonths: 96,
	totalParticipants: 1_200,
	availableSlots: 9,
	grupo: "70035",
};

function ctxDeFato(over: Partial<ContextoDeFato> = {}): ContextoDeFato {
	return {
		conversationId: "conv-fato",
		channel: "web",
		nomeDoCliente: "Marina",
		grupos: new Map(),
		cpfMascarado: null,
		...over,
	};
}

describe("contract_form — a flag que autoriza o contract-submit (L02)", () => {
	it("o card de formulário carrega contractFormDispatched para a persistência", async () => {
		const r = await montarCardDeFato("contract_form", ctxDeFato());

		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.card.type).toBe("contract_form");
		// Sem esta flag, `src/app/api/chat/route.ts:1112` recusa o submit — e a
		// proposta real nunca nasce.
		expect(r.metaDoTurno).toEqual({ contractFormDispatched: true });
	});

	it("os outros cards de fato não mexem na meta do turno", async () => {
		const r = await montarCardDeFato("lead_form", ctxDeFato());

		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.metaDoTurno).toBeUndefined();
	});
});

describe("cenários de contemplação (L17/P139) — card de FATO, calculado da carta", () => {
	it("scenarios é card de FATO: sai da carta da conversa, não do payload do modelo", async () => {
		// Na main o card vinha de `compute_scenarios`; o que se recupera aqui é o
		// COMPORTAMENTO (3 cenários com número calculado), não a tool do funil.
		expect(destinoDoCard("scenarios")?.classe).toBe("emitivel");

		const ctx = ctxVazio();
		ctx.gruposRevelados.set(CARTA_DA_TELA.id, CARTA_DA_TELA);
		// O modelo manda número de oferta no payload: nada disso entra no card.
		await mostrarCard(ctx, "scenarios", {
			groupId: CARTA_DA_TELA.id,
			creditValue: 999_999,
			scenarios: { provavel: { lancePercent: 99 } },
		});

		const card = ctx.cards[0];
		expect(card?.type).toBe("scenarios");
		if (card?.type !== "scenarios") return;
		expect(card.payload).toEqual(cenariosDaCarta(CARTA_DA_TELA));
		expect(JSON.stringify(card.payload)).not.toContain("999999");
	});

	it("o modelo diz que o cliente recusou o embutido: nenhum cenário usa a carta como lance (L17/P139)", async () => {
		// Caminho real: `mostrar_card` → payload do modelo → montador → `cenariosDaCarta`.
		// É o modelo que passa `false` na recusa explícita, como a `compute_scenarios` da main.
		const ctx = ctxVazio();
		ctx.gruposRevelados.set(CARTA_DA_TELA.id, CARTA_DA_TELA);
		ctx.perfilDeclarado = { lanceValue: 20_000 };

		await mostrarCard(ctx, "scenarios", {
			groupId: CARTA_DA_TELA.id,
			usarLanceEmbutido: false,
		});

		const card = ctx.cards[0];
		expect(card?.type).toBe("scenarios");
		if (card?.type !== "scenarios") return;
		expect(card.payload).toEqual(
			cenariosDaCarta(CARTA_DA_TELA, { lanceDeclarado: 20_000, recusouEmbutido: true }),
		);
		// O embutido zerado morde: em nenhum cenário a carta cobre parte do lance.
		const cenarios = card.payload.scenarios as Record<
			"provavel" | "acelerado",
			{ lanceValue: number; ownResourcesValue: number }
		>;
		expect(cenarios.provavel.ownResourcesValue).toBe(cenarios.provavel.lanceValue);
		expect(cenarios.acelerado.ownResourcesValue).toBe(cenarios.acelerado.lanceValue);
	});

	it("sem o argumento o cenário é o de hoje: o dinheiro declarado entra e o embutido cobre o resto", async () => {
		const ctx = ctxVazio();
		ctx.gruposRevelados.set(CARTA_DA_TELA.id, CARTA_DA_TELA);
		ctx.perfilDeclarado = { lanceValue: 5_000 };

		await mostrarCard(ctx, "scenarios", { groupId: CARTA_DA_TELA.id });

		const card = ctx.cards[0];
		if (card?.type !== "scenarios") return;
		expect(card.payload).toEqual(cenariosDaCarta(CARTA_DA_TELA, { lanceDeclarado: 5_000 }));
		const provavel = (
			card.payload.scenarios as { provavel: { lanceValue: number; ownResourcesValue: number } }
		).provavel;
		// O dinheiro declarado entra no lance; o embutido cobre o que falta.
		expect(provavel.ownResourcesValue).toBe(5_000);
		expect(provavel.ownResourcesValue).toBeLessThan(provavel.lanceValue);
	});

	it("sem dinheiro declarado e com a recusa, o lance sai todo do bolso do cliente", async () => {
		// O argumento basta sozinho: sem perfil nenhum, `false` zera o embutido nos três.
		const ctx = ctxVazio();
		ctx.gruposRevelados.set(CARTA_DA_TELA.id, CARTA_DA_TELA);

		await mostrarCard(ctx, "scenarios", {
			groupId: CARTA_DA_TELA.id,
			usarLanceEmbutido: false,
		});

		const card = ctx.cards[0];
		if (card?.type !== "scenarios") return;
		expect(card.payload).toEqual(cenariosDaCarta(CARTA_DA_TELA, { recusouEmbutido: true }));
		const cenarios = card.payload.scenarios as Record<
			"conservador" | "provavel" | "acelerado",
			{ lanceValue: number; ownResourcesValue: number }
		>;
		for (const cenario of Object.values(cenarios)) {
			expect(cenario.ownResourcesValue).toBe(cenario.lanceValue);
		}
	});

	it("só o argumento do modelo zera o embutido — a chave da qualificação não é lida", async () => {
		// Decisão da onda 7: `qualifyAnswers.lanceEmbutido` diz "a busca foi feita sem
		// embutido", não "o cliente recusou"; derivar dali cortaria o embutido da
		// maioria das conversas. O nome do argumento é o da main: `usarLanceEmbutido`.
		const ctx = ctxVazio();
		ctx.gruposRevelados.set(CARTA_DA_TELA.id, CARTA_DA_TELA);
		ctx.perfilDeclarado = { lanceValue: 5_000 };

		await mostrarCard(ctx, "scenarios", {
			groupId: CARTA_DA_TELA.id,
			lanceEmbutido: false,
		});

		const card = ctx.cards[0];
		if (card?.type !== "scenarios") return;
		expect(card.payload).toEqual(cenariosDaCarta(CARTA_DA_TELA, { lanceDeclarado: 5_000 }));
	});

	it("sem carta conhecida o card recusa e manda buscar primeiro", async () => {
		const r = await montarCardDeFato("scenarios", ctxDeFato());

		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.erro).toContain("buscar_cartas");
	});

	it("a pergunta que o card respondia ('quando contemplo e o que cada caminho exige') sai do dial", async () => {
		const r = await montarCardDeFato(
			"contemplation_dial",
			ctxDeFato({ grupos: new Map([[CARTA_DA_TELA.id, CARTA_DA_TELA]]) }),
			{ initialTargetMonth: 12 },
		);

		expect(r.ok).toBe(true);
		if (!r.ok) return;
		// Os números são os da CARTA REAL; o mês-alvo é o que o cliente pediu.
		expect(r.card.payload.creditValue).toBe(80_000);
		expect(r.card.payload.termMonths).toBe(96);
		expect(r.card.payload.initialTargetMonth).toBe(12);
	});
});

describe("card de WhatsApp: uma vez por conversa, e sem pedir o número que o lead já tem (líder, 28/10 05:05)", () => {
	it("a primeira vez com o celular já no lead: o card é só confirmação e a tool manda não pedir número", async () => {
		const ctx = { ...ctxVazio(), telefoneMascarado: "(11) *****-4321" };
		const saida = await mostrarCard(ctx, "whatsapp_optin", {});
		expect(ctx.cards.map((c) => c.type)).toEqual(["whatsapp_optin"]);
		expect(ctx.cards[0].payload).toMatchObject({ knownPhone: "(11) *****-4321" });
		expect(saida).toMatch(/não peça número/i);
	});

	it("depois de o card já ter ido à tela, ele NÃO sai de novo e a tool diz para confirmar o número que o cliente passou", async () => {
		const ctx = {
			...ctxVazio(),
			telefoneMascarado: "(11) *****-4321",
			whatsappOptinJaMostrado: true,
		};
		const saida = await mostrarCard(ctx, "whatsapp_optin", {});
		expect(ctx.cards).toHaveLength(0);
		expect(saida).toMatch(/NÃO mostrado/);
		expect(saida).toMatch(/Não peça número nem mande digitar em card/);
		expect(saida).toContain("(11) *****-4321");
	});

	it("sem celular conhecido, o card repetido também não sai; a fala pede o número em uma frase", async () => {
		const ctx = { ...ctxVazio(), whatsappOptinJaMostrado: true };
		const saida = await mostrarCard(ctx, "whatsapp_optin", {});
		expect(ctx.cards).toHaveLength(0);
		expect(saida).toMatch(/peça em uma frase, na conversa/);
	});

	it("o mesmo turno também não empilha dois cards de WhatsApp", async () => {
		const ctx = ctxVazio();
		await mostrarCard(ctx, "whatsapp_optin", {});
		await mostrarCard(ctx, "whatsapp_optin", {});
		expect(ctx.cards.filter((c) => c.type === "whatsapp_optin")).toHaveLength(1);
	});
});
