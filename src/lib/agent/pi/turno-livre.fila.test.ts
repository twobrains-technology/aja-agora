// A FILA DE VENDEDORES NO TURNO (F2/U4): o fato da fila entra no system, a tool do turno chama o
// dublê injetado, o balão fixo de transferência só sai na rota da mesa e o marcador da fila é
// regravado DEPOIS da persistência do turno (`persistMeta` apagaria o marcador).
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, mesaHandoffs, messages } from "@/db/schema";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";

const { regravarSpy, persistirSpy, propostaSpy } = vi.hoisted(() => ({
	regravarSpy: vi.fn(async () => {}),
	persistirSpy: vi.fn(),
	propostaSpy: vi.fn(async () => null as unknown),
}));

vi.mock("@/lib/whatsapp/proxy", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/whatsapp/proxy")>()),
	regravarMarcadorDaFila: regravarSpy,
}));
vi.mock("@/lib/agent/pi/persist-livre", async (importOriginal) => {
	const real = await importOriginal<typeof import("@/lib/agent/pi/persist-livre")>();
	return {
		...real,
		persistirTurnoLivre: (...a: Parameters<typeof real.persistirTurnoLivre>) => {
			persistirSpy();
			return real.persistirTurnoLivre(...a);
		},
	};
});
vi.mock("@/lib/bevi/proposal-repo", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/bevi/proposal-repo")>()),
	getLatestBeviProposal: propostaSpy,
}));
vi.mock("@/lib/mesa/dispatch", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/mesa/dispatch")>()),
	anunciarCasoNaMesa: vi.fn(),
}));

import { subirServidorRoteirizado } from "./testing/servidor-roteirizado";
import { createRunTurnLivre } from "./turno-livre";

const criadas: string[] = [];
afterEach(async () => {
	vi.clearAllMocks();
	propostaSpy.mockResolvedValue(null);
	for (const id of criadas.splice(0)) {
		await db.delete(mesaHandoffs).where(eq(mesaHandoffs.conversationId, id));
		await db.delete(messages).where(eq(messages.conversationId, id));
		await db.delete(conversations).where(eq(conversations.id, id));
	}
});

async function novaConversa(): Promise<string> {
	const [conv] = await db
		.insert(conversations)
		.values({ channel: "web", status: "active", isSimulated: true })
		.returning({ id: conversations.id });
	criadas.push(conv.id);
	return conv.id;
}

function dubleDaFila(atendentesAtivos = 0) {
	return {
		chamar: vi.fn(async () => ({
			notificados: atendentesAtivos,
			semAtendentes: !atendentesAtivos,
		})),
		estado: vi.fn(async () => ({ atendentesAtivos, chamadaEm: null, assumidaPor: null })),
	};
}

const AGORA = new Date("2026-11-05T04:12:00Z"); // 01:12 em America/Sao_Paulo

async function rodar(args: {
	userText: string;
	beats: Parameters<typeof subirServidorRoteirizado>[0];
	fila?: ReturnType<typeof dubleDaFila>;
	conversationId?: string;
}) {
	const conversationId = args.conversationId ?? (await novaConversa());
	const fila = args.fila ?? dubleDaFila();
	const servidor = await subirServidorRoteirizado(args.beats);
	const run = createRunTurnLivre({
		provider: { id: "litellm", baseUrl: servidor.url, apiKey: "teste", model: "roteirizado" },
		filaDeVendedores: fila as never,
		agora: () => AGORA,
	});
	const eventos: TurnEvent[] = [];
	for await (const ev of run({
		channel: "web",
		conversationId,
		userText: args.userText,
		isUserTurn: true,
		contactName: null,
	}))
		eventos.push(ev);
	const sistema = servidor.ultimoSistema();
	await servidor.fechar();
	return { conversationId, eventos, sistema, fila, texto: JSON.stringify(eventos) };
}

const CHAMAR = {
	toolCalls: [{ name: "falar_com_humano", args: { motivo: "cliente quer gente" } }],
};
const BALAO_DA_MESA = /abri o caso pra nossa mesa|como você se chama e qual o seu número/i;

describe("fato da fila no system do turno", () => {
	it("traz a hora de São Paulo do `agora` injetado e os vendedores ativos do dublê", async () => {
		const { sistema, fila } = await rodar({ userText: "oi", beats: [{ text: "ok" }] });
		expect(fila.estado).toHaveBeenCalled();
		expect(sistema).toContain("01:12");
		expect(sistema).toContain("05/11/2026");
		expect(sistema).toContain("Vendedores ativos cadastrados: 0");
	});
});

describe("balão fixo de transferência só na rota da mesa", () => {
	it("sem proposta, pedir uma pessoa não solta o balão da mesa (fila: o modelo fala)", async () => {
		const { texto } = await rodar({
			userText: "quero falar com uma pessoa",
			beats: [{ text: "Claro, já te ajudo por aqui." }],
		});
		expect(texto).not.toMatch(BALAO_DA_MESA);
		expect(texto).toContain("já te ajudo por aqui");
	});

	it("com proposta gerada, o balão da mesa continua saindo", async () => {
		propostaSpy.mockResolvedValue({ id: "prop-1" });
		const { texto } = await rodar({
			userText: "quero falar com uma pessoa",
			beats: [{ text: "Claro." }],
		});
		expect(texto).toMatch(BALAO_DA_MESA);
	});

	it("a volta do cliente no meio da transferência não retoma a mesa quando a rota é fila", async () => {
		const conversationId = await novaConversa();
		await db.insert(messages).values({
			conversationId,
			role: "assistant",
			content: "Kairo, abri o caso pra nossa mesa. Um atendente humano assume por aqui.",
		});
		const { texto } = await rodar({
			conversationId,
			userText: "voltei",
			beats: [{ text: "Que bom que voltou, vamos seguir." }],
		});
		expect(texto).not.toContain("Já estou chamando o consultor");
		expect(texto).not.toContain("Me passa seu nome e seu WhatsApp que eu já chamo o consultor");
		expect(texto).toContain("vamos seguir");
	});
});

describe("a tool do turno usa o dublê da fila e o marcador é regravado depois", () => {
	it("falar_com_humano sem proposta chama o dublê e regrava o marcador após a persistência", async () => {
		const { fila, conversationId } = await rodar({
			userText: "e se eu não for contemplado?",
			beats: [CHAMAR, { text: "Já avisei o time e sigo com você." }],
		});
		expect(fila.chamar).toHaveBeenCalledTimes(1);
		expect(regravarSpy).toHaveBeenCalledTimes(1);
		const [idRegravado, data] = regravarSpy.mock.calls[0] as unknown as [string, Date];
		expect(idRegravado).toBe(conversationId);
		expect(data).toBeInstanceOf(Date);
		expect(persistirSpy).toHaveBeenCalled();
		expect(regravarSpy.mock.invocationCallOrder[0]).toBeGreaterThan(
			Math.max(...persistirSpy.mock.invocationCallOrder),
		);
	});

	it("turno sem chamada da fila não regrava marcador", async () => {
		await rodar({ userText: "oi", beats: [{ text: "ok" }] });
		expect(regravarSpy).not.toHaveBeenCalled();
	});
});
