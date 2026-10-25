// A PERSISTÊNCIA DO VENDEDOR LIVRE — o que ela precisa continuar PRODUZINDO.
//
// Cobre as duas lacunas do bloco PERSIST da auditoria de paridade:
//  · L04 — o estágio comercial do lead avança a cada turno, pelos FATOS da
//    conversa (identificado, viu oferta), como a `main` fazia no nó `persist`;
//  · L40 — o último passe anti-JSON/tool leak continua na persistência: máquina
//    não vira balão na conversa do cliente.
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, leadEvents, leads, messages } from "@/db/schema";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { estadoInicialDoTurno } from "@/lib/agent/turn/estado";
import type { ResumeRow } from "@/lib/chat/resume";
import { buildResumableMessages } from "@/lib/chat/resume";
import { storeIdentity } from "@/lib/conversation/identity";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";
import { BACKOFF_RETOMADA_MS, MAX_RETOMADAS, podeRetomar } from "@/lib/workers/retomada";
import { estagioComercialDoTurno, persistirTurnoLivre } from "./persist-livre";

const criadas: string[] = [];

afterEach(async () => {
	for (const id of criadas.splice(0)) {
		// `lead_events` cai junto com o lead (FK em cascata).
		await db.delete(leads).where(eq(leads.conversationId, id));
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

async function novoLead(conversationId: string, stage?: "proposta_enviada" | "fechado_ganho") {
	const [lead] = await db
		.insert(leads)
		.values({
			conversationId,
			name: "Ana",
			isSimulated: true,
			...(stage ? { stage } : {}),
		})
		.returning({ id: leads.id, stage: leads.stage });
	return lead;
}

/** O turno com os fatos que o motor livre realmente coleta. */
function turno(args: {
	conversationId: string;
	baseMeta: ConversationMetadata;
	isUserTurn?: boolean;
	userText?: string;
	eventos?: TurnEvent[];
	fatos?: {
		currentCategory?: "auto";
		revealCompleted?: boolean;
		identityCollected?: boolean;
	};
}) {
	const estado = estadoInicialDoTurno({
		conversationId: args.conversationId,
		channel: "web",
		isUserTurn: args.isUserTurn ?? true,
		userText: args.userText ?? "quero um carro",
		baseMeta: args.baseMeta,
	});
	return {
		...estado,
		funnel: { ...estado.funnel, ...args.fatos },
		events: args.eventos ?? [],
	};
}

describe("estágio comercial do lead — L04", () => {
	it("lê os degraus dos fatos: categoria → engajado, identidade → qualificado, reveal + turno do cliente → em_negociacao", () => {
		expect(estagioComercialDoTurno({ isUserTurn: true }, {})).toBeNull();
		expect(estagioComercialDoTurno({ isUserTurn: true }, { currentCategory: "auto" })).toBe(
			"engajado",
		);
		expect(
			estagioComercialDoTurno(
				{ isUserTurn: true },
				{
					currentCategory: "auto",
					identityCollected: true,
				},
			),
		).toBe("qualificado");
		expect(
			estagioComercialDoTurno(
				{ isUserTurn: true },
				{
					currentCategory: "auto",
					identityCollected: true,
					revealCompleted: true,
				},
			),
		).toBe("em_negociacao");
	});

	it("só ter visto as ofertas NÃO é negociar: o turno tem de ser do cliente", () => {
		expect(
			estagioComercialDoTurno(
				{ isUserTurn: false },
				{
					identityCollected: true,
					revealCompleted: true,
				},
			),
		).toBe("qualificado");
	});

	it("persistir o turno avança o lead até em_negociacao e grava o evento", async () => {
		const conversationId = await novaConversa();
		const lead = await novoLead(conversationId);

		await persistirTurnoLivre({
			estado: turno({
				conversationId,
				baseMeta: {},
				fatos: { currentCategory: "auto", revealCompleted: true },
			}),
		});

		const meta = await reloadMeta(conversationId);
		expect(meta.maxStageReached).toBe("em_negociacao");
		expect(meta.currentCategory).toBe("auto");
		expect(meta.revealCompleted).toBe(true);

		const depois = await db.query.leads.findFirst({ where: eq(leads.id, lead.id) });
		expect(depois?.stage).toBe("em_negociacao");

		const eventos = await db.query.leadEvents.findMany({ where: eq(leadEvents.leadId, lead.id) });
		expect(eventos.map((ev) => ev.toStage)).toContain("em_negociacao");
	});

	it("identidade gravada NO MEIO do turno (storeIdentity) qualifica o lead", async () => {
		const conversationId = await novaConversa();
		const lead = await novoLead(conversationId);

		// O que `storeIdentity` faz quando o CPF chega: escreve no meta durante o
		// turno, sem passar pelo `funnel` que o turno leu no início.
		await persistMeta(conversationId, { identityCollected: true });

		await persistirTurnoLivre({ estado: turno({ conversationId, baseMeta: {} }) });

		const meta = await reloadMeta(conversationId);
		expect(meta.identityCollected).toBe(true);
		expect(meta.maxStageReached).toBe("qualificado");
		const depois = await db.query.leads.findFirst({ where: eq(leads.id, lead.id) });
		expect(depois?.stage).toBe("qualificado");
	});

	it("só avança: lead que o humano já levou adiante não regride no turno", async () => {
		const conversationId = await novaConversa();
		const lead = await novoLead(conversationId, "proposta_enviada");

		await persistirTurnoLivre({
			estado: turno({ conversationId, baseMeta: {}, fatos: { currentCategory: "auto" } }),
		});

		const depois = await db.query.leads.findFirst({ where: eq(leads.id, lead.id) });
		expect(depois?.stage).toBe("proposta_enviada");
		expect((await reloadMeta(conversationId)).maxStageReached).toBe("engajado");
	});

	it("conversa de quem já viu oferta avança em cada turno de cliente (idempotente)", async () => {
		const conversationId = await novaConversa();
		const meta: ConversationMetadata = { revealCompleted: true, identityCollected: true };
		// O que o turno lê no começo é o que está no banco — é a meta que fica.
		await persistMeta(conversationId, meta);

		await persistirTurnoLivre({
			estado: turno({ conversationId, baseMeta: meta, isUserTurn: false }),
		});
		expect((await reloadMeta(conversationId)).maxStageReached).toBe("qualificado");

		await persistirTurnoLivre({ estado: turno({ conversationId, baseMeta: meta }) });
		expect((await reloadMeta(conversationId)).maxStageReached).toBe("em_negociacao");
	});
});

describe("P272/P226 — identidade PARCIAL não qualifica", () => {
	it("só o CPF no meio do turno NÃO promove o lead; com o celular, promove", async () => {
		const conversationId = await novaConversa();
		const lead = await novoLead(conversationId);

		// Turno em que só o CPF chegou: `storeIdentity` o guarda, mas a identidade
		// que a Bevi exige tem duas metades.
		await storeIdentity(conversationId, { cpf: "52998224725", celular: "" });
		await persistirTurnoLivre({ estado: turno({ conversationId, baseMeta: {} }) });

		const parcial = await reloadMeta(conversationId);
		expect(parcial.identityCollected).not.toBe(true);
		expect(parcial.maxStageReached ?? null).not.toBe("qualificado");
		expect((await db.query.leads.findFirst({ where: eq(leads.id, lead.id) }))?.stage).toBe("novo");

		// Turno seguinte: o celular completa o par.
		await storeIdentity(conversationId, { cpf: "52998224725", celular: "11987654321" });
		await persistirTurnoLivre({ estado: turno({ conversationId, baseMeta: {} }) });

		const completo = await reloadMeta(conversationId);
		expect(completo.identityCollected).toBe(true);
		expect(completo.maxStageReached).toBe("qualificado");
		expect((await db.query.leads.findFirst({ where: eq(leads.id, lead.id) }))?.stage).toBe(
			"qualificado",
		);
	});
});

describe("P248/P269 — o cliente que volta zera o contador de retomadas", () => {
	/** Duas retomadas já gastas nesta conversa. */
	function metaComTeto(tentativas = MAX_RETOMADAS): ConversationMetadata {
		return {
			currentCategory: "auto",
			retomada: { attempts: tentativas, lastAt: Date.now() - BACKOFF_RETOMADA_MS * 10 },
		};
	}

	it("cliente volta depois de 2 tentativas: o contador zera e a próxima janela agenda de novo", async () => {
		const conversationId = await novaConversa();
		const meta = metaComTeto();
		await persistMeta(conversationId, meta);

		// Antes: o teto bloqueia — é o defeito do contador que nunca volta.
		expect(podeRetomar(meta, Date.now())).toBe(false);

		await persistirTurnoLivre({
			estado: turno({ conversationId, baseMeta: meta, userText: "voltei, e agora?" }),
		});

		const depois = await reloadMeta(conversationId);
		expect(depois.retomada).toBeUndefined();
		// Nov período de silêncio: o watchdog volta a poder puxar a conversa.
		expect(podeRetomar(depois, Date.now())).toBe(true);
	});

	it("turno de SERVIDOR não perdoa a própria tentativa", async () => {
		const conversationId = await novaConversa();
		const meta = metaComTeto(1);
		await persistMeta(conversationId, meta);

		await persistirTurnoLivre({
			estado: turno({ conversationId, baseMeta: meta, isUserTurn: false, userText: undefined }),
		});

		expect((await reloadMeta(conversationId)).retomada).toEqual(meta.retomada);
	});

	it("cliente volta SEM TEXTO (foto, áudio sem transcrição): também zera o contador", async () => {
		const conversationId = await novaConversa();
		const meta = metaComTeto();
		await persistMeta(conversationId, meta);
		expect(podeRetomar(meta, Date.now())).toBe(false);

		// O turno existe e é do cliente, mas não trouxe uma palavra: mídia sem
		// legenda, áudio que não pôde ser transcrito. Ele voltou — o teto não pode
		// continuar gasto por um período de silêncio que já terminou.
		await persistirTurnoLivre({
			estado: turno({ conversationId, baseMeta: meta, userText: "" }),
		});

		const depois = await reloadMeta(conversationId);
		expect(depois.retomada).toBeUndefined();
		expect(podeRetomar(depois, Date.now())).toBe(true);

		// E nada de balão vazio na conversa: turno de cliente sem texto não grava
		// fala nenhuma.
		expect(
			await db.query.messages.findMany({ where: eq(messages.conversationId, conversationId) }),
		).toEqual([]);
	});
});

describe("as linhas do turno na ORDEM DOS EVENTOS — o card não fecha o turno", () => {
	it("texto → card → texto sai nessa ordem, com created_at crescente, e a retomada devolve [texto, card, texto]", async () => {
		const conversationId = await novaConversa();

		// Relógio parado (só `Date`; o driver não perde os timers): sem isso o
		// intervalo entre duas linhas é o tempo do round-trip ao Postgres e a
		// exigência de `created_at` crescente passaria por acaso. Parado, o passo
		// de 1 ms de `relogioDoTurno` é a ÚNICA fonte do avanço.
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			await persistirTurnoLivre({
				estado: turno({
					conversationId,
					baseMeta: {},
					isUserTurn: false,
					eventos: [
						{ type: "text-delta", text: "Achei estas opções pra você:" },
						{ type: "text-boundary" },
						{
							type: "artifact",
							artifactType: "comparison_table",
							payload: { cartas: [{ administradora: "ITAÚ" }] },
							toolCallId: "chamada-do-teste",
						},
						{ type: "text-boundary" },
						{ type: "text-delta", text: "Qual delas te agrada mais?" },
					],
				}),
			});
		} finally {
			vi.useRealTimers();
		}

		// A MESMA ordem que a retomada lê: `created_at` e, no empate, o `id`.
		const linhas = await db.query.messages.findMany({
			where: eq(messages.conversationId, conversationId),
			orderBy: (m, { asc }) => [asc(m.createdAt), asc(m.id)],
			with: { artifacts: true },
		});

		expect(linhas.map((l) => l.content)).toEqual([
			"Achei estas opções pra você:",
			"[card: comparison_table]",
			"Qual delas te agrada mais?",
		]);

		// Estritamente crescente: no empate de milissegundo o desempate é o uuid
		// aleatório, e o card cairia antes da fala que o anuncia.
		const tempos = linhas.map((l) => l.createdAt.getTime());
		for (let i = 1; i < tempos.length; i++) {
			expect(tempos[i]).toBeGreaterThan(tempos[i - 1] as number);
		}

		const retomada = buildResumableMessages(
			linhas.map(
				(l): ResumeRow => ({
					id: l.id,
					role: l.role as string,
					content: l.content,
					artifacts: (l.artifacts ?? []).map((a) => ({
						type: a.type as string,
						payload: a.payload,
					})),
				}),
			),
		);

		expect(retomada).toEqual([
			{
				id: expect.any(String),
				role: "assistant",
				parts: [
					{ type: "text", text: "Achei estas opções pra você:" },
					{
						type: "artifact",
						artifactType: "comparison_table",
						payload: { cartas: [{ administradora: "ITAÚ" }] },
					},
					{ type: "text", text: "Qual delas te agrada mais?" },
				],
			},
		]);
	});
});

describe("último passe anti-vazamento na persistência — L40", () => {
	it("JSON de argumento e nome de tool não viram balão; a fala é limpa e o CPF mascarado", async () => {
		const conversationId = await novaConversa();

		await persistirTurnoLivre({
			estado: turno({
				conversationId,
				baseMeta: {},
				eventos: [
					{ type: "text-delta", text: "Claro, deixa eu ver as cotas pra você." },
					{ type: "text-boundary" },
					{ type: "text-delta", text: '{"categoria": "auto", "valorDoBem": 80000}' },
					{ type: "text-boundary" },
					{ type: "text-delta", text: "Vou chamar a buscar_cartas agora." },
					{ type: "text-boundary" },
					{ type: "text-delta", text: "Seu CPF 111.444.777-35 está guardado." },
				],
			}),
		});

		const salvas = await db.query.messages.findMany({
			where: eq(messages.conversationId, conversationId),
		});
		const falasDoAgente = salvas.filter((m) => m.role === "assistant").map((m) => m.content);

		expect(falasDoAgente).toEqual([
			"Claro, deixa eu ver as cotas pra você.",
			"Seu CPF ***.***.777-35 está guardado.",
		]);
	});
});
