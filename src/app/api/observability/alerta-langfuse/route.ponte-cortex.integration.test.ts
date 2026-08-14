// A ponte alerta → e-mail → Cortex, provada INTEIRA.
//
// Por que este teste existe: em 13/08/2026 uma conversa de produção no WhatsApp
// morreu (`fa0533a0-…`: o cliente pediu moto de R$ 20 mil com parcela de R$ 200
// e recebeu grupos de R$ 201 mil) e **nenhuma ocorrência foi aberta no Cortex**.
// A ponte tinha sido entregue no mesmo dia (`b7e93031`) com teste unitário em
// cada peça — assinatura, corpo, leitura da resposta do Cortex — e **nenhum
// teste da rota inteira**. Peça verde e ponte muda é exatamente o buraco que
// deixou o alerta passar despercebido.
//
// O que aqui é invariante (e por isso é código, não juízo de ninguém):
//   • webhook assinado e válido → o Cortex RECEBE `abrir_ocorrencia`;
//   • o Cortex fora do ar NÃO pode calar o e-mail (ordem deliberada da rota);
//   • resposta 200 do Cortex com `erro` embutido NÃO conta como ocorrência
//     aberta — senão o log diz `ocorrencia_aberta: true` para um card que não
//     existe (a pegadinha medida contra o servidor real, ver `cortex.ts`);
//   • sem segredo configurado a rota fecha (503) — e é isso que produção estava
//     fazendo em silêncio.
//
// Sem rede externa: o Langfuse e o Cortex são stubs HTTP locais.
import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { emails } = vi.hoisted(() => ({
	emails: [] as { to: string; subject: string; text?: string }[],
}));

vi.mock("@/lib/email/sendgrid", () => ({
	sendEmail: vi.fn(async (p: { to: string; subject: string; text?: string }) => {
		emails.push(p);
	}),
}));

import { POST } from "./route";

/** Como o stub do Cortex deve responder no caso em teste. */
type ModoCortex = "ok" | "erro-embutido" | "http-500" | "fora-do-ar";

let modoCortex: ModoCortex = "ok";
/** O que o Cortex recebeu — é o que prova que a ocorrência foi mesmo pedida. */
const chamadasCortex: { name: string; args: Record<string, unknown> }[] = [];

let servidor: http.Server;
let baseStub = "";

const SEGREDO = "lf-whsec_teste_da_ponte";
const ENV_ORIGINAL = { ...process.env };

function assinar(corpo: string, segredo = SEGREDO, t = Math.floor(Date.now() / 1000)): string {
	const v1 = crypto.createHmac("sha256", segredo).update(`${t}.${corpo}`, "utf8").digest("hex");
	return `t=${t},v1=${v1}`;
}

function alerta(severity = "ALERT") {
	const agora = new Date();
	const antes = new Date(agora.getTime() - 60 * 60 * 1000);
	return {
		type: "monitor-alert",
		apiVersion: "v1",
		payload: {
			monitorId: "monitor-teste",
			projectId: "projeto-teste",
			permalink: "https://langfuse.test/monitor/1",
			message: {
				title: "Busca contradiz o pedido do cliente",
				body: "3 turnos na última hora buscaram crédito fora do que o cliente pediu.",
			},
			severity,
			timestamp: agora.toISOString(),
			fromTimestamp: antes.toISOString(),
			toTimestamp: agora.toISOString(),
		},
	};
}

function requisicao(corpo: string, header: string | null): NextRequest {
	const headers = new Headers({ "content-type": "application/json" });
	if (header) headers.set("x-langfuse-signature", header);
	return new Request("http://localhost/api/observability/alerta-langfuse", {
		method: "POST",
		headers,
		body: corpo,
	}) as unknown as NextRequest;
}

beforeAll(async () => {
	servidor = http.createServer((req, res) => {
		const url = req.url ?? "";

		// ── Cortex (MCP sobre HTTP) ──────────────────────────────────────────
		if (url.startsWith("/api/mcp")) {
			let cru = "";
			req.on("data", (c) => {
				cru += c;
			});
			req.on("end", () => {
				const body = JSON.parse(cru) as {
					params?: { name?: string; arguments?: Record<string, unknown> };
				};
				chamadasCortex.push({
					name: body.params?.name ?? "",
					args: body.params?.arguments ?? {},
				});
				if (modoCortex === "http-500") {
					res.writeHead(500).end("erro interno");
					return;
				}
				// O caso traiçoeiro medido contra o servidor real: HTTP 200,
				// `isError: false`, e a falha escondida no texto de dentro.
				const texto =
					modoCortex === "erro-embutido"
						? JSON.stringify({ erro: "Projeto 'Ajaagora' não encontrado" })
						: JSON.stringify({ numero: "OC-99" });
				res.writeHead(200, { "content-type": "application/json" }).end(
					JSON.stringify({
						jsonrpc: "2.0",
						id: 1,
						result: { content: [{ type: "text", text: texto }], isError: false },
					}),
				);
			});
			return;
		}

		// ── Langfuse (o dossiê consulta a janela do alerta) ───────────────────
		if (url.startsWith("/api/public/")) {
			res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [] }));
			return;
		}

		res.writeHead(404).end();
	});
	await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
	baseStub = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(async () => {
	await new Promise<void>((ok) => servidor.close(() => ok()));
});

