// O WATCHDOG DA CONVERSA SEM RESPOSTA, contra o banco de verdade.
//
// Ele existe porque a fonte antiga (marcador de pendência do funil) era escrita
// PELO TURNO: se o turno morresse no meio — ou nunca rodasse —, não havia
// marcador e a conversa ficava invisível para sempre. Já aconteceu: cliente
// escreveu três vezes e não houve trace nenhum, nem do agente nem da mesa. Esta
// fonte não depende de escrita alguma; olha o estado observável (a última
// mensagem é do cliente, e faz tempo).

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { artifacts, conversations, messages } from "@/db/schema";
import { findConversasSemResposta, runRetomadaCycle } from "./retomada-cycle";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const AGORA = new Date("2026-08-13T18:00:00.000Z");
const MINUTOS = (n: number) => new Date(AGORA.getTime() - n * 60_000);

/** Semeado neste arquivo, para apagar entre testes. */
const criadas: string[] = [];

/** Cada teste parte de um banco limpo: a lista do watchdog tem `LIMIT`, e
 * conversa de teste anterior empurrando a do teste atual para fora do limite é
 * falha de teste, não defeito de código. */
async function limpar(): Promise<void> {
	if (criadas.length === 0) return;
	await db.delete(messages).where(inArray(messages.conversationId, criadas));
	await db.delete(conversations).where(inArray(conversations.id, criadas));
	criadas.length = 0;
}

beforeEach(limpar);
afterAll(limpar);

async function semear(opts: {
	role: "user" | "assistant";
	quandoMin: number;
	simulada?: boolean;
	status?: "active" | "handed_off";
	metadata?: Record<string, unknown>;
}): Promise<string> {
	const [conv] = await db
		.insert(conversations)
		.values({
			channel: "web",
			status: opts.status ?? "active",
			isSimulated: opts.simulada ?? false,
			metadata: opts.metadata ?? {},
		})
		.returning({ id: conversations.id });
	const id = conv?.id as string;
	await db.insert(messages).values({
		conversationId: id,
		role: opts.role,
		content: "oi",
		channel: "web",
		createdAt: MINUTOS(opts.quandoMin),
	});
	criadas.push(id);
	return id;
}

/** Um card de comparação persistido — a carta que o cliente VIU na tela. */
async function semearCartaVista(
	conversationId: string,
	carta: { id: string; administradora: string; creditValue: number; monthlyPayment: number },
): Promise<void> {
	const [msg] = await db
		.insert(messages)
		.values({
			conversationId,
			role: "assistant",
			content: "Aqui estão as cartas",
			channel: "web",
			createdAt: MINUTOS(11),
		})
		.returning({ id: messages.id });
	await db.insert(artifacts).values({
		messageId: msg?.id as string,
		type: "comparison_table",
		payload: { groups: [{ ...carta, termMonths: 96 }] },
	});
}

describeIfDb("o watchdog — cliente falou e ninguém respondeu", () => {
	it("acha só quem está de fato esperando", async () => {
		const esperando = await semear({ role: "user", quandoMin: 10 });
		const respondida = await semear({ role: "assistant", quandoMin: 10 });
		const simulada = await semear({ role: "user", quandoMin: 10, simulada: true });
		const antiga = await semear({ role: "user", quandoMin: 60 * 30 }); // > 24h
		const recente = await semear({ role: "user", quandoMin: 1 }); // dentro do teto

		const achadas = (await findConversasSemResposta(AGORA)).map((r) => r.id);

		expect(achadas).toContain(esperando);
		// A conversa cuja última fala é do AGENTE não está esperando ninguém.
		expect(achadas).not.toContain(respondida);
		// Simulada é teste interno, não cliente.
		expect(achadas).not.toContain(simulada);
		// Fora da janela de 24h o WhatsApp não entrega texto livre — retomada
		// tardia é outra feature, com template e mesa.
		expect(achadas).not.toContain(antiga);
		// E não se cobra quem acabou de falar.
		expect(achadas).not.toContain(recente);
	});

	it("dispara a retomada uma vez e respeita o backoff", async () => {
		const id = await semear({ role: "user", quandoMin: 10 });

		const disparos: string[] = [];
		const dispara = async ({ conversationId }: { conversationId: string }) => {
			if (conversationId === id) disparos.push(conversationId);
		};

		await runRetomadaCycle({ now: AGORA, dispara });
		expect(disparos.length).toBe(1);

		// Segundo ciclo IMEDIATO: o backoff segura. Sem isso, um cron de 30 s
		// bombardearia o cliente.
		await runRetomadaCycle({ now: AGORA, dispara });
		expect(disparos.length).toBe(1);

		// E o contador ficou gravado na conversa.
		const [conv] = await db
			.select({ metadata: conversations.metadata })
			.from(conversations)
			.where(eq(conversations.id, id));
		expect((conv?.metadata as { retomada?: { attempts: number } }).retomada?.attempts).toBe(1);
	});

	it("não retoma conversa que já está com humano ou fechada", async () => {
		const comHumano = await semear({
			role: "user",
			quandoMin: 10,
			metadata: { handoffSuggested: true },
		});
		const contratoFechado = await semear({
			role: "user",
			quandoMin: 10,
			metadata: { contractClosed: true },
		});

		const disparos: string[] = [];
		await runRetomadaCycle({
			now: AGORA,
			dispara: async ({ conversationId }) => {
				disparos.push(conversationId);
			},
		});
		expect(disparos).not.toContain(comHumano);
		expect(disparos).not.toContain(contratoFechado);
	});

	it("L37: sem oferta gravada, o turno de retomada cita a ÚLTIMA carta mostrada", async () => {
		// O caso medido: o vendedor livre mostra a comparação e não grava
		// `recommendedOffer`; a retomada anunciava "não viu nenhuma oferta" para
		// quem tinha visto três cartas na tela.
		const id = await semear({ role: "user", quandoMin: 10 });
		await semearCartaVista(id, {
			id: "grupo-da-tela",
			administradora: "RODOBENS",
			creditValue: 95_000,
			monthlyPayment: 890,
		});

		let directive = "";
		await runRetomadaCycle({
			now: AGORA,
			dispara: async ({ conversationId, directive: d }) => {
				if (conversationId === id) directive = d;
			},
		});

		expect(directive).toContain("95.000");
		expect(directive).toContain("RODOBENS");
		expect(directive).not.toContain("nenhuma oferta");
	});

	it("L37: a oferta GRAVADA pelo vendedor tem precedência sobre a carta antiga", async () => {
		const id = await semear({
			role: "user",
			quandoMin: 10,
			metadata: {
				recommendedOffer: {
					administradora: "CANOPUS",
					creditValue: 119_500,
					monthlyPayment: 1_092,
					termMonths: 96,
				},
			},
		});
		await semearCartaVista(id, {
			id: "grupo-antigo",
			administradora: "RODOBENS",
			creditValue: 95_000,
			monthlyPayment: 890,
		});

		let directive = "";
		await runRetomadaCycle({
			now: AGORA,
			dispara: async ({ conversationId, directive: d }) => {
				if (conversationId === id) directive = d;
			},
		});

		expect(directive).toContain("119.500");
		expect(directive).toContain("CANOPUS");
	});
});
