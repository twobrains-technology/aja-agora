// A PERSISTÊNCIA DO VENDEDOR LIVRE — o que ela precisa continuar PRODUZINDO.
//
// Cobre as duas lacunas do bloco PERSIST da auditoria de paridade:
//  · L04 — o estágio comercial do lead avança a cada turno, pelos FATOS da
//    conversa (identificado, viu oferta), como a `main` fazia no nó `persist`;
//  · L40 — o último passe anti-JSON/tool leak continua na persistência: máquina
//    não vira balão na conversa do cliente.
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, leadEvents, leads, messages } from "@/db/schema";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { estadoInicialDoTurno } from "@/lib/agent/turn/estado";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";
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
