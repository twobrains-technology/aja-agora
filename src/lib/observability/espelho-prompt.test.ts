import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import type { ConfigDoLangfuse } from "@/lib/agent/pi/langfuse";

vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
import { espelharCaixaDePrompt, espelharPrompt } from "./espelho-prompt";

const CONFIG: ConfigDoLangfuse = {
	baseUrl: "https://langfuse.example.com/",
	publicKey: "pk",
	secretKey: "sk",
};

function fetchEmSequencia(respostas: Array<{ status: number; body?: unknown }>) {
	const chamadas: Array<{ url: string; init?: RequestInit }> = [];
	const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
		chamadas.push({ url: String(url), init });
		const r = respostas[chamadas.length - 1] ?? { status: 500 };
		return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status });
	});
	vi.stubGlobal("fetch", fetchMock);
	return { chamadas, fetchMock };
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("espelharPrompt", () => {
	const prom = { nome: "aja-system-prompt", versao: 7, texto: "conduta" };

	it("não existindo a versão, cria via POST com label production", async () => {
		const { chamadas, fetchMock } = fetchEmSequencia([{ status: 404 }, { status: 200 }]);
		await expect(espelharPrompt(prom, CONFIG)).resolves.toBe("criado");
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(chamadas[0].url).toBe(
			"https://langfuse.example.com/api/public/v2/prompts/aja-system-prompt?version=7",
		);
		const post = JSON.parse(String(chamadas[1].init?.body));
		expect(post).toEqual({
			name: "aja-system-prompt",
			prompt: "conduta",
			type: "text",
			labels: ["production"],
		});
		// Basic auth com as duas chaves
		expect(chamadas[0].init?.headers).toMatchObject({
			Authorization: `Basic ${Buffer.from("pk:sk").toString("base64")}`,
		});
	});

	it("existindo a versão, só atualiza as labels via PUT — idempotente", async () => {
		const { chamadas, fetchMock } = fetchEmSequencia([{ status: 200 }, { status: 200 }]);
		await expect(espelharPrompt(prom, CONFIG)).resolves.toBe("atualizado");
		expect(chamadas).toHaveLength(2);
		expect(JSON.parse(String(chamadas[1].init?.body))).toEqual({
			name: "aja-system-prompt",
			version: 7,
			newLabels: ["production"],
		});
	});

	it("falha do POST estoura (o chamador decide o que fazer)", async () => {
		fetchEmSequencia([{ status: 404 }, { status: 500 }]);
		await expect(espelharPrompt(prom, CONFIG)).rejects.toThrow(/POST do prompt falhou: HTTP 500/);
	});
});

describe("espelharCaixaDePrompt", () => {
	it("sem envs do Langfuse é no-op: nem consulta o banco, nem chama HTTP", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		await expect(espelharCaixaDePrompt({})).resolves.toBe("desligado");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("com envs, espelha a última versão publicada (label production)", async () => {
		const { chamadas, fetchMock } = fetchEmSequencia([{ status: 404 }, { status: 200 }]);
		const consulta = mockLinhaDaCaixa([{ versao: 9, texto: "conduta viva" }]);
		await expect(espelharCaixaDePrompt(envLigado())).resolves.toBe("espelhado");
		expect(consulta).toHaveBeenCalledOnce();
		expect(chamadas[0].url).toBe(
			"https://langfuse.example.com/api/public/v2/prompts/aja-system-prompt?version=9",
		);
		expect(JSON.parse(String(chamadas[1].init?.body))).toMatchObject({ prompt: "conduta viva" });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("falha do espelho SÓ loga e devolve falhou — nunca estoura", async () => {
		fetchEmSequencia([{ status: 404 }, { status: 500 }]);
		mockLinhaDaCaixa([{ versao: 3, texto: "conduta" }]);
		const erro = vi.spyOn(console, "error").mockImplementation(() => {});
		await expect(espelharCaixaDePrompt(envLigado())).resolves.toBe("falhou");
		expect(erro).toHaveBeenCalledOnce();
	});
});

function envLigado() {
	return {
		LANGFUSE_TRACING_ENABLED: "true",
		LANGFUSE_BASE_URL: "https://langfuse.example.com",
		LANGFUSE_PUBLIC_KEY: "pk",
		LANGFUSE_SECRET_KEY: "sk",
	};
}

/** O builder do drizzle encadeia select().from().where().orderBy().limit(). */
function mockLinhaDaCaixa(linhas: Array<{ versao: number; texto: string }>) {
	const consulta = vi.fn(() => ({
		from: () => ({
			where: () => ({
				orderBy: () => ({ limit: () => Promise.resolve(linhas) }),
			}),
		}),
	}));
	// o vi.mock troca o objeto em runtime; os tipos continuam os do módulo real.
	(db.select as unknown as ReturnType<typeof vi.fn>).mockImplementation(consulta as never);
	return consulta;
}
