// B8 (Q2): a tool `informar_perfil` — o MODELO declara o que o CLIENTE disse.
//
// A NLU em regex do lance sai do turno na onda 2; no lugar dela, o modelo chama
// esta tool com o que o cliente declarou. O servidor valida os limites
// (fail-closed, como as demais tools) e grava em `ctx.perfilInformado`.
//
// Lance ZERO é legítimo: "lance zero" é uma fala possível e real do cliente —
// zero não é recusa, é dado.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	publicarScores: vi.fn(),
}));

vi.mock("@/lib/observability/sinais/publicar", () => ({
	publicarScores: mocks.publicarScores,
}));

vi.mock("@/db", () => ({ db: { query: {}, insert: {}, update: {} } }));

import { buildToolsLivres, type ContextoDasTools, NOMES_DAS_TOOLS_LIVRES } from "./tools-livres";

type ToolChamavel = { execute: (input: unknown, opts: unknown) => Promise<unknown> };

function ctxDoTurno(over: Partial<ContextoDasTools> = {}): ContextoDasTools {
	return {
		conversationId: "conv-informar-perfil",
		channel: "web",
		userText: "quero um carro de 80 mil",
		nomeDoCliente: null,
		cards: [],
		falasDoFecho: [],
		cartasNaTela: [],
		gruposRevelados: new Map(),
		pediuHumano: false,
		estadoDepoisDaBusca: null,
		...over,
	};
}

function informarPerfil(ctx: ContextoDasTools): ToolChamavel {
	const tools = buildToolsLivres(ctx) as unknown as Record<string, ToolChamavel>;
	const tool = tools.informar_perfil;
	if (!tool) throw new Error("a tool informar_perfil não existe");
	return tool;
}
function schemaDe(ctx: ContextoDasTools): { safeParse: (v: unknown) => { success: boolean } } {
	const tools = buildToolsLivres(ctx) as unknown as Record<
		string,
		{ inputSchema: { safeParse: (v: unknown) => { success: boolean } } }
	>;
	return tools.informar_perfil.inputSchema;
}

beforeEach(() => {
	vi.clearAllMocks();
});

async function chamar(ctx: ContextoDasTools, input: Record<string, unknown>): Promise<string> {
	return String(await informarPerfil(ctx).execute(input, { toolCallId: "call-1", messages: [] }));
}

describe("informar_perfil", () => {
	it("grava os campos informados no ctx.perfilInformado e devolve o gravado", async () => {
		const ctx = ctxDoTurno();
		const saida = await chamar(ctx, {
			categoria: "auto",
			valorDoBem: 80_000,
			lanceValue: 5_000,
			prazoMeses: 60,
		});

		expect(ctx.perfilInformado).toEqual({
			categoria: "auto",
			valorDoBem: 80_000,
			lanceValue: 5_000,
			prazoMeses: 60,
		});
		expect(saida).toContain("Perfil gravado");
	});

	it("gravação parcial: campos não informados não são tocados, e chamadas somam", async () => {
		const ctx = ctxDoTurno({ perfilInformado: { lanceValue: 0 } });
		await chamar(ctx, { prazoMeses: 48 });

		expect(ctx.perfilInformado).toEqual({ lanceValue: 0, prazoMeses: 48 });
	});

	it("recusa valorDoBem <= 0 (fail-closed, como as demais tools)", async () => {
		const ctx = ctxDoTurno();
		const schema = schemaDe(ctx);
		expect(schema.safeParse({ valorDoBem: 0 }).success).toBe(false);
		expect(schema.safeParse({ valorDoBem: -100 }).success).toBe(false);

		const resultado = await informarPerfil(ctx).execute(
			{ valorDoBem: -100 },
			{ toolCallId: "call-2", messages: [] },
		);
		expect(String(resultado)).toContain("NÃO gravado");
		expect(ctx.perfilInformado).toBeUndefined();
		expect(mocks.publicarScores).not.toHaveBeenCalled();
	});

	it("recusa prazoMeses fora de 1..480", () => {
		const ctx = ctxDoTurno();
		const schema = schemaDe(ctx);
		expect(schema.safeParse({ prazoMeses: 0 }).success).toBe(false);
		expect(schema.safeParse({ prazoMeses: 481 }).success).toBe(false);
		expect(schema.safeParse({ prazoMeses: 1.5 }).success).toBe(false);
		expect(schema.safeParse({ prazoMeses: 480 }).success).toBe(true);
	});

	it("lanceValue = 0 é aceito — 'lance zero' é valor legítimo", async () => {
		const ctx = ctxDoTurno();
		const saida = await chamar(ctx, { lanceValue: 0 });

		expect(ctx.perfilInformado).toEqual({ lanceValue: 0 });
		expect(saida).toContain("Perfil gravado");
	});

	it("emite o sinal informar_perfil com value = JSON dos campos (dataType CATEGORICAL, onde remendos-fala)", async () => {
		const ctx = ctxDoTurno();
		const gravado = { categoria: "imovel", valorDoBem: 250_000 };
		await chamar(ctx, gravado);

		expect(mocks.publicarScores).toHaveBeenCalledTimes(1);
		const [scores, onde] = mocks.publicarScores.mock.calls[0] as [
			Array<{ name: string; value: string; dataType?: string }>,
			string,
		];
		expect(onde).toBe("remendos-fala");
		expect(scores).toHaveLength(1);
		expect(scores[0].name).toBe("informar_perfil");
		expect(scores[0].dataType).toBe("CATEGORICAL");
		expect(JSON.parse(scores[0].value)).toEqual(gravado);
	});

	it("nada informado não grava nem emite sinal", async () => {
		const ctx = ctxDoTurno();
		await chamar(ctx, {});
		expect(ctx.perfilInformado).toBeUndefined();
		expect(mocks.publicarScores).not.toHaveBeenCalled();
	});

	it("a tool está registrada em NOMES_DAS_TOOLS_LIVRES", () => {
		expect(NOMES_DAS_TOOLS_LIVRES).toContain("informar_perfil");
	});
});
