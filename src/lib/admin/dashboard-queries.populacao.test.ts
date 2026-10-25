// A POPULAÇÃO do funil do Dashboard (`computeFunnelStages`) — no banco.
//
// P201: o degrau do Dashboard lê `leads.stage` do banco. O defeito de 310e não
// estava nesta consulta, estava no PRODUTOR do estágio — o motor livre promovia a
// `qualificado` quem tinha deixado só o CPF, e todo consumidor de `stage` passou a
// mentir junto. Provar a expressão (`group by l.stage`) não pegaria isso; provar
// QUEM entra em cada degrau, sim.
//
// Semeia um lead por situação e afirma o degrau de cada um num período vazio do
// calendário (abril/2031), para que a população do teste seja exatamente a semeada.

import { inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { contacts, conversations, leads } from "@/db/schema";
import { computeFunnelStages } from "./dashboard-queries";
import { FUNNEL_STAGES } from "./dashboard-types";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const DE = new Date("2031-04-01T00:00:00.000Z");
const ATE = new Date("2031-04-02T23:59:59.000Z");
const BASE = Date.parse("2031-04-01T12:00:00.000Z");
const FORA_DO_PERIODO = new Date("2031-03-15T12:00:00.000Z");

const TELEFONE_DO_QUALIFICADO = "5562931030001";
const TELEFONE_DO_PERDIDO = "5562931030002";
const TELEFONE_DO_SIMULADO = "5562931030003";

const conversas: string[] = [];
const contatos: string[] = [];

async function limpar(): Promise<void> {
	if (conversas.length > 0) {
		await db.delete(leads).where(inArray(leads.conversationId, conversas));
		await db.delete(conversations).where(inArray(conversations.id, conversas));
	}
	if (contatos.length > 0) await db.delete(contacts).where(inArray(contacts.id, contatos));
	conversas.length = 0;
	contatos.length = 0;
}

beforeEach(limpar);
afterAll(limpar);

async function semearLead(dados: {
	telefone?: string;
	simulado?: boolean;
	contatoId?: string;
	estagio: "novo" | "qualificado" | "perdido";
	criadoEm?: Date;
}): Promise<void> {
	const [conversa] = await db
		.insert(conversations)
		.values({
			channel: "web",
			status: "active",
			isSimulated: dados.simulado ?? false,
			contactId: dados.contatoId ?? null,
			createdAt: new Date(BASE),
			updatedAt: new Date(BASE),
		})
		.returning({ id: conversations.id });
	const conversaId = conversa?.id as string;
	conversas.push(conversaId);

	await db.insert(leads).values({
		conversationId: conversaId,
		contactId: dados.contatoId ?? null,
		phone: dados.telefone ?? null,
		stage: dados.estagio,
		isSimulated: dados.simulado ?? false,
		createdAt: dados.criadoEm ?? new Date(BASE),
		updatedAt: dados.criadoEm ?? new Date(BASE),
	});
}

async function semearTudo(): Promise<void> {
	// O contato existe e o CPF foi coletado, mas o lead não tem telefone nem
	// e-mail: é o caso que o promotor antigo de estágio mandava para
	// `qualificado` (P201/P226/P272).
	const [contato] = await db
		.insert(contacts)
		.values({ cpf: "52998224725", name: "Só CPF" })
		.returning({ id: contacts.id });
	const contatoId = contato?.id as string;
	contatos.push(contatoId);

	await semearLead({ contatoId, estagio: "novo" });
	await semearLead({ telefone: TELEFONE_DO_QUALIFICADO, estagio: "qualificado" });
	await semearLead({ telefone: TELEFONE_DO_PERDIDO, estagio: "perdido" });
	// Nem o simulado nem o de janeiro entram no número da operação.
	await semearLead({ telefone: TELEFONE_DO_SIMULADO, estagio: "qualificado", simulado: true });
	await semearLead({ estagio: "novo", criadoEm: FORA_DO_PERIODO });
}

describeIfDb("a população do funil do Dashboard", () => {
	// P201 — cada degrau conta o estágio do BANCO, e só do período real.
	it("conta só o lead real do período, no estágio gravado", async () => {
		await semearTudo();
		const etapas = await computeFunnelStages(DE, ATE);
		const porEstagio = new Map(etapas.map((etapa) => [etapa.stage, etapa.count]));

		// O CPF isolado está em `novo`, e o único qualificado é o que tem telefone.
		expect(porEstagio.get("novo")).toBe(1);
		expect(porEstagio.get("qualificado")).toBe(1);
		expect(etapas.reduce((soma, etapa) => soma + etapa.count, 0)).toBe(2);
		// `perdido` é raia terminal, não degrau: fica fora da escada.
		expect(etapas.map((etapa) => etapa.stage)).toEqual(FUNNEL_STAGES.map((degrau) => degrau.stage));
		expect(porEstagio.has("perdido")).toBe(false);
	});

	// A escada é derivada do PRIMEIRO degrau: com a população acima, `novo` é o
	// denominador (1) e `qualificado` fica em 100% dele, sem queda entre os dois.
	it("a escada é derivada do primeiro degrau da população semeada", async () => {
		await semearTudo();
		const etapas = await computeFunnelStages(DE, ATE);
		const novo = etapas.find((etapa) => etapa.stage === "novo");
		const qualificado = etapas.find((etapa) => etapa.stage === "qualificado");

		expect(novo?.percentOfTotal).toBe(100);
		expect(qualificado?.percentOfTotal).toBe(100);
		expect(qualificado?.dropOffRate).toBe(0);
		// Um degrau sem lead nenhum não inventa queda nem percentual.
		expect(etapas.find((etapa) => etapa.stage === "engajado")).toMatchObject({
			count: 0,
			percentOfTotal: 0,
		});
	});
});
