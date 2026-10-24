// O card de ESCOLHA é payload que o modelo escreve — então é payload que o
// servidor confere. Estes testes mordem: cada recusa some se a validação
// correspondente sair, e o card de fato (número) só sai de tool.
import { describe, expect, it, vi } from "vitest";
import type { ClosingItem } from "@/lib/bevi/closing-presentation";

// Identidade FIXA com CPF em claro: o que este arquivo prova é que o número não
// volta para o modelo em nenhuma fala das tools.
vi.mock("@/lib/conversation/identity", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/conversation/identity")>()),
	loadIdentity: async () => ({ cpf: "52998224725", celular: "" }),
}));

import {
	cardDeEscolha,
	DESTINO_DOS_CARDS,
	MAX_OPCOES_NO_CARD,
	TIPOS_DE_ESCOLHA,
} from "./cards-livres";
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
		expect(r.card.payload.options).toEqual([{ label: "Até 80 mil" }, { label: "Até 120 mil" }]);
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
		const ctx = { ...ctxVazio(), channel: "whatsapp" as const };

		await mostrarCard(ctx, "quick_reply", { options: [{ label: "Sim" }] });
		await mostrarCard(ctx, "topic_picker", { topics: ["Prazo"], includeBackButton: true });

		expect(ctx.cards.map((c) => c.type)).toEqual(["quick_reply", "topic_picker"]);
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
