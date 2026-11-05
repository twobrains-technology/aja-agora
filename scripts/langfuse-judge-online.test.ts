// Teste do juiz online (B8) — pontual, ao lado do script.
import { describe, expect, it } from "vitest";
import {
	configuracao,
	ehFalhaDeConexao,
	executar,
	filtroRaiz,
	PROMPT_DO_JUIZ,
	ultimoScore,
} from "./langfuse-judge-online";

const CRED = { baseUrl: "https://lf.test", publicKey: "pk", secretKey: "sk" };
const ENV: Record<string, string> = {
	LANGFUSE_BASE_URL: CRED.baseUrl,
	LANGFUSE_PUBLIC_KEY: CRED.publicKey,
	LANGFUSE_SECRET_KEY: CRED.secretKey,
};

describe("configuração", () => {
	it("sampling padrão é 1 e aceita fração do env", () => {
		expect(configuracao().sampling).toBe(1);
		expect(configuracao({ LANGFUSE_JUDGE_SAMPLING: "0.1" }).sampling).toBe(0.1);
		expect(configuracao({ LANGFUSE_JUDGE_SAMPLING: "5" }).sampling).toBe(1);
		expect(configuracao({ LANGFUSE_JUDGE_SAMPLING: "0" }).sampling).toBeGreaterThan(0);
	});
	it("nome do evaluator vira o nome do score (judge_avancou)", () => {
		expect(configuracao().nome).toBe("judge_avancou");
	});
});

describe("rubrica", () => {
	it("porta as 5 dimensões da rubrica offline", () => {
		for (const d of ["Engajamento", "Discovery", "Continuidade", "Naturalidade", "Assertividade"]) {
			expect(PROMPT_DO_JUIZ).toContain(d);
		}
	});
});

describe("filtro da rule", () => {
	it("ancora na root observation, nunca no trace", () => {
		expect(filtroRaiz()).toEqual([
			{ column: "isRootObservation", type: "boolean", operator: "=", value: true },
		]);
	});
});

describe("falha de LLM Connection", () => {
	it("detecta a preflight e devolve PENDENTE-KAIRO sem criar nada", async () => {
		const chamadas: Array<{ url: string; method?: string }> = [];
		const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
			chamadas.push({ url: String(url), method: init?.method });
			if (String(url).includes("/unstable/evaluators?page=")) {
				return new Response(JSON.stringify({ data: [], meta: { totalPages: 1 } }), { status: 200 });
			}
			return new Response(
				JSON.stringify({
					message: "No valid LLM model found",
					code: "evaluator_preflight_failed",
					details: {},
				}),
				{ status: 422 },
			);
		}) as typeof fetch;
		const r = await executar(ENV, () => undefined, fetchFn);
		expect(r.ok).toBe(false);
		expect(r.pendenteConexao).toContain("PENDENTE-KAIRO");
		expect(r.criados).toEqual([]);
		// Nenhum POST além do tentado, e nenhuma chamada de rule.
		expect(chamadas.filter((c) => c.method === "POST").length).toBe(1);
	});
	it("caminho feliz cria evaluator + rule e lê o último score", async () => {
		const regras: unknown[] = [];
		const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
			const u = String(url);
			const method = init?.method ?? "GET";
			if (u.includes("/unstable/evaluators?page=")) {
				return new Response(
					JSON.stringify({
						data: [{ id: "e1", name: "judge_avancou", scope: "project", version: 1 }],
						meta: { totalPages: 1 },
					}),
					{ status: 200 },
				);
			}
			if (u.includes("/unstable/evaluation-rules?page=")) {
				return new Response(JSON.stringify({ data: regras, meta: { totalPages: 1 } }), {
					status: 200,
				});
			}
			if (method === "POST" && u.endsWith("/unstable/evaluation-rules")) {
				const corpo = JSON.parse(String(init?.body));
				regras.push({ id: "r1", name: corpo.name });
				return new Response(JSON.stringify({ id: "r1" }), { status: 201 });
			}
			if (u.includes("/v3/scores")) {
				return new Response(
					JSON.stringify({
						data: [{ name: "judge_avancou", value: 0.87, timestamp: "2026-11-05T03:00:00.000Z" }],
					}),
					{ status: 200 },
				);
			}
			throw new Error(`chamada inesperada: ${method} ${u}`);
		}) as typeof fetch;
		const r = await executar(ENV, () => undefined, fetchFn);
		expect(r.ok).toBe(true);
		expect(r.sincronizados).toEqual(["evaluator:judge_avancou"]);
		expect(r.criados).toEqual(["rule:judge_avancou"]);
		expect(r.ultimoScore).toContain("0.87");
	});
	it("segunda execução é idempotente: PATCH em vez de POST", async () => {
		const corpo: unknown[] = [{ id: "r1", name: "judge_avancou" }];
		const metodos: string[] = [];
		const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
			const u = String(url);
			const method = init?.method ?? "GET";
			metodos.push(`${method} ${u.replace("https://lf.test", "")}`);
			if (u.includes("/unstable/evaluation-rules?page=")) {
				return new Response(JSON.stringify({ data: corpo, meta: { totalPages: 1 } }), {
					status: 200,
				});
			}
			if (method === "PATCH" && u.includes("/unstable/evaluation-rules/r1")) {
				return new Response(JSON.stringify({ id: "r1" }), { status: 200 });
			}
			if (u.includes("/unstable/evaluators?page=")) {
				return new Response(
					JSON.stringify({
						data: [{ id: "e1", name: "judge_avancou", scope: "project", version: 1 }],
						meta: { totalPages: 1 },
					}),
					{ status: 200 },
				);
			}
			if (u.includes("/v3/scores")) {
				return new Response(JSON.stringify({ data: [] }), { status: 200 });
			}
			throw new Error(`chamada inesperada: ${method} ${u}`);
		}) as typeof fetch;
		const r = await executar(ENV, () => undefined, fetchFn);
		expect(r.ok).toBe(true);
		expect(r.criados).toEqual([]);
		expect(r.sincronizados.sort()).toEqual(["evaluator:judge_avancou", "rule:judge_avancou"]);
		expect(metodos.some((m) => m.startsWith("PATCH"))).toBe(true);
	});
});

describe("ultimoScore", () => {
	it("sem score devolve null (runbook: automação possivelmente morta)", async () => {
		const fetchFn = (async () =>
			new Response(JSON.stringify({ data: [] }), { status: 200 })) as typeof fetch;
		expect(await ultimoScore(fetchFn, CRED, "judge_avancou")).toBeNull();
	});
});

describe("credenciais", () => {
	it("sem credenciais devolve falha clara", async () => {
		const r = await executar({}, () => undefined);
		expect(r.ok).toBe(false);
		expect(r.motivo).toContain("sem credenciais");
	});
});
