// D-0083, Bloco A — determinismo do dataset run. Hermético: nada aqui fala
// com o Langfuse de verdade (fetch é stub). Cobre a nova premissa do dono
// (Q1): mesmo `runName` → mesmo run id, e o score agregado sobrescreve por id
// determinístico, com a rodada no comentário.
import { afterEach, describe, expect, it, vi } from "vitest";
import { nomeDoRunDeConduta } from "../eval-sha";
import { DatasetRunRecorder, type ItemDoRun, type ScoreDoItem } from "./langfuse-dataset-run";

const ENV = {
	LANGFUSE_BASE_URL: "https://lf.exemplo",
	LANGFUSE_PUBLIC_KEY: "pk-teste",
	LANGFUSE_SECRET_KEY: "sk-teste",
};

const resp = (corpo: unknown, status = 200) => ({
	ok: status >= 200 && status < 300,
	status,
	json: async () => corpo,
	text: async () => JSON.stringify(corpo),
});

type Chamada = { url: string; metodo: string; corpo?: unknown };

/** Roteia chamadas por URL: cada chave casa com `includes(url)`; o handler
 *  devolve a resposta e registra a chamada. */
function stubFetch(rotas: Array<{ casa: string; metodo: string; resposta: () => unknown }>) {
	const chamadas: Chamada[] = [];
	const fn = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
		const metodo = init?.method ?? "GET";
		chamadas.push({ url, metodo, corpo: init?.body ? JSON.parse(init.body) : undefined });
		const rota = rotas.find((r) => url.includes(r.casa) && r.metodo === metodo);
		return rota ? rota.resposta() : resp({ data: [], meta: { totalItems: 0 } }, 404);
	});
	vi.stubGlobal("fetch", fn);
	return { chamadas, fn };
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

const item: ItemDoRun = {
	cenario: "golden-teste",
	status: "pass",
	datasetItemId: "item-1",
	conversationId: "conv-1",
	turns: [{ userMsg: "oi", agentText: "olá", artifacts: [] }],
	propostas: 0,
};

const score: ScoreDoItem = {
	name: "trajetoria_deterministica",
	value: 1,
	dataType: "NUMERIC",
	comment: "ok",
};

