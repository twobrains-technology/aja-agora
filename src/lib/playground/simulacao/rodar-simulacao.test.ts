import { describe, expect, it, vi } from "vitest";
import { perfilPorId } from "./perfis-de-cliente";
import {
	corpoDoChat,
	type DepsDaSimulacao,
	type OpcoesDaSimulacao,
	PADRAO_DO_SERVIDOR,
	rodarSimulacao,
	rodarTodos,
} from "./rodar-simulacao";
import type { DadosDaSimulacao, RespostaDeFalaDoCliente } from "./tipos";

const CONV = "11111111-1111-4111-8111-111111111111";

function ndjson(linhas: Record<string, unknown>[], status = 200): Response {
	return new Response(linhas.map((l) => JSON.stringify(l)).join("\n"), { status });
}

function turnoSimples(texto: string, extra: Record<string, unknown>[] = [], eco?: unknown) {
	return ndjson([
		{ type: "inicio", conversationId: CONV, ...(eco ? { dados: eco } : {}) },
		{ type: "evento", evento: { type: "text-delta", text: texto } },
		...extra,
		{ type: "final", conversationId: CONV, baloes: [{ texto }] },
	]);
}

const propostaEventos = [
	{
		type: "evento",
		evento: { type: "tool-call", toolName: "fazer_proposta", input: {}, toolCallId: "t1" },
	},
	{
		type: "evento",
		evento: { type: "artifact", artifactType: "real_offer", payload: {}, toolCallId: "t1" },
	},
];

function opcoes(id: Parameters<typeof perfilPorId>[0], extra: Partial<OpcoesDaSimulacao> = {}) {
	const perfil = perfilPorId(id);
	return { perfil, dados: perfil.dados, modo: "antes", ...extra } as OpcoesDaSimulacao;
}

function deps(
	chat: (corpo: Record<string, unknown>) => Response,
	fala: (turno: number) => RespostaDeFalaDoCliente = () => ({
		texto: "ok",
		estado: "continua",
		origem: "ia",
	}),
): DepsDaSimulacao {
	return {
		chamarChat: vi.fn(async (c) => chat(c)),
		falaDoCliente: vi.fn(async (p) => fala(p.turno)),
	};
}

describe("rodarSimulacao", () => {
	it("caminho feliz até a proposta: objetivo-atingido e APROVADO", async () => {
		let n = 0;
		const d = deps(() =>
			++n === 2
				? turnoSimples("Proposta pronta.", propostaEventos)
				: turnoSimples("Conta mais sobre o que você procura."),
		);
		const r = await rodarSimulacao(opcoes("caminho-feliz"), d);
		expect(r.parada).toBe("objetivo-atingido");
		expect(r.marcacoes.filter((m) => m.status === "ACIONADA" && m.gravidade === "DEFEITO")).toEqual(
			[],
		);
		expect(r.veredito).toBe("APROVADO");
		expect(r.turnos).toHaveLength(2);
	});

	it("estoura maxTurnos: limite-de-turnos", async () => {
		const perfil = { ...perfilPorId("explorador"), maxTurnos: 3 };
		const d = deps(() => turnoSimples("Posso te ajudar."));
		const r = await rodarSimulacao(opcoes("explorador", { perfil }), d);
		expect(r.parada).toBe("limite-de-turnos");
		expect(r.turnos).toHaveLength(3);
	});

	it("HTTP 500: erro-do-vendedor; turno-sem-resposta (DEFEITO) vence o veredito do relatorio.ts", async () => {
		const d = deps(() => new Response("x", { status: 500 }));
		const r = await rodarSimulacao(opcoes("caminho-feliz"), d);
		expect(r.parada).toBe("erro-do-vendedor");
		expect(r.marcacoes.find((m) => m.id === "turno-sem-resposta")?.status).toBe("ACIONADA");
		expect(r.veredito).toBe("REPROVADO");
	});

	it("AbortSignal: cancelado", async () => {
		const ac = new AbortController();
		const d = deps(() => {
			ac.abort();
			return turnoSimples("Oi.");
		});
		const r = await rodarSimulacao(opcoes("caminho-feliz", { sinal: ac.signal }), d);
		expect(r.parada).toBe("cancelado");
		expect(r.veredito).toBe("INCONCLUSIVO");
	});

	it("roteiro do nervoso-bugado manda a mesma frase 3 vezes", async () => {
		const d = deps(() => turnoSimples("Já te mostro."));
		const r = await rodarSimulacao(opcoes("nervoso-bugado"), d);
		const frases = r.turnos.filter((t) => t.cliente.origem === "roteiro");
		expect(frases).toHaveLength(3);
		expect(new Set(frases.map((t) => t.cliente.texto)).size).toBe(1);
		expect(frases.map((t) => t.indice)).toEqual([3, 4, 5]);
	});

	it("IA-cliente que desiste ou atinge o objetivo para a rodada", async () => {
		const d = deps(
			() => turnoSimples("Oi."),
			(t) => ({ texto: "tchau", estado: t === 1 ? "desiste" : "continua", origem: "ia" }),
		);
		const r = await rodarSimulacao(opcoes("objecao"), d);
		expect(r.parada).toBe("desistencia");
	});

	it("conversa nova no primeiro turno e mesma conversationId depois", async () => {
		const corpos: Record<string, unknown>[] = [];
		const perfil = { ...perfilPorId("explorador"), maxTurnos: 2 };
		const d = deps((c) => {
			corpos.push(c);
			return turnoSimples("Oi.");
		});
		await rodarSimulacao(opcoes("explorador", { perfil }), d);
		expect(corpos[0].conversationId).toBeUndefined();
		expect(corpos[1].conversationId).toBe(CONV);
	});

	it("sem eco do servidor não usa numerosConhecidos e numero-sem-ferramenta é NAO_APLICAVEL", async () => {
		const perfil = { ...perfilPorId("explorador"), maxTurnos: 1 };
		const numeros = vi.fn(() => [1]);
		const d = { ...deps(() => turnoSimples("Oi.")), numerosConhecidos: numeros };
		const r = await rodarSimulacao(opcoes("explorador", { perfil }), d);
		expect(numeros).not.toHaveBeenCalled();
		expect(r.marcacoes.find((m) => m.id === "numero-sem-ferramenta")?.status).toBe("NAO_APLICAVEL");
		expect(r.achados.some((a) => a.includes("NÃO CONFIRMADOS PELO SERVIDOR"))).toBe(true);
		expect(r.achados.some((a) => a.includes("turno-livre.ts:1808"))).toBe(true);
	});

	it("com eco do dublê, usa numerosConhecidos do catálogo ecoado", async () => {
		const perfil = { ...perfilPorId("explorador"), maxTurnos: 1 };
		const numeros = vi.fn(() => [1]);
		const eco = { fonteDeDados: "duble", catalogo: "grande", fila: { atendentes: 2 } };
		const d = { ...deps(() => turnoSimples("Oi.", [], eco)), numerosConhecidos: numeros };
		await rodarSimulacao(opcoes("explorador", { perfil }), d);
		expect(numeros).toHaveBeenCalledWith("grande");
	});

	it("aoEstado passa por Em andamento e termina Concluído", async () => {
		const estados: string[] = [];
		const perfil = { ...perfilPorId("explorador"), maxTurnos: 1 };
		await rodarSimulacao(
			opcoes("explorador", { perfil, aoEstado: (e) => estados.push(e) }),
			deps(() => turnoSimples("Oi.")),
		);
		expect(estados).toEqual(["EM_ANDAMENTO", "CONCLUIDO"]);
	});
});

