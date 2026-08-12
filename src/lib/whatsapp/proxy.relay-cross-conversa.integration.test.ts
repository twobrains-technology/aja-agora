// Produção, 2026-08 (OC-31) — o cliente ficou falando sozinho.
//
// A armadilha exige duas conversas da MESMA pessoa, coisa comum: ele começa no
// WhatsApp, um atendente assume ali, e depois ele volta pela web (ou o
// contrário). O código então diverge sobre quem é "o caso":
//
//   • `route.ts` pergunta pela PESSOA — `quemRespondePara(waId)` varre todas as
//     conversas `handed_off` e casa por telefone normalizado. Acha o humano,
//     cala o agente e escreve "Mensagem enviada para Fulano. Aguarde a resposta
//     aqui.";
//   • `relayWebUserToAgent` pergunta pela LINHA — `conv.status !== "handed_off"`
//     → `return` seco, sem log, sem erro.
//
// Resultado: o agente não responde, o atendente não recebe nada, e o cliente lê
// uma promessa de entrega que não aconteceu. Três handoffs seguiam abertos com
// `closed_at IS NULL`, mantendo a armadilha armada.
//
// O invariante que este teste fixa: quem promete entrega, entrega — ou avisa que
// não deu. `relayWebUserToAgent` passa a resolver pela PESSOA (mesma pergunta do
// `route.ts`) e a devolver se entregou.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const enviadas: Array<{ phone: string; body: string }> = [];

// As conversas deste teste nascem `isSimulated` — sem isso elas entram na
// contagem "ao vivo" da sala de guerra e derrubam o teste de delta do
// `agora-queries`, que roda em paralelo contra o MESMO banco. Com simulated, o
// envio real não acontece e o caminho observável é o barramento do simulador,
// que é justamente onde este teste escuta.
vi.mock("./simulator-bus", async (original) => {
	const real = (await original()) as Record<string, unknown>;
	return {
		...real,
		publishToAttendant: vi.fn((phone: string, body: string) => {
			enviadas.push({ phone, body });
		}),
	};
});

describeIfDb("relay web→atendente atravessa conversas da mesma pessoa (OC-31)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let proxy: typeof import("./proxy");

	const convIds: string[] = [];
	const visitIds: string[] = [];
	const userIds: string[] = [];
	const ATENDENTE_ID = `oc31-atendente-${crypto.randomUUID()}`;
	/** Mesmo telefone nos dois formatos que o banco real guarda. */
	const TELEFONE_WHATSAPP = "556299887711";
	const TELEFONE_WEB = "62999887711";

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		proxy = await import("./proxy");

		// Sem atendente ativo não há a quem entregar, e o teste mediria o ambiente
		// em vez do roteamento. Semeia UM, com telefone próprio.
		await db.insert(schema.user).values({
			id: ATENDENTE_ID,
			name: "Atendente OC31",
			email: `${ATENDENTE_ID}@teste.local`,
			role: "attendant",
			phone: "5562990000001",
			isActive: true,
		});
		userIds.push(ATENDENTE_ID);
	});

	afterAll(async () => {
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (visitIds.length > 0) {
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitIds));
		}
		if (userIds.length > 0) {
			await db.delete(schema.user).where(inArray(schema.user.id, userIds));
		}
	});

	async function semear(waId: string, status: "active" | "handed_off") {
		const [conv] = await db
			.insert(schema.conversations)
			.values({
				waId,
				status,
				contactName: "Cliente OC31",
				// Ver a nota do mock: mantém estas conversas fora da contagem "ao vivo"
				// da sala de guerra, que é medida por delta em paralelo.
				isSimulated: true,
			})
			.returning();
		convIds.push(conv.id);
		return conv;
	}

	it("entrega ao atendente mesmo quando o atendimento vive em OUTRA conversa da pessoa", async () => {
		// O humano assumiu no WhatsApp…
		await semear(TELEFONE_WHATSAPP, "handed_off");
		// …e o cliente escreve pela web, onde a conversa segue `active`.
		const naWeb = await semear(TELEFONE_WEB, "active");

		enviadas.length = 0;
		const entregou = await proxy.relayWebUserToAgent(naWeb.id, "alguém aí?", "Cliente OC31");

		expect(entregou).toBe(true);
		expect(enviadas.length).toBeGreaterThan(0);
		expect(enviadas.some((e) => e.body.includes("alguém aí?"))).toBe(true);
	});

	it("sem nenhum humano no caso, devolve false — quem chamou não pode prometer entrega", async () => {
		const sozinha = await semear("5562988110022", "active");

		enviadas.length = 0;
		const entregou = await proxy.relayWebUserToAgent(sozinha.id, "oi", "Cliente OC31");

		expect(entregou).toBe(false);
		expect(enviadas).toHaveLength(0);
	});

	it("conversa handed_off nela mesma continua entregando (caminho que já funcionava)", async () => {
		const propria = await semear("5562988110033", "handed_off");

		enviadas.length = 0;
		const entregou = await proxy.relayWebUserToAgent(propria.id, "tem alguém?", "Cliente OC31");

		expect(entregou).toBe(true);
		expect(enviadas.some((e) => e.body.includes("tem alguém?"))).toBe(true);
	});

	it("o handoff aberto some quando a conversa é encerrada — a armadilha não fica armada", async () => {
		const encerrada = await semear("5562988110044", "handed_off");
		await db
			.update(schema.conversations)
			.set({ status: "active" })
			.where(eq(schema.conversations.id, encerrada.id));

		enviadas.length = 0;
		expect(await proxy.relayWebUserToAgent(encerrada.id, "oi", "Cliente OC31")).toBe(false);
	});
});