beforeEach(() => {
	emails.length = 0;
	chamadasCortex.length = 0;
	modoCortex = "ok";
	process.env.LANGFUSE_WEBHOOK_SECRET = SEGREDO;
	process.env.ALERTA_OBSERVABILIDADE_TO = "alan.gray@twobrains.test";
	process.env.LANGFUSE_BASE_URL = baseStub;
	process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-teste";
	process.env.LANGFUSE_SECRET_KEY = "sk-lf-teste";
	process.env.CORTEX_MCP_URL = `${baseStub}/api/mcp`;
	process.env.CORTEX_MCP_TOKEN = "token-de-teste";
	process.env.CORTEX_PROJETO = "Ajaagora";
});

afterEach(() => {
	process.env = { ...ENV_ORIGINAL };
});

describe("ponte do alerta: webhook do Langfuse → e-mail + ocorrência no Cortex", () => {
	it("alerta assinado abre a ocorrência no Cortex e manda o e-mail", async () => {
		const corpo = JSON.stringify(alerta("ALERT"));
		const res = await POST(requisicao(corpo, assinar(corpo)));
		const json = (await res.json()) as { ok: boolean; email: boolean; cortex: boolean };

		expect(res.status).toBe(200);
		expect(json).toMatchObject({ ok: true, email: true, cortex: true });

		// O Cortex recebeu a ocorrência — e recebeu o que serve para agir.
		expect(chamadasCortex).toHaveLength(1);
		expect(chamadasCortex[0].name).toBe("abrir_ocorrencia");
		expect(chamadasCortex[0].args).toMatchObject({
			projeto: "Ajaagora",
			tipo: "incident",
			prioridade: "urgent", // severidade ALERT
		});
		expect(String(chamadasCortex[0].args.titulo)).toContain("Busca contradiz o pedido do cliente");
		expect(String(chamadasCortex[0].args.descricao)).toContain("3 turnos na última hora");

		expect(emails).toHaveLength(1);
		expect(emails[0].to).toBe("alan.gray@twobrains.test");
	});

	it("severidade abaixo de ALERT abre como `high` — inflação de urgência mata alerta", async () => {
		const corpo = JSON.stringify(alerta("WARNING"));
		await POST(requisicao(corpo, assinar(corpo)));
		expect(chamadasCortex[0].args).toMatchObject({ prioridade: "high" });
	});

	it("Cortex fora do ar não cala o e-mail", async () => {
		modoCortex = "http-500";
		const corpo = JSON.stringify(alerta());
		const res = await POST(requisicao(corpo, assinar(corpo)));
		const json = (await res.json()) as { email: boolean; cortex: boolean };

		expect(res.status).toBe(200); // 5 falhas seguidas desabilitam a automação
		expect(json.email).toBe(true);
		expect(json.cortex).toBe(false);
		expect(emails).toHaveLength(1);
	});

	it("200 com erro embutido NÃO conta como ocorrência aberta", async () => {
		modoCortex = "erro-embutido";
		const corpo = JSON.stringify(alerta());
		const res = await POST(requisicao(corpo, assinar(corpo)));
		expect((await res.json()).cortex).toBe(false);
	});

	it("sem CORTEX_MCP_URL/TOKEN a rota segue entregando o e-mail (no-op silencioso)", async () => {
		process.env.CORTEX_MCP_URL = undefined;
		process.env.CORTEX_MCP_TOKEN = undefined;
		const corpo = JSON.stringify(alerta());
		const res = await POST(requisicao(corpo, assinar(corpo)));
		const json = (await res.json()) as { email: boolean; cortex: boolean };

		expect(json.email).toBe(true);
		expect(json.cortex).toBe(false);
		expect(chamadasCortex).toHaveLength(0);
	});

	it("sem LANGFUSE_WEBHOOK_SECRET a rota fecha em 503 — era o estado de produção", async () => {
		process.env.LANGFUSE_WEBHOOK_SECRET = undefined;
		const corpo = JSON.stringify(alerta());
		const res = await POST(requisicao(corpo, assinar(corpo)));

		expect(res.status).toBe(503);
		expect(chamadasCortex).toHaveLength(0);
		expect(emails).toHaveLength(0);
	});

	it("assinatura inválida é recusada com 401 — o endpoint não é botão público", async () => {
		const corpo = JSON.stringify(alerta());
		const res = await POST(requisicao(corpo, assinar(corpo, "segredo-errado")));

		expect(res.status).toBe(401);
		expect(chamadasCortex).toHaveLength(0);
		expect(emails).toHaveLength(0);
	});

	it("evento que não é `monitor-alert` é ignorado com 200 e não abre nada", async () => {
		const corpo = JSON.stringify({ type: "prompt-version", payload: {} });
		const res = await POST(requisicao(corpo, assinar(corpo)));
		const json = (await res.json()) as { ok: boolean; ignorado: string };

		expect(res.status).toBe(200);
		expect(json.ignorado).toBe("prompt-version");
		expect(chamadasCortex).toHaveLength(0);
	});
});
