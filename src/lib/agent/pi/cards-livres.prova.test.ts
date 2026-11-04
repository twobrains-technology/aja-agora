// A PROVA DE CARD — nenhum dos 22 tipos volta a desaparecer em silêncio.
//
// A refatoração de 16/10/2026 apagou 20 dos 22 cards e NADA ficou vermelho. Este
// arquivo é o que impede a repetição: para cada tipo do `ArtifactType` existe
// destino declarado; quem é emitível de FATO tem montador; quem é de ESCOLHA tem
// validador; quem está fora do motor tem motivo escrito.
//
// E a parte que importa de verdade: o card de FATO sai com o número da CARTA
// REAL injetada — nunca com o número que o modelo mandou no payload.
import { describe, expect, it } from "vitest";
import type { GroupSummary, QuotaSimulation } from "@/lib/adapters/types";
import { CARDS_QUE_REVELAM_OFERTA } from "@/lib/chat/desbloqueio-do-telefone";
import type { ArtifactType } from "@/lib/chat/types";
import { DEFAULT_FINANCING_RATES } from "@/lib/finance/pmt";
import {
	cardDeEscolha,
	DESTINO_DOS_CARDS,
	MONTADORES_DE_CARD,
	TIPOS_DE_ESCOLHA,
	type TipoDeFato,
	type TipoEmitivel,
} from "./cards-livres";
import { buildToolsLivres, type ContextoDasTools, type DepsDasToolsLivres } from "./tools-livres";

