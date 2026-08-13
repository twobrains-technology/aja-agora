// O `dossie.ts` é o módulo mais complexo da ponte de alerta — e ia executar
// pela primeira vez DURANTE um incidente, sem nenhum teste (auditoria
// 2026-08-13). Um alerta que quebra ao ser montado é pior que alerta nenhum:
// o defeito acontece, o e-mail não sai, e ninguém descobre por quê.
//
// Aqui a API do Langfuse é dublada. O que se testa é o que este módulo decide:
// o que é turno, o que é erro de verdade, de onde vem o canal, e o que fazer
// quando a consulta não responde.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canalDoTurno, montarDossie } from "./dossie";

const ALERTA = {
	monitorId: "mon-1",
	projectId: "proj-1",
	message: { title: "tool_falhou > 0", body: "média 0,33" },
	severity: "ALERT",
	timestamp: "2026-08-13T03:00:00.000Z",
	fromTimestamp: "2026-08-13T02:00:00.000Z",
	toTimestamp: "2026-08-13T03:00:00.000Z",
};

const RAIZ = {
	id: "obs-1",
	traceId: "trace-1",
	name: "turn",
	startTime: "2026-08-13T02:54:01.814Z",
	sessionId: "a68b1945",
	userId: "wa:556292496793",
	input: "Isso mesmo",
	output: "Infelizmente tive um problema na busca.",
	traceName: "turn:whatsapp",
};

function respostaJson(body: unknown) {
	return { ok: true, json: async () => body } as unknown as Response;
}

beforeEach(() => {
	process.env.LANGFUSE_BASE_URL = "https://langfuse.test";
	process.env.LANGFUSE_PUBLIC_KEY = "pk";
	process.env.LANGFUSE_SECRET_KEY = "sk";
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("canal do turno", () => {
	it("sai do nome do trace", () => {
		expect(canalDoTurno({ traceName: "turn:whatsapp" })).toBe("whatsapp");
	});
	it("cai para a tag quando o nome não diz", () => {
		expect(canalDoTurno({ traceName: "turn", tags: ["channel:web", "simulated:false"] })).toBe(
			"web",
		);
	});
	it("sem nenhum dos dois, não inventa", () => {
		expect(canalDoTurno({})).toBe("desconhecido");
	});
});

describe("montagem do dossiê", () => {
	it("sem credencial, devolve dossiê vazio em vez de estourar", async () => {
		process.env.LANGFUSE_SECRET_KEY = "";
		const d = await montarDossie(ALERTA);
		expect(d.turnos).toEqual([]);
		expect(d.alerta).toBe(ALERTA);
	});

	it("monta o turno com fala dos dois lados, tools, scores e link", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				if (url.includes("/v3/scores")) {
					return respostaJson({
						data: [
							{ name: "tool_falhou", value: 1 },
							{ name: "tool_falha_nome", stringValue: "search_groups" },
						],
					});
				}
				if (url.includes("traceId=")) {
					return respostaJson({
						data: [
							{
								id: "o2",
								traceId: "trace-1",
								type: "TOOL",
								name: "simulate_quota",
								startTime: "x",
							},
							{
								id: "o3",
								traceId: "trace-1",
								type: "SPAN",
								name: "human",
								level: "ERROR",
								statusMessage: "GraphInterrupt: aguardando-resposta",
								startTime: "x",
							},
							{
								id: "o4",
								traceId: "trace-1",
								type: "SPAN",
								name: "discovery",
								level: "ERROR",
								statusMessage: "Bevi 500",
								startTime: "x",
							},
						],
					});
				}
				return respostaJson({ data: [RAIZ] });
			}),
		);

		const d = await montarDossie(ALERTA);

		expect(d.turnos).toHaveLength(1);
		const t = d.turnos[0];
		expect(t.entrada).toBe("Isso mesmo");
		expect(t.saida).toContain("problema na busca");
		expect(t.canal).toBe("whatsapp");
		expect(t.toolsChamadas).toEqual(["simulate_quota"]);
		expect(t.toolsQueFalharam).toEqual(["search_groups"]);
		expect(t.url).toContain("trace-1");
		// GraphInterrupt é human-in-the-loop, não defeito: incluí-lo faria o
		// alerta gritar em 100% dos turnos.
		expect(t.erros.join(" ")).not.toContain("GraphInterrupt");
		expect(t.erros.join(" ")).toContain("Bevi 500");
	});

	it("distingue directive do servidor de fala do cliente", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) =>
				respostaJson({
					data:
						url.includes("traceId=") || url.includes("scores")
							? []
							: [{ ...RAIZ, input: "[instrução do sistema — o cliente NÃO vê] FLUXO: ..." }],
				}),
			),
		);
		const d = await montarDossie(ALERTA);
		expect(d.turnos[0].entradaEhDirective).toBe(true);
	});

	it("consulta que falha não derruba o alerta — devolve vazio", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("timeout");
			}),
		);
		const d = await montarDossie(ALERTA);
		expect(d.turnos).toEqual([]);
	});

	// Observation que não é turno (evaluator, span solto) não vira linha do
	// e-mail: o leitor precisa ver conversa, não infraestrutura.
	it("ignora observation que não é turno", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) =>
				respostaJson({
					data:
						url.includes("traceId=") || url.includes("scores")
							? []
							: [{ ...RAIZ, name: "Execute evaluator: judge_tone" }],
				}),
			),
		);
		const d = await montarDossie(ALERTA);
		expect(d.turnos).toEqual([]);
	});
});
