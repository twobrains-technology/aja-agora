// A COMPENSAÇÃO DO TOQUE DA RÉGUA — provada contra o Postgres, com a Meta
// mockada na borda (FIX-441 / D12).
//
// O defeito medido (prod, 02/10 14:00): a régua carimbou 10 toques e um deles
// a Meta recusou com 131049 — a cota foi consumida por uma mensagem que o
// cliente não recebeu, e o toque não voltou. Este arquivo prova as duas pontas
// do conserto:
//
//   (a) falha SÍNCRONA no envio ⇒ o carimbo é compensado (step, cota e
//       `ultimo_toque_em` voltam; `next_touch_at` vai para o backoff);
//   (b) envio ACEITO ⇒ o `wamid` fica na linha e o template vira mensagem do
//       assistente em `messages` (o painel e o agente passam a enxergar);
//   (c) falha ASSÍNCRONA (webhook `failed`) ⇒ a cota volta pelo `wamid`,
//       idempotente; 131050 encerra a régua;
//   (d) o painel conta o toque por template com a chave REAL
//       (`remarketing_inicio_generico`), não o vocabulário legado.
//
// NENHUM envio real: `fetch` é stubado, e o destino é um telefone de teste.
// Skip quando não há DATABASE_URL.

import { and, eq, inArray } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
	BACKOFF_DE_DIAS_MS,
	ENVIO_STATUS_ENVIADO,
	MOTIVO_SAIDA_META,
} from "@/lib/remarketing/status-do-toque";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Instante fixo: a régua recebe `agora` por parâmetro, então o teste é
 * determinístico e não depende do relógio da máquina. */
const AGORA = new Date("2026-09-18T15:30:00Z");
const MIN = 60 * 1000;
const DIA = 24 * 60 * MIN;

/** Resposta mínima no shape do `fetch` que o `callApi` consome. */
function resposta(status: number, body: unknown): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		async text() {
			return JSON.stringify(body);
		},
		async json() {
			return body;
		},
	} as unknown as Response;
}

function postWebhook(body: unknown): NextRequest {
	return new Request("https://x/api/webhook/whatsapp", {
		method: "POST",
		body: JSON.stringify(body),
	}) as unknown as NextRequest;
}

