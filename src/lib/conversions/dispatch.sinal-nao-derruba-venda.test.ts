/**
 * O sinal de interesse não pode derrubar o marco de venda.
 *
 * ── O risco, e de onde ele veio ─────────────────────────────────────────────
 *
 * `enviarParaMeta` manda TODOS os pendentes numa chamada só, e `dispatch.ts`
 * marca o LOTE INTEIRO como `sent` ou `failed` conforme a resposta. Isso era
 * aceitável enquanto a fila tinha três eventos de venda, todos do mesmo
 * vocabulário padrão da Meta (`Lead`, `InitiateCheckout`, `Purchase`), raros e
 * homogêneos.
 *
 * O `chat_iniciado` (item B3) mudou as duas coisas ao mesmo tempo:
 *
 *  • **é evento PERSONALIZADO** — nome fora do vocabulário da Meta, com
 *    `action_source` que varia por canal. É a linha da fila com maior chance de
 *    ser recusada por validação nova ou por mudança de contrato da Graph API;
 *  • **é MUITO mais frequente.** Medido em produção (16–30/08): 75 aberturas de
 *    teatro contra 22 eventos de conversão no mesmo período. A fila passa a ser
 *    dominada por ele.
 *
 * Junte os dois e o desfecho é o que este arquivo impede: uma recusa causada
 * pelo sinal de interesse levaria junto, para `failed`, o `Purchase` de uma
 * venda de R$ 150 mil que estava no mesmo lote. O erro gravado apontaria o
 * campo do evento errado, e ninguém procuraria a venda perdida — ela não
 * "sumiu", ficou `failed` com uma mensagem plausível.
 *
 * A separação é por NATUREZA, não por nome: marco de negócio de um lado, sinal
 * do outro. Um lote que falha derruba só os seus.
 */

import { describe, expect, it, vi } from "vitest";

const enviarParaMeta = vi.hoisted(() => vi.fn());

vi.mock("./meta-capi", async (importOriginal) => {
	const real = await importOriginal<typeof import("./meta-capi")>();
	return { ...real, enviarParaMeta };
});

vi.mock("./config", () => ({
	getConversionsConfig: () => ({
		enabled: true,
		pixelId: "123",
		accessToken: "tok",
		apiVersion: "v21.0",
		testEventCode: null,
	}),
	motivoParaNaoEnviar: () => null,
}));

const linhas = vi.hoisted(() => ({ pendentes: [] as Array<Record<string, unknown>> }));
const atualizacoes = vi.hoisted(() => [] as Array<{ id: string; status: string }>);

vi.mock("@/db", () => {
	const select = () => ({
		from: () => ({
			where: () => ({
				orderBy: () => ({ limit: async () => linhas.pendentes }),
			}),
		}),
	});
	const update = () => ({
		set: (valores: Record<string, unknown>) => ({
			where: (cond: unknown) => {
				const id = String((cond as { __id?: string })?.__id ?? "?");
				atualizacoes.push({ id, status: String(valores.status ?? "") });
				return { returning: async () => [] };
			},
		}),
	});
	return { db: { select, update } };
});

vi.mock("drizzle-orm", async (importOriginal) => {
	const real = await importOriginal<typeof import("drizzle-orm")>();
	return {
		...real,
		// `eq(conversionEvents.id, evento.id)` — o teste só precisa do id de volta
		// para saber QUAL linha foi marcada.
		eq: (_col: unknown, valor: unknown) => ({ __id: valor }),
	};
});

function evento(id: string, eventName: string) {
	return {
		id,
		eventName,
		eventKey: `${id}:${eventName}`,
		occurredAt: new Date(),
		value: eventName === "contrato_fechado" ? "150000.00" : null,
		currency: "BRL",
		hashedEmail: null,
		hashedPhone: "a".repeat(64),
		fbc: null,
		fbp: null,
		ctwaClid: null,
		actionSource: "website",
		contentId: null,
	};
}

