// O ciclo da acolhida N1 — os quatro critérios de aceite da crítica de 16/08.
//
// O cenário de referência é a conversa `75f77efd`: proposta ITAÚ real fechada na
// sexta 14/08 às 19:02, cliente entregue à mesa, cliente escreve, e nenhuma fala
// humana por 28,9 horas.
//
// O teste 3 é o que protege o invariante de 2026-08-10: entre decidir e emitir
// há I/O, e a mesa pode falar nesse intervalo. Falar DEPOIS do atendente é o
// dano pior — pior que não acolher.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";

const CONV = "75f77efd-41a2-4262-9265-21394cc18561";
const AGORA = new Date("2026-08-16T00:30:00-03:00");
const INBOUND = new Date("2026-08-14T19:02:34-03:00");

const PROPOSTA_ITAU = {
	administradora: "ITAÚ",
	creditValue: 211258,
	monthlyPayment: 5445.27,
	termMonths: 47,
};

const mocks = vi.hoisted(() => ({
	persistMeta: vi.fn().mockResolvedValue(undefined),
	meta: {} as ConversationMetadata,
}));

vi.mock("@/lib/conversation/meta", () => ({
	metaOf: () => mocks.meta,
	persistMeta: mocks.persistMeta,
}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ beviProposals: {}, conversations: {}, messages: {} }));

import { runAcolhidaN1Cycle } from "./acolhida-n1-cycle";

function linha(channel: "web" | "whatsapp" = "web") {
	return {
		id: CONV,
		channel,
		waId: channel === "whatsapp" ? "5562992496793" : null,
		contactName: "Ana",
		metadata: {},
		ultimoInboundEm: INBOUND,
	};
}

function deps(over: Record<string, unknown> = {}) {
	return {
		now: AGORA,
		listar: vi.fn(async () => [linha()]),
		lerUltimaFalaDaMesa: vi.fn(async () => null),
		lerProposta: vi.fn(async () => PROPOSTA_ITAU),
		dispara: vi.fn(async () => undefined),
		...over,
	};
}

beforeEach(() => {
	mocks.persistMeta.mockClear();
	mocks.meta = { contractClosed: true } as ConversationMetadata;
});

afterEach(() => vi.clearAllMocks());

describe("runAcolhidaN1Cycle — aceite 1: o cenário 75f77efd", () => {
	it("cliente escreveu, mesa muda → UMA acolhida, com a proposta real e sem prazo inventado", async () => {
		const d = deps();
		const r = await runAcolhidaN1Cycle(d);

		expect(r.acolhidas).toBe(1);
		expect(d.dispara).toHaveBeenCalledTimes(1);

		const { directive, conversationId } = (d.dispara as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(conversationId).toBe(CONV);
		// Cita a proposta REAL registrada…
		expect(directive).toContain("211.258");
		expect(directive).toContain("ITAÚ");
		// …e não inventa prazo nem tempo de espera (§1.3 da crítica).
		expect(directive).not.toMatch(/\b\d+\s*(horas?|dias?|minutos?)\b/i);
		expect(directive.toLowerCase()).toContain("não retome");
	});

	it("grava o contador ANTES de disparar", async () => {
		const ordem: string[] = [];
		mocks.persistMeta.mockImplementation(async () => {
			ordem.push("persist");
		});
		const d = deps({
			dispara: vi.fn(async () => {
				ordem.push("dispara");
			}),
		});
		await runAcolhidaN1Cycle(d);
		expect(ordem).toEqual(["persist", "dispara"]);
	});

	it("sem proposta registrada, acolhe sem afirmar que existe proposta", async () => {
		const d = deps({ lerProposta: vi.fn(async () => null) });
		await runAcolhidaN1Cycle(d);
		const { directive } = (d.dispara as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(directive).not.toContain("R$");
		expect(directive).toContain("NÃO há proposta registrada");
	});
});

describe("runAcolhidaN1Cycle — aceite 2: cinco mensagens, uma acolhida", () => {
	it("a segunda passagem do ciclo não acolhe de novo", async () => {
		const d = deps();
		expect((await runAcolhidaN1Cycle(d)).acolhidas).toBe(1);

		// O ciclo gravou o contador; o estado agora reflete isso.
		mocks.meta = {
			contractClosed: true,
			acolhidaN1: { attempts: 1, lastAt: AGORA.getTime() },
		} as ConversationMetadata;

		const segunda = await runAcolhidaN1Cycle(deps());
		expect(segunda.acolhidas).toBe(0);
		expect(segunda.puladas["ja-acolhida"]).toBe(1);
	});
});

describe("runAcolhidaN1Cycle — aceite 3: a corrida com o atendente", () => {
	it("mesa já havia respondido → nem decide acolher", async () => {
		const d = deps({
			lerUltimaFalaDaMesa: vi.fn(async () => INBOUND.getTime() + 30_000),
		});
		const r = await runAcolhidaN1Cycle(d);
		expect(r.acolhidas).toBe(0);
		expect(r.puladas["mesa-respondeu"]).toBe(1);
		expect(d.dispara).not.toHaveBeenCalled();
	});

	it("mesa fala ENTRE a decisão e a emissão → não emite (o dano pior é falar depois)", async () => {
		// 1ª leitura: mesa muda. 2ª leitura (a re-checagem dentro do ciclo): o
		// atendente acabou de responder.
		const leitura = vi
			.fn<(conversationId: string) => Promise<number | null>>()
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(INBOUND.getTime() + 45_000);

		const d = deps({ lerUltimaFalaDaMesa: leitura });
		const r = await runAcolhidaN1Cycle(d);

		expect(r.acolhidas).toBe(0);
		expect(r.puladas["mesa-respondeu-durante"]).toBe(1);
		expect(d.dispara).not.toHaveBeenCalled();
		// O contador foi gravado assim mesmo: perder uma acolhida é barato, falar
		// por cima de quem atende não é.
		expect(mocks.persistMeta).toHaveBeenCalledTimes(1);
	});
});

describe("runAcolhidaN1Cycle — aceite 4: paridade de canal", () => {
	it("mesmo estado, web e WhatsApp recebem o MESMO directive", async () => {
		const web = deps({ listar: vi.fn(async () => [linha("web")]) });
		await runAcolhidaN1Cycle(web);

		mocks.meta = { contractClosed: true } as ConversationMetadata;
		const zap = deps({ listar: vi.fn(async () => [linha("whatsapp")]) });
		await runAcolhidaN1Cycle(zap);

		const dWeb = (web.dispara as ReturnType<typeof vi.fn>).mock.calls[0][0].directive;
		const dZap = (zap.dispara as ReturnType<typeof vi.fn>).mock.calls[0][0].directive;
		expect(dZap).toBe(dWeb);
	});
});