describeIfDb("régua — envio, compensação e visibilidade (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let ciclo: typeof import("./remarketing-cycle");
	let queries: typeof import("@/lib/admin/remarketing-queries");
	let POST: typeof import("@/app/api/webhook/whatsapp/route").POST;

	const convIds: string[] = [];
	const contactIds: string[] = [];
	const templateKeys: string[] = [];

	const SUF = String(Math.floor(Math.random() * 9000) + 1000);
	const FONE = `55629${SUF}0001`;
	const USAGE_KEY = "remarketing_inicio_generico";
	const META_NAME = `aja-teste-b11-${SUF}`;
	const BODY_PREVIEW = "Oi! Vi que você simulou com a gente e ficou uma oportunidade em aberto.";

	/** Semeia conversa + contato + linha da régua. Devolve o id da conversa. */
	async function semearLinha(
		over: {
			step?: number;
			status?: "ATIVO" | "RESPONDEU" | "ESGOTADO" | "OPTOUT" | "CONVERTEU";
			ultimoToqueEm?: Date | null;
			touches30d?: number;
			nextTouchAt?: Date | null;
			ultimoWamid?: string | null;
			envioStatus?: string | null;
			inboundHa?: number;
		} = {},
	): Promise<string> {
		const ultimoToqueEm = over.ultimoToqueEm ?? null;
		const inboundEm = new Date(AGORA.getTime() - (over.inboundHa ?? 5 * DIA));

		const [conv] = await db
			.insert(schema.conversations)
			.values({
				channel: "whatsapp",
				status: "active",
				isSimulated: false,
				waId: FONE,
				lastInboundAt: inboundEm,
			})
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);

		const [contact] = await db
			.insert(schema.contacts)
			.values({ phone: FONE })
			.returning({ id: schema.contacts.id });
		contactIds.push(contact.id);
		await db
			.update(schema.conversations)
			.set({ contactId: contact.id })
			.where(eq(schema.conversations.id, conv.id));

		await db.insert(schema.remarketingTouches).values({
			conversationId: conv.id,
			contactId: contact.id,
			objetivo: "carro",
			step: over.step ?? 0,
			status: over.status ?? "ATIVO",
			nextTouchAt:
				over.nextTouchAt === undefined ? new Date(AGORA.getTime() - MIN) : over.nextTouchAt,
			ultimoToqueEm,
			touches30d: over.touches30d ?? 0,
			ultimoWamid: over.ultimoWamid ?? null,
			envioStatus: over.envioStatus ?? null,
			createdAt: new Date(AGORA.getTime() - 2 * DIA),
		});

		return conv.id;
	}

	async function garantirTemplateAprovado(): Promise<void> {
		await db
			.insert(schema.whatsappTemplates)
			.values({
				usageKey: USAGE_KEY,
				metaName: META_NAME,
				language: "pt_BR",
				status: "APPROVED",
				bodyPreview: BODY_PREVIEW,
			})
			.onConflictDoUpdate({
				target: schema.whatsappTemplates.usageKey,
				set: { status: "APPROVED", metaName: META_NAME, bodyPreview: BODY_PREVIEW },
			});
		templateKeys.push(META_NAME);
	}

	/** As deps reais, com o mundo isolado: só a NOSSA linha é processada. */
	function deps(conversationId: string) {
		return {
			agora: AGORA,
			entrarNaRegua: async () => 0,
			listarVencidas: async (agora: Date) =>
				(await ciclo.listarVencidas(agora)).filter((l) => l.conversationId === conversationId),
			toquesDoContato: async () => [] as Date[],
			simulacaoDoContato: async () => null,
			telefoneDaEquipe: async () => false,
			segurarToquesDaEquipe: async () => 0,
			lerParametros: async () => (await import("@/lib/remarketing/regua")).PARAMETROS_DE_FABRICA,
			despacharConversoes: async () => ({}),
		};
	}

	async function lerLinha(conversationId: string) {
		const linha = await db.query.remarketingTouches.findFirst({
			where: eq(schema.remarketingTouches.conversationId, conversationId),
		});
		if (!linha) throw new Error("linha da régua não encontrada");
		return linha;
	}

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		ciclo = await import("./remarketing-cycle");
		queries = await import("@/lib/admin/remarketing-queries");
		({ POST } = await import("@/app/api/webhook/whatsapp/route"));

		process.env.REMARKETING_ATIVO = "1";
		delete process.env.REMARKETING_ENTRADA_WEB;
		// Sem segredo, o webhook pula a verificação de assinatura (dev/test).
		delete process.env.WHATSAPP_APP_SECRET;
		// O `getConfig` do cliente da Meta exige as duas envs para montar a URL.
		process.env.WHATSAPP_ACCESS_TOKEN = "token-de-teste";
		process.env.WHATSAPP_PHONE_NUMBER_ID = "000000000000000";

		ciclo.invalidarCacheDaEquipe();
		await garantirTemplateAprovado();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	afterAll(async () => {
		delete process.env.REMARKETING_ATIVO;
		if (convIds.length) {
			await db.delete(schema.messages).where(inArray(schema.messages.conversationId, convIds));
			await db
				.delete(schema.remarketingTouches)
				.where(inArray(schema.remarketingTouches.conversationId, convIds));
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (contactIds.length)
			await db.delete(schema.contacts).where(inArray(schema.contacts.id, contactIds));
		if (templateKeys.length) {
			await db
				.delete(schema.whatsappTemplates)
				.where(inArray(schema.whatsappTemplates.metaName, templateKeys));
		}
		ciclo.invalidarCacheDaEquipe();
	});

	it("(a) a Meta recusa o envio: o carimbo é compensado e o próximo toque vai para o backoff", async () => {
		const conversationId = await semearLinha();
		const fetchMock = vi.fn(async () =>
			resposta(400, { error: { message: "not delivered", code: 131049 } }),
		);
		vi.stubGlobal("fetch", fetchMock);

		const resultado = await ciclo.runRemarketingCycle(deps(conversationId));

		// O toque NÃO conta como disparado — ele não saiu.
		expect(resultado.disparados).toBe(0);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const linha = await lerLinha(conversationId);
		// O carimbo voltou ao estado anterior (o que a linha tinha antes do toque).
		expect(linha.step).toBe(0);
		expect(linha.ultimoToqueEm).toBeNull();
		expect(linha.touches30d).toBe(0);
		expect(linha.status).toBe("ATIVO");
		// E o próximo toque espera o backoff de dias do 131049.
		expect(linha.nextTouchAt?.getTime()).toBe(AGORA.getTime() + BACKOFF_DE_DIAS_MS);
		expect(linha.envioStatus).toBe("falhou");

		// Um 2º ciclo logo em seguida NÃO chama a Meta: a linha ainda não venceu.
		const segundo = await ciclo.runRemarketingCycle(deps(conversationId));
		expect(segundo.disparados).toBe(0);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("(b) a Meta aceita: o wamid fica na linha e o template vira fala do assistente", async () => {
		const conversationId = await semearLinha();
		const wamid = `wamid.b11-${crypto.randomUUID()}`;
		const fetchMock = vi.fn(async () => resposta(200, { messages: [{ id: wamid }] }));
		vi.stubGlobal("fetch", fetchMock);

		const resultado = await ciclo.runRemarketingCycle(deps(conversationId));
		expect(resultado.disparados).toBe(1);

		// O corpo enviado à Meta é TEMPLATE — nunca texto livre (D9/FIX-441).
		const chamada = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
		const corpo = JSON.parse(chamada[1].body) as { type: string; template?: { name: string } };
		expect(corpo.type).toBe("template");
		expect(corpo.template?.name).toBe(META_NAME);

		const linha = await lerLinha(conversationId);
		expect(linha.step).toBe(1);
		expect(linha.ultimoWamid).toBe(wamid);
		expect(linha.envioStatus).toBe(ENVIO_STATUS_ENVIADO);

		const falas = await db.query.messages.findMany({
			where: and(
				eq(schema.messages.conversationId, conversationId),
				eq(schema.messages.role, "assistant"),
			),
		});
		expect(falas).toHaveLength(1);
		expect(falas[0].templateName).toBe(META_NAME);
		expect(falas[0].content).toBe(BODY_PREVIEW);
	});

	it("(c) webhook `failed 131049` devolve a cota pelo wamid — e é idempotente", async () => {
		const wamid = `wamid.b11-${crypto.randomUUID()}`;
		const conversationId = await semearLinha({
			step: 1,
			ultimoToqueEm: new Date(AGORA.getTime() - MIN),
			touches30d: 1,
			nextTouchAt: new Date(AGORA.getTime() + 3 * DIA),
			ultimoWamid: wamid,
			envioStatus: ENVIO_STATUS_ENVIADO,
		});

		const payload = {
			entry: [
				{
					changes: [
						{
							field: "statuses",
							value: {
								statuses: [
									{
										status: "failed",
										id: wamid,
										recipient_id: FONE,
										errors: [{ code: 131049, title: "not delivered" }],
									},
								],
							},
						},
					],
				},
			],
		};

		const res = await POST(postWebhook(payload));
		expect(res.status).toBe(200);

		const depois = await lerLinha(conversationId);
		expect(depois.step).toBe(0);
		expect(depois.touches30d).toBe(0);
		expect(depois.envioStatus).toBe("falhou");
		expect(depois.nextTouchAt?.getTime()).toBeGreaterThan(Date.now());

		// Reentrega do MESMO status não desconta a cota de novo.
		const res2 = await POST(postWebhook(payload));
		expect(res2.status).toBe(200);
		const depois2 = await lerLinha(conversationId);
		expect(depois2.step).toBe(0);
		expect(depois2.touches30d).toBe(0);
		expect(depois2.nextTouchAt?.getTime()).toBe(depois.nextTouchAt?.getTime());
	});

	it("(c) webhook `failed 131050` encerra a régua com motivo de saída", async () => {
		const wamid = `wamid.b11-${crypto.randomUUID()}`;
		const conversationId = await semearLinha({
			step: 1,
			ultimoToqueEm: new Date(AGORA.getTime() - MIN),
			touches30d: 1,
			nextTouchAt: new Date(AGORA.getTime() + 3 * DIA),
			ultimoWamid: wamid,
			envioStatus: ENVIO_STATUS_ENVIADO,
		});

		const res = await POST(
			postWebhook({
				entry: [
					{
						changes: [
							{
								field: "statuses",
								value: {
									statuses: [
										{
											status: "failed",
											id: wamid,
											recipient_id: FONE,
											errors: [{ code: 131050, title: "rejected" }],
										},
									],
								},
							},
						],
					},
				],
			}),
		);
		expect(res.status).toBe(200);

		const linha = await lerLinha(conversationId);
		expect(linha.status).toBe("ESGOTADO");
		expect(linha.motivoSaida).toBe(MOTIVO_SAIDA_META);
		expect(linha.nextTouchAt).toBeNull();
	});

	it("(d) o painel enxerga o toque por template com a chave real (`remarketing_inicio_generico`)", async () => {
		const conversationId = await semearLinha({
			step: 1,
			ultimoToqueEm: new Date(AGORA.getTime() - MIN),
			touches30d: 1,
		});
		// A linha da fila usa a chave REAL — é o que o `LIKE` legado não casava.
		await db.insert(schema.whatsappOutboundQueue).values({
			to: FONE,
			usageKey: USAGE_KEY,
			status: "pending",
			createdAt: new Date(AGORA.getTime() - MIN),
		});

		const linhas = await queries.listarReguas({
			de: new Date(AGORA.getTime() - 3 * DIA),
			ate: new Date(AGORA.getTime() + DIA),
		});
		const linha = linhas.find((l) => l.conversationId === conversationId);
		expect(linha).toBeDefined();
		expect(linha?.evidenciaDaForma?.naFila?.nomeDoTemplate).toBe(META_NAME);
	});

	it("(e) a Meta ACEITOU e a persistência falhou ⇒ o toque NÃO é compensado", async () => {
		// `conversationId` sem linha em `conversations`: o INSERT em `messages` viola
		// a FK — é a falha PÓS-ACEITE. A Meta aceitou (fetch 200 + wamid); compensar
		// aqui faria o MESMO template sair de novo no backoff.
		const fantasma = "00000000-0000-0000-0000-0000000000ff";
		const compensarToque = vi.fn(async () => {});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => resposta(200, { messages: [{ id: `wamid.pend-${SUF}` }] })),
		);
		const d = {
			...deps(fantasma),
			listarVencidas: async () => [
				{
					conversationId: fantasma,
					contactId: "22222222-2222-2222-2222-222222222222",
					objetivo: "carro",
					step: 0,
					status: "ATIVO" as const,
					nextTouchAt: new Date(AGORA.getTime() - MIN),
					ultimoToqueEm: null,
					touches30d: 0,
					motivoSaida: null,
					channel: "whatsapp" as const,
					waId: FONE,
					phone: null,
					metadata: {},
					lastInboundAt: new Date(AGORA.getTime() - 5 * DIA),
					ultimaMensagemDoClienteEm: null,
					nome: null,
					optoutDaPessoaEm: null,
					viuOferta: false,
					teveProposta: false,
				},
			],
			compensarToque,
		};
		const r = await ciclo.runRemarketingCycle(d);
		expect(r.disparados).toBe(1);
		expect(compensarToque).not.toHaveBeenCalled();
	});

	it("(f) TIMEOUT na Meta (sem código) NÃO devolve a cota", async () => {
		const conversationId = await semearLinha({
			// `inboundHa` é em MILISSEGUNDOS (o default já é 5 dias). Passar `5` aqui
			// significava "o cliente falou 5 ms atrás" e o motor devolvia
			// `aguardando_data` — o toque 01 ainda esperava o silêncio de 90 min.
			nextTouchAt: new Date(AGORA.getTime() - MIN),
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("timeout ao falar com a Meta (>15s)");
			}),
		);
		const r = await ciclo.runRemarketingCycle(deps(conversationId));
		// O carimbo fica de pé: sem código explícito da Meta, o desfecho é ambíguo.
		expect(r.disparados).toBe(1);
		const linha = await lerLinha(conversationId);
		expect(linha.step).toBe(1);
		expect(linha.envioStatus).not.toBe("falhou");
	});

	it("(g) um `failed` atrasado NÃO reabre uma linha OPTOUT", async () => {
		const wamid = `wamid.opt-${SUF}`;
		const conversationId = await semearLinha({
			status: "OPTOUT",
			step: 1,
			ultimoToqueEm: new Date(AGORA.getTime() - MIN),
			touches30d: 1,
			ultimoWamid: wamid,
			envioStatus: ENVIO_STATUS_ENVIADO,
			nextTouchAt: null,
		});
		const res = await POST(
			postWebhook({
				entry: [
					{
						changes: [
							{
								field: "statuses",
								value: {
									statuses: [
										{
											status: "failed",
											id: wamid,
											recipient_id: FONE,
											errors: [{ code: 131049, title: "not delivered" }],
										},
									],
								},
							},
						],
					},
				],
			}),
		);
		expect(res.status).toBe(200);
		const linha = await lerLinha(conversationId);
		expect(linha.status).toBe("OPTOUT");
		expect(linha.step).toBe(1);
		expect(linha.envioStatus).toBe(ENVIO_STATUS_ENVIADO);
	});
});