describe("o sinal de interesse não derruba o marco de venda", () => {
	it("marco de venda e sinal viajam em LOTES separados", async () => {
		linhas.pendentes = [evento("v1", "contrato_fechado"), evento("s1", "chat_iniciado")];
		atualizacoes.length = 0;
		enviarParaMeta.mockReset().mockResolvedValue({ ok: true });

		const { despacharConversoesPendentes } = await import("./dispatch");
		await despacharConversoesPendentes();

		// Duas chamadas, não uma: é a separação inteira.
		expect(enviarParaMeta).toHaveBeenCalledTimes(2);

		const nomesPorLote = enviarParaMeta.mock.calls.map((c) =>
			(c[0] as Array<{ eventName: string }>).map((e) => e.eventName),
		);
		// Nenhum lote mistura as duas naturezas.
		for (const lote of nomesPorLote) {
			const temVenda = lote.some((n) => n !== "chat_iniciado");
			const temSinal = lote.some((n) => n === "chat_iniciado");
			expect(temVenda && temSinal).toBe(false);
		}
	});

	it("o sinal sendo RECUSADO não marca a venda como falha", async () => {
		// O caso que motiva o arquivo: a Meta recusa o evento personalizado, e o
		// `Purchase` de R$ 150 mil está no mesmo tique do worker.
		linhas.pendentes = [evento("v1", "contrato_fechado"), evento("s1", "chat_iniciado")];
		atualizacoes.length = 0;
		enviarParaMeta.mockReset().mockImplementation(async (eventos: Array<{ eventName: string }>) => {
			const ehSinal = eventos.some((e) => e.eventName === "chat_iniciado");
			return ehSinal ? { ok: false, erro: "HTTP 400: custom event rejected" } : { ok: true };
		});

		const { despacharConversoesPendentes } = await import("./dispatch");
		const r = await despacharConversoesPendentes();

		const daVenda = atualizacoes.find((a) => a.id === "v1");
		const doSinal = atualizacoes.find((a) => a.id === "s1");

		expect(daVenda?.status).toBe("sent");
		expect(doSinal?.status).toBe("failed");
		// E o resultado conta os dois lados com honestidade.
		expect(r.enviados).toBe(1);
		expect(r.falhas).toBe(1);
	});

	it("a venda sendo recusada também não arrasta o sinal", async () => {
		// O contrário vale igual — a separação não tem lado privilegiado.
		linhas.pendentes = [evento("v1", "lead_qualificado"), evento("s1", "chat_iniciado")];
		atualizacoes.length = 0;
		enviarParaMeta.mockReset().mockImplementation(async (eventos: Array<{ eventName: string }>) => {
			const ehSinal = eventos.some((e) => e.eventName === "chat_iniciado");
			return ehSinal ? { ok: true } : { ok: false, erro: "HTTP 400" };
		});

		const { despacharConversoesPendentes } = await import("./dispatch");
		await despacharConversoesPendentes();

		expect(atualizacoes.find((a) => a.id === "v1")?.status).toBe("failed");
		expect(atualizacoes.find((a) => a.id === "s1")?.status).toBe("sent");
	});

	it("fila só de venda continua sendo UMA chamada — nada de round-trip à toa", async () => {
		linhas.pendentes = [evento("v1", "lead_qualificado"), evento("v2", "proposta_criada")];
		atualizacoes.length = 0;
		enviarParaMeta.mockReset().mockResolvedValue({ ok: true });

		const { despacharConversoesPendentes } = await import("./dispatch");
		await despacharConversoesPendentes();

		expect(enviarParaMeta).toHaveBeenCalledTimes(1);
	});

	it("fila vazia não chama a Meta", async () => {
		linhas.pendentes = [];
		atualizacoes.length = 0;
		enviarParaMeta.mockReset().mockResolvedValue({ ok: true });

		const { despacharConversoesPendentes } = await import("./dispatch");
		await despacharConversoesPendentes();

		expect(enviarParaMeta).not.toHaveBeenCalled();
	});
});
