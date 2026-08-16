/**
 * O agente falou por cima do atendente (prod, 2026-08-10).
 *
 * O caso, exatamente como aconteceu: o atendente assumiu o caso pelo painel — o
 * que marcou a conversa WEB (`62992496793`) como `handed_off` — e o cliente
 * respondeu pelo WHATSAPP, que é outra conversa (`556292496793`, o formato que a
 * Meta usa para número brasileiro, sem o nono dígito) e estava `active`.
 *
 * `getHandoffState` comparava `waId` por igualdade exata de string. Os dois
 * formatos nunca batem, então o webhook não via trava nenhuma e o agente
 * respondeu enquanto um humano atendia.
 *
 * A raia do funil não participa disso: o lead estava em "Perdido" e isso não tem
 * efeito nenhum sobre quem responde — `transitionLeadStage` não toca em
 * `conversations.status`. Este teste também prende essa ausência de acoplamento.
 *
 * Skip se DATABASE_URL ausente (mesmo padrão dos demais .integration).
 */

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** O mesmo aparelho, nos dois formatos em que o sistema o gravou. */
const WA_WEB = "62992496793";
const WA_WHATSAPP = "556292496793";
/** Outra pessoa — controle: não pode ser afetada pela trava alheia. */
const WA_TERCEIRO = "11988887777";

describeIfDb("quem responde o cliente — trava por pessoa, não por conversa", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let quemRespondePara: typeof import("./quem-responde").quemRespondePara;

	const convIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ quemRespondePara } = await import("./quem-responde"));

		const [web] = await db
			.insert(schema.conversations)
			.values({ waId: WA_WEB, channel: "web", status: "handed_off" })
			.returning();

		const [zap] = await db
			.insert(schema.conversations)
			.values({ waId: WA_WHATSAPP, channel: "whatsapp", status: "active" })
			.returning();

		const [terceiro] = await db
			.insert(schema.conversations)
			.values({ waId: WA_TERCEIRO, channel: "whatsapp", status: "active" })
			.returning();

		convIds.push(web.id, zap.id, terceiro.id);
	});

	afterAll(async () => {
		if (convIds.length) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
	});

	it("cliente que responde pelo WhatsApp cai no HUMANO, mesmo com o handoff na conversa web", async () => {
		const decisao = await quemRespondePara(WA_WHATSAPP);
		expect(decisao.quem).toBe("humano");
	});

	it("aponta para a conversa do ATENDIMENTO, não para a do canal de entrada", async () => {
		const decisao = await quemRespondePara(WA_WHATSAPP);
		// A mensagem do cliente tem que aparecer onde o atendente está olhando.
		if (decisao.quem !== "humano") throw new Error("esperava humano");
		expect(decisao.conversationId).toBe(convIds[0]);
	});

	it("o mesmo vale pelo lado da web — a trava é da pessoa", async () => {
		expect((await quemRespondePara(WA_WEB)).quem).toBe("humano");
	});

	it("reconhece o número com pontuação e com DDI", async () => {
		expect((await quemRespondePara("+55 (62) 99249-6793")).quem).toBe("humano");
		expect((await quemRespondePara("5562992496793")).quem).toBe("humano");
	});

	it("não vaza para OUTRO cliente — quem não tem humano no caso segue com o agente", async () => {
		expect((await quemRespondePara(WA_TERCEIRO)).quem).toBe("agente");
	});

	it("sem identificador, o agente responde — não trava a conversa nova por precaução", async () => {
		expect((await quemRespondePara(null)).quem).toBe("agente");
		expect((await quemRespondePara("")).quem).toBe("agente");
	});

	// A EXCEÇÃO VIVA, catalogada em 2026-08-16.
	//
	// `route.ts` já assumia o turno quando o relay falhava ("handoff sem
	// destinatário — nenhum atendente recebeu"), mas isso existia só como
	// console.warn: qualquer feature construída sobre este contrato herdava a
	// exceção sem saber que ela existia. A acolhida N1 foi a primeira a ser
	// construída em cima dele — daí o nome sair do log e virar campo.
	it("atendimento aberto que NINGUÉM assumiu é sinalizado, sem mudar quem responde", async () => {
		const decisao = await quemRespondePara(WA_WHATSAPP);
		if (decisao.quem !== "humano") throw new Error("esperava humano");
		// A trava continua de pé — o comportamento não muda…
		expect(decisao.handedOffUserId).toBeNull();
		// …mas agora o estado tem nome para quem for decidir depois.
		expect(decisao.semDestinatario).toBe(true);
	});

	it("quando o agente responde, o contrato diz POR QUÊ", async () => {
		const decisao = await quemRespondePara(WA_TERCEIRO);
		if (decisao.quem !== "agente") throw new Error("esperava agente");
		expect(decisao.motivo).toBe("sem-atendimento-aberto");
	});
});