describe("determinismo do dataset run", () => {
	it("mesmo runName → mesmo run id: o re-run reusa o run existente (GET antes do POST)", async () => {
		vi.stubEnv("LANGFUSE_BASE_URL", ENV.LANGFUSE_BASE_URL);
		vi.stubEnv("LANGFUSE_PUBLIC_KEY", ENV.LANGFUSE_PUBLIC_KEY);
		vi.stubEnv("LANGFUSE_SECRET_KEY", ENV.LANGFUSE_SECRET_KEY);
		const nome = nomeDoRunDeConduta("abcd1234", { versao: 3, texto: "conduta v3" });

		// Primeira execução: não há run — o POST do item devolve o id.
		let runsNoGet: unknown[] = [];
		const primeira = stubFetch([
			{ casa: "/api/public/datasets/", metodo: "GET", resposta: () => resp({ id: "ds-1" }) },
			{
				casa: "/api/public/dataset-runs?",
				metodo: "GET",
				resposta: () => resp({ data: runsNoGet }),
			},
			{
				casa: "/api/public/dataset-run-items",
				metodo: "POST",
				resposta: () => resp({ datasetRunId: "run-novo" }),
			},
			{ casa: "/api/public/scores", metodo: "POST", resposta: () => resp({ id: "s1" }) },
		]);
		const r1 = await DatasetRunRecorder.iniciar({ nome, sha: "abcd1234" });
		expect(r1).not.toBeNull();
		await r1!.anexar(item, [score]);
		const body1 = primeira.chamadas.find((c) => c.metodo === "POST" && c.url.includes("/scores"));
		expect((body1?.corpo as { datasetRunId?: string }).datasetRunId).toBe("run-novo");

		// Segunda execução com o MESMO nome: o GET agora traz o run — o id dele
		// vence, mesmo que o POST devolvesse outro (prova do reuso).
		runsNoGet = [{ id: "run-novo", name: nome }];
		const segunda = stubFetch([
			{ casa: "/api/public/datasets/", metodo: "GET", resposta: () => resp({ id: "ds-1" }) },
			{
				casa: "/api/public/dataset-runs?",
				metodo: "GET",
				resposta: () => resp({ data: runsNoGet }),
			},
			{
				casa: "/api/public/dataset-run-items",
				metodo: "POST",
				resposta: () => resp({ datasetRunId: "run-errado" }),
			},
			{ casa: "/api/public/scores", metodo: "POST", resposta: () => resp({ id: "s2" }) },
		]);
		const r2 = await DatasetRunRecorder.iniciar({ nome, sha: "abcd1234" });
		await r2!.anexar(item, [score]);
		const body2 = segunda.chamadas.find((c) => c.metodo === "POST" && c.url.includes("/scores"));
		expect((body2?.corpo as { datasetRunId?: string }).datasetRunId).toBe("run-novo");
	});

	it("score agregado sobrescreve: id determinístico e rodada no comentário", async () => {
		vi.stubEnv("LANGFUSE_BASE_URL", ENV.LANGFUSE_BASE_URL);
		vi.stubEnv("LANGFUSE_PUBLIC_KEY", ENV.LANGFUSE_PUBLIC_KEY);
		vi.stubEnv("LANGFUSE_SECRET_KEY", ENV.LANGFUSE_SECRET_KEY);
		const nome = nomeDoRunDeConduta("abcd1234", null);
		let totalItems = 0; // quantas rodadas o run já tem (o GET lê, o POST incrementa)
		const { chamadas } = stubFetch([
			{ casa: "/api/public/datasets/", metodo: "GET", resposta: () => resp({ id: "ds-1" }) },
			{
				casa: "/api/public/dataset-runs?",
				metodo: "GET",
				resposta: () => resp({ data: [{ id: "run-x", name: nome }] }),
			},
			{
				casa: "/api/public/scores?",
				metodo: "GET",
				resposta: () => resp({ data: [], meta: { totalItems } }),
			},
			{
				casa: "/api/public/scores",
				metodo: "POST",
				resposta: () => {
					totalItems += 1;
					return resp({ id: "s1" });
				},
			},
		]);
		const r = await DatasetRunRecorder.iniciar({ nome, sha: "abcd1234" });
		await r!.agregado({
			name: "trajetoria_deterministica",
			value: 0.8,
			dataType: "NUMERIC",
			comment: "Pass rate",
		});
		await r!.agregado({
			name: "trajetoria_deterministica",
			value: 1,
			dataType: "NUMERIC",
			comment: "Pass rate",
		});
		const posts = chamadas.filter(
			(c) =>
				c.metodo === "POST" && typeof (c.corpo as { id?: string } | undefined)?.id === "string",
		);
		expect(posts).toHaveLength(2);
		const [primeiro, segundo] = posts.map((c) => c.corpo as { id: string; comment: string });
		// Mesmo id (upsert — sobrescreve, não duplica) e rodada registrada.
		expect(primeiro.id).toBe(segundo.id);
		expect(primeiro.comment).toBe("Pass rate");
		expect(segundo.comment).toBe("Pass rate · rodada 2");
	});
});

describe("nomeDoRunDeConduta", () => {
	it("mesma conduta → mesmo nome; conduta nova (caixa publicada) → nome novo", () => {
		const base = nomeDoRunDeConduta("abcd1234", null);
		expect(base).toBe("gate-abcd1234");
		expect(nomeDoRunDeConduta("abcd1234", null)).toBe(base);
		const comCaixa = nomeDoRunDeConduta("abcd1234", { versao: 3, texto: "texto da caixa" });
		expect(comCaixa).toMatch(/^gate-abcd1234-c3-[0-9a-f]{8}$/);
		expect(comCaixa).not.toBe(base);
		// Mesmo texto em versão diferente → nome diferente (conduta mudou).
		expect(nomeDoRunDeConduta("abcd1234", { versao: 4, texto: "texto da caixa" })).not.toBe(
			comCaixa,
		);
		// Mesma versão com texto diferente → nome diferente (texto pesa, não só a versão).
		expect(nomeDoRunDeConduta("abcd1234", { versao: 3, texto: "outro texto" })).not.toBe(comCaixa);
	});
});
