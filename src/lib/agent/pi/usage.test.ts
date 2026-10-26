// O USO DE CACHE DO PROVEDOR CHEGA AO TURN-TRACE — L29/P281, metade do TURNO.
//
// `executarBeat` já devolve `uso.cacheRead`/`uso.cacheWrite` (o recorte de cache
// do prompt que só o bloco `usage` final do stream carrega — ver
// `converse.test.ts`). O que faltava era o TURNO: sem um evento `usage` no
// stream, `TurnTraceRecord.cacheRead`/`cacheWrite` ficavam `null` para sempre, e
// com eles o custo real da IA por conversa — que é justamente o número que o
// cache do prompt muda (o vendedor livre reenvia a mesma caixa a cada beat).
//
// O caso é medido pelo consumidor de verdade, não pelo formato do evento: o
// stream do turno passa pelo tap `traceTurnEvents` (o funil do WhatsApp) e o que
// se assere é o REGISTRO fechado. O segundo teste é o outro lado da regra: `null`
// no trace significa "não medido", então provedor que não reporta cache NÃO pode
// produzir evento nenhum (um evento com 0/0 mentiria que foi medido e deu zero).
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { type TurnTraceRecord, traceTurnEvents } from "@/lib/telemetry/turn-trace";
import { createRunTurnLivre } from "./turno-livre";

const criadas: string[] = [];
afterEach(async () => {
	for (const id of criadas.splice(0)) {
		await db.delete(messages).where(eq(messages.conversationId, id));
		await db.delete(conversations).where(eq(conversations.id, id));
	}
});

async function novaConversa(): Promise<string> {
	const [conv] = await db
		.insert(conversations)
		.values({ channel: "web", status: "active", isSimulated: true, contactName: null })
		.returning({ id: conversations.id });
	criadas.push(conv.id);
	return conv.id;
}

/** Gateway OpenAI-completions: um beat de texto e, em chunk PRÓPRIO sem
 *  `choices`, o bloco `usage` final — é o único lugar onde o provedor diz
 *  quantos tokens do prompt vieram do cache. Sem `cache`, o bloco não traz
 *  `prompt_tokens_details` (é o que um provedor sem cache faz). */
async function subirGateway(uso: {
	prompt_tokens: number;
	completion_tokens: number;
	cacheRead?: number;
	cacheWrite?: number;
}): Promise<{ url: string; fechar: () => Promise<void> }> {
	const server: Server = createServer((req, res) => {
		req.on("data", () => {});
		req.on("end", () => {
			res.writeHead(200, { "Content-Type": "text/event-stream" });
			const base = {
				id: "chatcmpl-uso",
				object: "chat.completion.chunk",
				created: 0,
				model: "com-uso",
			};
			const envia = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
			envia({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "" } }] });
			envia({
				...base,
				choices: [{ index: 0, delta: { content: "Oi! Me conta o que você quer comprar." } }],
			});
			envia({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
			envia({
				...base,
				choices: [],
				usage: {
					prompt_tokens: uso.prompt_tokens,
					completion_tokens: uso.completion_tokens,
					...(uso.cacheRead !== undefined || uso.cacheWrite !== undefined
						? {
								prompt_tokens_details: {
									cached_tokens: uso.cacheRead ?? 0,
									cache_write_tokens: uso.cacheWrite ?? 0,
								},
							}
						: {}),
				},
			});
			res.write("data: [DONE]\n\n");
			res.end();
		});
	});
	await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
	const porta = (server.address() as AddressInfo).port;
	return {
		url: `http://127.0.0.1:${porta}`,
		fechar: () => new Promise<void>((ok) => server.close(() => ok())),
	};
}

/** Um turno inteiro consumido pelo tap do trace: devolve os eventos do stream e
 *  o registro que o sink recebeu no fim. */
async function rodarTurnoComTrace(gatewayUrl: string): Promise<{
	eventos: TurnEvent[];
	registro: TurnTraceRecord | undefined;
}> {
	const conversationId = await novaConversa();
	const run = createRunTurnLivre({
		provider: { id: "litellm", baseUrl: gatewayUrl, apiKey: "teste", model: "com-uso" },
		busca: async () => [],
	});
	const eventos: TurnEvent[] = [];
	const registros: TurnTraceRecord[] = [];
	const fluxo = run({
		channel: "web",
		conversationId,
		userText: "oi, quero um carro",
		isUserTurn: true,
		contactName: null,
	});
	for await (const ev of traceTurnEvents(
		fluxo,
		{ conversationId, channel: "web" },
		{
			now: () => Date.now(),
			newId: () => "trace-do-teste",
			sink: (registro) => registros.push(registro),
		},
	)) {
		eventos.push(ev);
	}
	return { eventos, registro: registros[0] };
}

describe("L29/P281 — o uso de cache do provedor sai do turno para o trace", () => {
	it("beat com cache do prompt vira evento `usage` e o trace deixa de ter `null`", async () => {
		const gateway = await subirGateway({
			prompt_tokens: 12_000,
			completion_tokens: 40,
			cacheRead: 10_000,
			cacheWrite: 500,
		});
		try {
			const { eventos, registro } = await rodarTurnoComTrace(gateway.url);
			const usos = eventos.filter((e) => e.type === "usage");
			expect(usos).toEqual([{ type: "usage", cacheRead: 10_000, cacheWrite: 500 }]);
			expect(registro?.cacheRead).toBe(10_000);
			expect(registro?.cacheWrite).toBe(500);
		} finally {
			await gateway.fechar();
		}
	});

	it("provedor sem cache nenhum não emite evento `usage` (null = não medido)", async () => {
		const gateway = await subirGateway({ prompt_tokens: 12_000, completion_tokens: 40 });
		try {
			const { eventos, registro } = await rodarTurnoComTrace(gateway.url);
			expect(eventos.filter((e) => e.type === "usage")).toEqual([]);
			expect(registro?.cacheRead).toBeNull();
			expect(registro?.cacheWrite).toBeNull();
		} finally {
			await gateway.fechar();
		}
	});
});