describe("corpoDoChat", () => {
	it("não envia dados quando são o padrão do servidor", () => {
		const c = corpoDoChat(opcoes("caminho-feliz", { dados: PADRAO_DO_SERVIDOR }), null, "oi");
		expect(c).toEqual({ modo: "antes", mensagem: "oi" });
	});

	it("modo depois sem perfil do playground cai para antes", () => {
		const c = corpoDoChat(
			opcoes("caminho-feliz", { dados: PADRAO_DO_SERVIDOR, modo: "depois" }),
			null,
			"oi",
		);
		expect(c.modo).toBe("antes");
		expect(c.perfilId).toBeUndefined();
	});

	it("modo depois com perfil do playground fica depois", () => {
		const c = corpoDoChat(
			opcoes("caminho-feliz", { modo: "depois", perfilDoPlaygroundId: "p1" }),
			null,
			"oi",
		);
		expect(c.modo).toBe("depois");
		expect(c.perfilId).toBe("p1");
	});

	it("registra em achados a queda de depois para antes", async () => {
		const d: DepsDaSimulacao = {
			chamarChat: vi.fn(async () => turnoSimples("Oi.")),
			falaDoCliente: vi.fn(
				async () => ({ texto: "x", estado: "desiste", origem: "ia" }) as RespostaDeFalaDoCliente,
			),
		};
		const r = await rodarSimulacao(opcoes("caminho-feliz", { modo: "depois" }), d);
		expect(r.modo).toBe("antes");
		expect(r.achados.some((a) => a.includes("MODO: depois sem perfil"))).toBe(true);
	});

	it("envia dublesDaFila quando atendentes = 0", () => {
		const dados: DadosDaSimulacao = {
			...PADRAO_DO_SERVIDOR,
			fila: { atendentes: 0, horaFixa: "03:00" },
		};
		const c = corpoDoChat(opcoes("madrugada-sem-atendente", { dados }), CONV, "oi");
		expect(c.dublesDaFila).toEqual({ atendentes: 0, horaFixa: "03:00" });
		expect(c.conversationId).toBe(CONV);
		expect(c.fonteDeDados).toBeUndefined();
	});

	it("envia fonteDeDados da Bevi da dev e perfil do editor", () => {
		const dados: DadosDaSimulacao = { ...PADRAO_DO_SERVIDOR, fonteDeDados: "bevi-dev" };
		const c = corpoDoChat(
			opcoes("caminho-feliz", { dados, perfilDoPlaygroundId: "p1" }),
			null,
			"oi",
		);
		expect(c.fonteDeDados).toBe("bevi-dev");
		expect(c.perfilId).toBe("p1");
		expect(c.dublesDaFila).toBeUndefined();
	});
});

describe("rodarTodos", () => {
	it("roda em sequência, na ordem dada", async () => {
		const ordem: string[] = [];
		const d: DepsDaSimulacao = {
			chamarChat: vi.fn(async () => turnoSimples("Oi.")),
			falaDoCliente: vi.fn(async (p) => {
				ordem.push(`${p.perfilId}:${p.turno}`);
				return { texto: "x", estado: "desiste", origem: "ia" } as RespostaDeFalaDoCliente;
			}),
		};
		const perfis = ["objecao", "explorador"] as const;
		const rs = await rodarTodos(
			perfis.map((p) => opcoes(p)),
			d,
		);
		expect(rs.map((r) => r.perfilId)).toEqual(["objecao", "explorador"]);
		expect(ordem).toEqual(["objecao:0", "explorador:0"]);
	});
});
