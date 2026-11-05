// D-0083, Bloco A-FIX — âncora do dataset run e paginação robusta. Hermético:
// nada aqui fala com o Langfuse de verdade (fetch é stub). Cobertura: (1) a
// âncora (`aja-anchor-eval` + runName) é a única fonte do id do run — o mesmo
// runName volta o MESMO id (o grouping é por runName global, provado em prod);
// (2) se o item âncora não existe, ele é criado e o POST do item é retentado;
// (3) falha da âncora degrada sem run; (4) paginação dos itens: página cheia
// segue para a próxima, 2ª página HTML vira erro explícito com mapa parcial
// (nunca "mapeou tudo" com menos páginas); (5) o score agregado sobrescreve
// por id determinístico, com a rodada no comentário.
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

const respHtml = () => ({
	ok: true,
	status: 200,
	json: async () => {
		throw new Error("Unexpected token < in JSON");
	},
	text: async () => "<html>gateway</html>",
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

function comCredenciais(): void {
	vi.stubEnv("LANGFUSE_BASE_URL", ENV.LANGFUSE_BASE_URL);
	vi.stubEnv("LANGFUSE_PUBLIC_KEY", ENV.LANGFUSE_PUBLIC_KEY);
	vi.stubEnv("LANGFUSE_SECRET_KEY", ENV.LANGFUSE_SECRET_KEY);
}

const ROTAS_BASE = [
	{ casa: "/api/public/datasets/", metodo: "GET", resposta: () => resp({ id: "ds-1" }) },
];

describe("âncora do dataset run", () => {
	it("mesma âncora + runName → mesmo run id: o id vem do POST /dataset-run-items", async () => {
		comCredenciais();
		const nome = nomeDoRunDeConduta("abcd1234", { versao: 3, texto: "conduta v3" });
		let devolvido = "run-novo";
		const { chamadas } = stubFetch([
			...ROTAS_BASE,
			{
				casa: "/api/public/dataset-run-items",
				metodo: "POST",
				resposta: () => resp({ datasetRunId: devolvido }),
			},
			{ casa: "/api/public/scores", metodo: "POST", resposta: () => resp({ id: "s1" }) },
		]);
		const r1 = await DatasetRunRecorder.iniciar({ nome, sha: "abcd1234" });
		expect(r1).not.toBeNull();
		await r1!.anexar(item, [score]);
		const post = chamadas.find((c) => c.metodo === "POST" && c.url.includes("dataset-run-items"));
		expect((post?.corpo as { datasetItemId?: string }).datasetItemId).toBe("aja-anchor-eval");
		expect((post?.corpo as { runName?: string }).runName).toBe(nome);

		// Segunda execução com o MESMO runName: a instância devolve O MESMO run id
		// (grouping por runName global) — os scores vão para o mesmo run.
		devolvido = "151cc35b2643fbb3";
		const segunda = stubFetch([
			...ROTAS_BASE,
			{
				casa: "/api/public/dataset-run-items",
				metodo: "POST",
				resposta: () => resp({ datasetRunId: devolvido }),
			},
			{ casa: "/api/public/scores", metodo: "POST", resposta: () => resp({ id: "s2" }) },
		]);
		const r2 = await DatasetRunRecorder.iniciar({ nome, sha: "abcd1234" });
		await r2!.anexar(item, [score]);
		const body2 = segunda.chamadas.find((c) => c.metodo === "POST" && c.url.includes("/scores"));
		expect((body2?.corpo as { datasetRunId?: string }).datasetRunId).toBe("151cc35b2643fbb3");
	});

	it("item âncora inexistente: cria o dataset-item e retenta o POST do run-item 1×", async () => {
		comCredenciais();
		const nome = nomeDoRunDeConduta("abcd1234", null);
		let primeiraChamada = true;
		const { chamadas } = stubFetch([
			...ROTAS_BASE,
			{
				casa: "/api/public/dataset-run-items",
				metodo: "POST",
				resposta: () => {
					if (primeiraChamada) {
						primeiraChamada = false;
						return resp({ error: "dataset item not found" }, 404);
					}
					return resp({ datasetRunId: "run-novo" });
				},
			},
			{
				casa: "/api/public/dataset-items",
				metodo: "POST",
				resposta: () => resp({ id: "aja-anchor-eval" }),
			},
		]);
		const r = await DatasetRunRecorder.iniciar({ nome, sha: "abcd1234" });
		expect(r).not.toBeNull();
		const postsRunItem = chamadas.filter(
			(c) => c.metodo === "POST" && c.url.includes("dataset-run-items"),
		);
		expect(postsRunItem).toHaveLength(2);
		const criacao = chamadas.find(
			(c) => c.metodo === "POST" && c.url.includes("/api/public/dataset-items"),
		);
		expect((criacao?.corpo as { id?: string }).id).toBe("aja-anchor-eval");
		expect((criacao?.corpo as { metadata?: { anchor?: boolean } }).metadata?.anchor).toBe(true);
	});

	it("âncora falha nas duas tentativas → degrada sem run (iniciar devolve null)", async () => {
		comCredenciais();
		const nome = nomeDoRunDeConduta("abcd1234", null);
		const { chamadas } = stubFetch([
			...ROTAS_BASE,
			{
				casa: "/api/public/dataset-run-items",
				metodo: "POST",
				resposta: () => resp({ error: "boom" }, 500),
			},
			{
				casa: "/api/public/dataset-items",
				metodo: "POST",
				resposta: () => resp({ id: "aja-anchor-eval" }),
			},
		]);
		const r = await DatasetRunRecorder.iniciar({ nome, sha: "abcd1234" });
		expect(r).toBeNull();
		expect(
			chamadas.filter((c) => c.url.includes("dataset-run-items")).length,
		).toBeGreaterThanOrEqual(2);
	});
});

describe("paginação dos itens (itensPorCenario)", () => {
	it("página cheia segue para a próxima; página HTML (ok:true, não-JSON) vira erro explícito com mapa parcial", async () => {
		comCredenciais();
		const nome = nomeDoRunDeConduta("abcd1234", null);
		let chamadasItens = 0;
		const cheia = Array.from({ length: 50 }, (_, i) => ({
			id: `item-${i}`,
			metadata: { golden: [`golden-cheio-${i}`] },
		}));
		const spyErro = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const { chamadas } = stubFetch([
				...ROTAS_BASE,
				{
					casa: "/api/public/dataset-run-items",
					metodo: "POST",
					resposta: () => resp({ datasetRunId: "run-novo" }),
				},
				{
					casa: "/api/public/dataset-items?",
					metodo: "GET",
					resposta: () => {
						chamadasItens += 1;
						if (chamadasItens <= 2) return resp({ data: cheia, meta: { totalItems: 52 } });
						return respHtml();
					},
				},
			]);
			const r = await DatasetRunRecorder.iniciar({ nome, sha: "abcd1234" });
			expect(r).not.toBeNull();
			// 1ª página cheia → 2ª página cheia → 3ª página: HTML 200 (o bug real
			// da instância) → retenta 1× → HTML de novo → desiste com erro explícito.
			const mapa = await r!.itensPorCenario();
			expect(mapa.size).toBe(50);
			const gets = chamadas.filter((c) => c.metodo === "GET" && c.url.includes("dataset-items?"));
			expect(gets).toHaveLength(4); // 2 páginas cheias + 1 falha + 1 retry
			expect(spyErro.mock.calls.some((c) => String(c[0]).includes("falhou 2×"))).toBe(true);
			expect(spyErro.mock.calls.some((c) => String(c.join(" ")).includes("não-JSON"))).toBe(true);
		} finally {
			spyErro.mockRestore();
		}
	});

	it("falha de rede na página 1 → retenta 1× e devolve mapa vazio com erro explícito (sem lançar)", async () => {
		comCredenciais();
		const nome = nomeDoRunDeConduta("abcd1234", null);
		const spyErro = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			stubFetch([
				...ROTAS_BASE,
				{
					casa: "/api/public/dataset-run-items",
					metodo: "POST",
					resposta: () => resp({ datasetRunId: "run-novo" }),
				},
				{
					casa: "/api/public/dataset-items?",
					metodo: "GET",
					resposta: () => {
						throw new Error("socket hang up");
					},
				},
			]);
			const r = await DatasetRunRecorder.iniciar({ nome, sha: "abcd1234" });
			const mapa = await r!.itensPorCenario();
			expect(mapa.size).toBe(0);
			expect(spyErro.mock.calls.some((c) => String(c[0]).includes("falhou 2×"))).toBe(true);
		} finally {
			spyErro.mockRestore();
		}
	});
});

describe("score agregado", () => {
	it("sobrescreve: id determinístico e rodada no comentário", async () => {
		comCredenciais();
		const nome = nomeDoRunDeConduta("abcd1234", null);
		let totalItems = 0; // quantas rodadas o run já tem (o GET lê, o POST incrementa)
		const { chamadas } = stubFetch([
			...ROTAS_BASE,
			{
				casa: "/api/public/dataset-run-items",
				metodo: "POST",
				resposta: () => resp({ datasetRunId: "run-x" }),
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