/** A carta REAL do turno — o teste injeta, ninguém chama a Bevi. */
const CARTA: GroupSummary = {
	id: "grupo-real-1",
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

const SIMULACAO: QuotaSimulation = {
	groupId: CARTA.id,
	category: "auto",
	creditValue: 80_000,
	monthlyPayment: 1_234.56,
	adminFee: 13_600,
	reserveFund: 800,
	insurance: 640,
	totalCost: 118_518,
	termMonths: 96,
	effectiveRate: 0.481,
	lanceScenario: { lancePercent: 30, expectedTermMonths: 44 },
	embeddedBid: {
		percent: 30,
		embeddedBidValue: 24_000,
		receivedCredit: 56_000,
		necessaryBidToContemplate: 19_800,
	},
	expectedAdjustment: { index: "IPCA", annualPercent: 4.5 },
};

const LOGOS = new Map<string, string>([["canopus", "https://logos.example/canopus.png"]]);

function ctxComCarta(over: Partial<ContextoDasTools> = {}): ContextoDasTools {
	return {
		conversationId: "conv-prova",
		channel: "web",
		userText: null,
		nomeDoCliente: "Marina",
		telefoneMascarado: "(11) 9...-4321",
		cpfMascarado: "529.•••.•••-25",
		cards: [],
		falasDoFecho: [],
		cartasNaTela: [],
		gruposRevelados: new Map([[CARTA.id, CARTA]]),
		pediuHumano: false,
		estadoDepoisDaBusca: { categoria: "auto", creditMax: 80_000, valorDoBemAlvo: 80_000 },
		...over,
	};
}

type ToolChamavel = { execute: (input: unknown, opts: unknown) => Promise<unknown> };

/** Chama `buscar_cartas` do jeito que o pi chama, com a Bevi injetada. */
async function buscarCartas(
	ctx: ContextoDasTools,
	buscarGrupos: DepsDasToolsLivres["buscarGrupos"],
	args: Record<string, unknown>,
): Promise<string> {
	const tools = buildToolsLivres(ctx, {
		buscarGrupos,
		carregarLogos: async () => LOGOS,
	}) as unknown as Record<string, ToolChamavel>;
	const saida = await tools.buscar_cartas.execute(args, { toolCallId: "call-busca", messages: [] });
	return typeof saida === "string" ? saida : JSON.stringify(saida);
}

/** Chama `mostrar_card` do jeito que o pi chama. */
async function mostrarCard(
	ctx: ContextoDasTools,
	tipo: string,
	payload?: Record<string, unknown>,
): Promise<string> {
	const tools = buildToolsLivres(ctx, {
		simularCota: async () => SIMULACAO,
		carregarLogos: async () => LOGOS,
	}) as unknown as Record<string, ToolChamavel>;
	const saida = await tools.mostrar_card.execute(
		{ tipo, payload },
		{ toolCallId: "call-1", messages: [] },
	);
	return typeof saida === "string" ? saida : JSON.stringify(saida);
}

type Payload = Record<string, unknown>;

/** Um payload VÁLIDO por tipo de escolha. A prova exige `ok: true` com ele: se o
 * validador do tipo sumir, `recusaDeTipo` devolve `ok: false` e o assert morde
 * (com payload vazio os dois caminhos devolviam `false` — nada ficava vermelho). */
const PAYLOAD_VALIDO_DE_ESCOLHA: Record<string, Payload> = {
	quick_reply: { options: [{ label: "Sim, quero" }] },
	value_picker: {
		category: "auto",
		fields: [
			{ id: "valor-do-bem", label: "Até 80 mil", min: 10_000, max: 80_000, default: 50_000 },
		],
	},
	topic_picker: { topics: ["Prazo"], includeBackButton: true },
};

function payloadDoCard(ctx: ContextoDasTools, indice = 0): Payload {
	const card = ctx.cards[indice];
	if (!card) throw new Error(`nenhum card na tela (esperava pelo menos ${indice + 1})`);
	return card.payload;
}

function tipoDoCard(ctx: ContextoDasTools, indice = 0): ArtifactType | undefined {
	return ctx.cards[indice]?.type;
}

describe("os 22 tipos têm destino, e cada destino tem como ser cumprido", () => {
	it("imprime a contagem da prova (é ela que vai para o diário do chefe)", () => {
		const tipos = Object.keys(DESTINO_DOS_CARDS);
		const emitiveis = tipos.filter(
			(tipo) => DESTINO_DOS_CARDS[tipo as ArtifactType].classe === "emitivel",
		);
		const foraDoMotor = tipos.filter(
			(tipo) => DESTINO_DOS_CARDS[tipo as ArtifactType].classe === "fora-do-motor",
		);

		console.log(
			`prova de card: ${tipos.length} tipos · ${emitiveis.length} emitíveis · ${foraDoMotor.length} fora-do-motor`,
		);
		expect(tipos).toHaveLength(22);
		expect(emitiveis).toHaveLength(18);
		expect(foraDoMotor).toHaveLength(4);
	});

	it("todo tipo tem destino declarado, e fora-do-motor explica o motivo (20+ caracteres)", () => {
		for (const [tipo, destino] of Object.entries(DESTINO_DOS_CARDS)) {
			expect(destino.classe.length, `${tipo} sem classe`).toBeGreaterThan(0);
			if (destino.classe !== "fora-do-motor") continue;
			expect(destino.motivo.trim().length, `${tipo}: motivo curto demais`).toBeGreaterThanOrEqual(
				20,
			);
		}
	});

	it("todo emitível tem caminho: FATO tem montador, ESCOLHA tem validador", () => {
		for (const [tipo, destino] of Object.entries(DESTINO_DOS_CARDS)) {
			if (destino.classe !== "emitivel") continue;
			if (destino.origem === "fato") {
				expect(typeof MONTADORES_DE_CARD[tipo as TipoDeFato], `${tipo} sem montador`).toBe(
					"function",
				);
				continue;
			}
			expect(TIPOS_DE_ESCOLHA as readonly string[], `${tipo} não é de escolha`).toContain(tipo);
			// E o validador do caminho existe de verdade para ele: um payload VÁLIDO
			// tem que passar. Sem isto, sumir com o validador do tipo caía em
			// `recusaDeTipo` e o assert antigo (payload vazio → `false`) seguia verde.
			const payloadValido = PAYLOAD_VALIDO_DE_ESCOLHA[tipo];
			expect(payloadValido, `${tipo} sem payload válido na prova`).toBeDefined();
			expect(
				cardDeEscolha(tipo, payloadValido).ok,
				`${tipo} recusou um payload válido (o validador do tipo sumiu?)`,
			).toBe(true);
		}
	});
});

describe("o card de FATO sai com o número da CARTA REAL", () => {
	it("group_card: carta, parcela e prazo são os do grupo injetado", async () => {
		const ctx = ctxComCarta();
		await mostrarCard(ctx, "group_card", { groupId: CARTA.id });

		expect(tipoDoCard(ctx)).toBe("group_card");
		const payload = payloadDoCard(ctx);
		expect(payload.creditValue).toBe(CARTA.creditValue);
		expect(payload.monthlyPayment).toBe(CARTA.monthlyPayment);
		expect(payload.termMonths).toBe(CARTA.termMonths);
	});

	it("group_card: a categoria é a do GRUPO injetado (imóvel não vira selo de automóvel)", async () => {
		const imovel: GroupSummary = { ...CARTA, id: "grupo-real-imovel", category: "imovel" };
		const ctx = ctxComCarta({ gruposRevelados: new Map([[imovel.id, imovel]]) });
		await mostrarCard(ctx, "group_card", { groupId: imovel.id });

		const payload = payloadDoCard(ctx);
		expect(payload.category).toBe("imovel");
		expect(payload.category).not.toBe(CARTA.category);
	});

	it("recommendation_card: idem, mais o logo cadastrado da administradora", async () => {
		const ctx = ctxComCarta();
		await mostrarCard(ctx, "recommendation_card", { groupId: CARTA.id });

		expect(tipoDoCard(ctx)).toBe("recommendation_card");
		const payload = payloadDoCard(ctx);
		expect(payload.creditValue).toBe(CARTA.creditValue);
		expect(payload.monthlyPayment).toBe(CARTA.monthlyPayment);
		expect(payload.termMonths).toBe(CARTA.termMonths);
		// O logo nunca vem do modelo: sai do cadastro (mapa injetado ou asset local).
		expect(typeof payload.logoUrl).toBe("string");
		expect(String(payload.logoUrl).length).toBeGreaterThan(0);
	});

	it("two_paths: a parcela é a da carta, não a que o modelo digitou", async () => {
		const ctx = ctxComCarta();
		await mostrarCard(ctx, "two_paths", { groupId: CARTA.id, monthlyPayment: 99 });

		const payload = payloadDoCard(ctx);
		expect(payload.monthlyPayment).toBe(CARTA.monthlyPayment);
		expect(payload.administradora).toBe(CARTA.administradora);
		expect(String(payload.disclaimer).length).toBeGreaterThan(20);
		expect(JSON.stringify(payload)).not.toContain("99");
	});

	it("scarcity: ancorada no grupo real, vagas 1-6 determinísticas (1 = nunca é 0)", async () => {
		const ctx = ctxComCarta();
		await mostrarCard(ctx, "scarcity", { groupId: CARTA.id });
		const primeira = payloadDoCard(ctx);

		const outro = ctxComCarta();
		await mostrarCard(outro, "scarcity", { groupId: CARTA.id });
		const segunda = payloadDoCard(outro);

		expect(primeira.groupCode).toBe("70035");
		expect(primeira.administradora).toBe(CARTA.administradora);
		const vagas = Number(primeira.availableSlots);
		expect(Number.isInteger(vagas)).toBe(true);
		expect(vagas).toBeGreaterThanOrEqual(1);
		expect(vagas).toBeLessThanOrEqual(6);
		// Determinístico: o mesmo grupo não muda de número entre renderizações.
		expect(segunda.availableSlots).toBe(primeira.availableSlots);
	});

	// A CARTA TEM QUE COMPRAR O BEM (print do dono, 27/10 15:32): com o bem de 80 mil, uma
	// carta de 80 mil com 30% de embutido deixa 56 mil e NÃO compra nada — o card é recusado.
	it("embedded_bid: carta igual ao bem é recusada, com a conta e a busca certa", async () => {
		const ctx = ctxComCarta();
		const saida = await mostrarCard(ctx, "embedded_bid", {
			groupId: CARTA.id,
			lancePercent: 30,
		});
		expect(ctx.cards).toHaveLength(0);
		expect(saida).toContain("não compra o bem");
		expect(saida).toContain("usaraLanceEmbutido: true");
	});

	it("embedded_bid: na carta que sobra o bem, o embutido sai da carta real e a carta necessária é valorDoBem / (1 - pct)", async () => {
		const grande = { ...CARTA, id: "grupo-grande", creditValue: 120_000 };
		const ctx = ctxComCarta({ gruposRevelados: new Map([[grande.id, grande]]) });
		await mostrarCard(ctx, "embedded_bid", { groupId: grande.id, lancePercent: 30 });

		const payload = payloadDoCard(ctx);
		expect(payload.creditValue).toBe(120_000);
		expect(payload.maxEmbutidoPct).toBe(30);
		expect(payload.embeddedBidValue).toBe(36_000);
		expect(payload.netCredit).toBe(84_000);
		expect(payload.cartaNecessaria).toBe(Math.round(80_000 / (1 - 0.3)));
	});

	it("embedded_bid: lancePercent absurdo (99) cai no teto de sanidade, não em 99% da carta", async () => {
		const grande = { ...CARTA, id: "grupo-grande", creditValue: 120_000 };
		const ctx = ctxComCarta({ gruposRevelados: new Map([[grande.id, grande]]) });
		await mostrarCard(ctx, "embedded_bid", { groupId: grande.id, lancePercent: 99 });

		const payload = payloadDoCard(ctx);
		expect(payload.maxEmbutidoPct).toBe(30);
		expect(payload.embeddedBidValue).toBe(36_000);
		expect(payload.netCredit).toBe(84_000);
	});

	it("contemplation_dial: carta/parcela/prazo da oferta, mês-alvo dentro do prazo real", async () => {
		const ctx = ctxComCarta();
		await mostrarCard(ctx, "contemplation_dial", {
			groupId: CARTA.id,
			initialTargetMonth: 500,
		});

		const payload = payloadDoCard(ctx);
		expect(payload.creditValue).toBe(CARTA.creditValue);
		expect(payload.monthlyPayment).toBe(CARTA.monthlyPayment);
		expect(payload.termMonths).toBe(CARTA.termMonths);
		// 500 é what-if absurdo: o dial nunca passa do prazo REAL da carta.
		expect(payload.initialTargetMonth).toBe(CARTA.termMonths);
	});

	it("contemplation_dial: o prazo e o lance DECLARADOS na qualificação são o default", async () => {
		const ctx = ctxComCarta({ perfilDeclarado: { prazoMeses: 48, lanceValue: 5_000 } });
		await mostrarCard(ctx, "contemplation_dial", { groupId: CARTA.id });

		const payload = payloadDoCard(ctx);
		// Sem o perfil declarado o dial caía no fallback de 6 meses e o lance sumia.
		expect(payload.initialTargetMonth).toBe(48);
		expect(payload.declaredLanceValue).toBe(5_000);
	});

	it("financing_comparison: consórcio com a parcela da carta e taxa de DEFAULT_FINANCING_RATES", async () => {
		const ctx = ctxComCarta();
		await mostrarCard(ctx, "financing_comparison", { groupId: CARTA.id });

		const payload = payloadDoCard(ctx);
		const consorcio = payload.consorcio as { monthlyPayment: number };
		const financiamento = payload.financing as { annualRate: number };
		expect(consorcio.monthlyPayment).toBe(CARTA.monthlyPayment);
		expect(financiamento.annualRate).toBe(DEFAULT_FINANCING_RATES[CARTA.category]);
		expect(Number(payload.creditValue)).toBe(CARTA.creditValue);
		expect(Number(payload.termMonths)).toBe(CARTA.termMonths);
	});

	it("simulation_result: os números são os da QuotaSimulation devolvida pela simulação", async () => {
		const ctx = ctxComCarta();
		await mostrarCard(ctx, "simulation_result", { groupId: CARTA.id });

		expect(tipoDoCard(ctx)).toBe("simulation_result");
		const payload = payloadDoCard(ctx);
		expect(payload.groupId).toBe(CARTA.id);
		expect(payload.administradora).toBe(CARTA.administradora);
		expect(payload.creditValue).toBe(SIMULACAO.creditValue);
		expect(payload.monthlyPayment).toBe(SIMULACAO.monthlyPayment);
		expect(payload.totalCost).toBe(SIMULACAO.totalCost);
		expect(payload.termMonths).toBe(SIMULACAO.termMonths);
		expect(payload.effectiveRate).toBe(SIMULACAO.effectiveRate);
		const lance = payload.lanceScenario as { lancePercent: number };
		expect(lance.lancePercent).toBe(SIMULACAO.lanceScenario.lancePercent);
	});

	it("comparison_table: sai com as cartas reais que estão na tela", async () => {
		const ctx = ctxComCarta();
		await mostrarCard(ctx, "comparison_table", {});

		const payload = payloadDoCard(ctx);
		const grupos = payload.groups as Array<{ id?: string; creditValue?: number }>;
		expect(grupos).toHaveLength(1);
		expect(grupos[0]?.id).toBe(CARTA.id);
		expect(grupos[0]?.creditValue).toBe(CARTA.creditValue);
	});
});

describe("o card de FATO sai do ESTADO (formulários e decisão)", () => {
	it("lead_form: conversationId da conversa e nome já capturado", async () => {
		const ctx = ctxComCarta();
		await mostrarCard(ctx, "lead_form", {});

		const payload = payloadDoCard(ctx);
		expect(payload.conversationId).toBe(ctx.conversationId);
		expect(payload.prefilledName).toBe("Marina");
	});

	it("contract_form: CPF só MASCARADO e identidade sinalizada", async () => {
		const ctx = ctxComCarta();
		await mostrarCard(ctx, "contract_form", { groupId: CARTA.id });

		const payload = payloadDoCard(ctx);
		expect(payload.conversationId).toBe(ctx.conversationId);
		expect(payload.administradora).toBe(CARTA.administradora);
		expect(payload.identityOnFile).toBe(true);
		expect(payload.prefilledCpfMasked).toBe("529.•••.•••-25");
		// O número do CPF não aparece em lugar nenhum do card.
		expect(JSON.stringify(payload)).not.toContain("52998224725");
	});

	it("whatsapp_optin: telefone MASCARADO da conversa", async () => {
		const ctx = ctxComCarta();
		await mostrarCard(ctx, "whatsapp_optin", {});

		const payload = payloadDoCard(ctx);
		expect(payload.conversationId).toBe(ctx.conversationId);
		expect(payload.knownPhone).toBe("(11) 9...-4321");
	});

	it("decision_prompt: a administradora é a da carta real", async () => {
		const ctx = ctxComCarta();
		await mostrarCard(ctx, "decision_prompt", { groupId: CARTA.id });

		const payload = payloadDoCard(ctx);
		expect(payload.administradora).toBe(CARTA.administradora);
	});
});

describe("sem carta real, nenhum card de FATO sai", () => {
	it("scarcity numa conversa sem busca devolve recusa e NÃO empurra card", async () => {
		const ctx = ctxComCarta({
			gruposRevelados: new Map(),
			estadoDepoisDaBusca: null,
		});
		const texto = await mostrarCard(ctx, "scarcity");

		expect(ctx.cards).toHaveLength(0);
		expect(texto).toContain("NÃO");
		// A recusa ensina o caminho em vez de só negar.
		expect(texto).toContain("buscar_cartas");
	});

	it("id que não está na tela é recusado — o card não inventa carta", async () => {
		const ctx = ctxComCarta();
		const texto = await mostrarCard(ctx, "group_card", { groupId: "grupo-que-nao-existe" });

		expect(ctx.cards).toHaveLength(0);
		expect(texto).toContain("NÃO");
	});

	it("duas cartas na tela e nenhum groupId: o card pergunta qual, não escolhe sozinho", async () => {
		const outra: GroupSummary = { ...CARTA, id: "grupo-real-2", creditValue: 120_000 };
		const ctx = ctxComCarta({
			gruposRevelados: new Map([
				[CARTA.id, CARTA],
				[outra.id, outra],
			]),
		});
		const texto = await mostrarCard(ctx, "group_card", {});

		expect(ctx.cards).toHaveLength(0);
		expect(texto).toContain("grupo-real-1");
		expect(texto).toContain("grupo-real-2");
	});
});

describe("número do modelo não vaza para o card", () => {
	it("creditValue 999999 no payload é ignorado: vale a carta injetada", async () => {
		const ctx = ctxComCarta();
		await mostrarCard(ctx, "group_card", {
			groupId: CARTA.id,
			creditValue: 999_999,
			monthlyPayment: 1,
			termMonths: 1,
		});

		const payload = payloadDoCard(ctx);
		expect(payload.creditValue).toBe(CARTA.creditValue);
		expect(payload.monthlyPayment).toBe(CARTA.monthlyPayment);
		expect(JSON.stringify(payload)).not.toContain("999999");
		expect(JSON.stringify(payload)).not.toContain("999.999");
	});
});

describe("duas buscas no mesmo turno não apagam a primeira", () => {
	it("o id da PRIMEIRA busca continua valendo para os cards de FATO", async () => {
		const outra: GroupSummary = {
			...CARTA,
			id: "grupo-real-2",
			creditValue: 150_000,
			monthlyPayment: 2_100,
		};
		const ctx = ctxComCarta({ gruposRevelados: new Map(), estadoDepoisDaBusca: null, cards: [] });

		await buscarCartas(ctx, async () => [CARTA], { categoria: "auto" });
		await buscarCartas(ctx, async () => [outra], { categoria: "auto", valorDoBem: 150_000 });

		// O índice SOMA: a primeira tabela comparativa continua na tela do cliente.
		expect([...ctx.gruposRevelados.keys()].sort()).toEqual([CARTA.id, outra.id].sort());

		const antes = ctx.cards.length;
		const texto = await mostrarCard(ctx, "group_card", { groupId: CARTA.id });

		expect(texto).not.toContain("NÃO");
		expect(ctx.cards).toHaveLength(antes + 1);
		expect(ctx.cards[antes]?.type).toBe("group_card");
		expect(ctx.cards[antes]?.payload.creditValue).toBe(CARTA.creditValue);
	});
});

describe("CARDS_QUE_REVELAM_OFERTA — todo card com número de oferta está no set", () => {
	/** Os de ESTADO não revelam oferta: são formulário/decisão, e em nenhum deles
	 * há carta, parcela, prazo ou lance para embaçar. */
	const CARDS_DE_ESTADO: ArtifactType[] = [
		"lead_form",
		"contract_form",
		"whatsapp_optin",
		"decision_prompt",
	];

	/** Derivado do PRÓPRIO mapa de destinos (todo emitível de FATO menos os de
	 * estado) — lista à mão deixava um card novo com número de oferta passar no
	 * teste sem estar no set que o experimento do telefone usa. */
	const CARREGAM_NUMERO_DE_OFERTA: ArtifactType[] = (
		Object.keys(DESTINO_DOS_CARDS) as ArtifactType[]
	).filter((tipo) => {
		const destino = DESTINO_DOS_CARDS[tipo];
		if (destino.classe !== "emitivel" || destino.origem !== "fato") return false;
		return !CARDS_DE_ESTADO.includes(tipo);
	});

	it.each(CARREGAM_NUMERO_DE_OFERTA)("%s está em CARDS_QUE_REVELAM_OFERTA", (tipo) => {
		expect(CARDS_QUE_REVELAM_OFERTA.has(tipo)).toBe(true);
	});

	it("o set do experimento não tem card sem número de oferta", () => {
		for (const tipo of CARDS_QUE_REVELAM_OFERTA) {
			expect(
				CARREGAM_NUMERO_DE_OFERTA,
				`${tipo} está no set sem carregar número de oferta`,
			).toContain(tipo);
		}
	});

	it("os montadores cobrem exatamente os emitíveis de FATO", () => {
		const deFato = (Object.keys(DESTINO_DOS_CARDS) as ArtifactType[]).filter((tipo) => {
			const destino = DESTINO_DOS_CARDS[tipo];
			return destino.classe === "emitivel" && destino.origem === "fato";
		});
		expect([...Object.keys(MONTADORES_DE_CARD)].sort()).toEqual([...deFato].sort());
		// E o tipo derivado do mapa não mente sobre o tamanho.
		const emitiveis: TipoEmitivel[] = deFato as TipoEmitivel[];
		expect(emitiveis).toHaveLength(15);
	});
});
