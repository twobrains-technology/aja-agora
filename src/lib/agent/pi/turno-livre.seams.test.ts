// OS SEAMS DO MOTOR (Bloco 1 do playground): `caixa`, `simularCota`, `gateway` e
// `semCapturarContato` entram por injeção e, sem eles, o turno é o de sempre.
// Espiões provam que o gateway real e a caixa do banco ficam com ZERO chamadas.
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, leads, messages, usoDeIa } from "@/db/schema";
import type { ProposalGateway } from "@/lib/adapters/proposal-gateway";
import type { GroupSummary } from "@/lib/adapters/types";
import type { Caixa } from "@/lib/agent/box/caixa";

const { getProposalGatewaySpy, startContractSpy, lerCaixaSpy } = vi.hoisted(() => ({
	getProposalGatewaySpy: vi.fn(() => {
		throw new Error("gateway real não pode ser tocado");
	}),
	startContractSpy: vi.fn(async () => {
		throw new Error("parou aqui");
	}),
	lerCaixaSpy: vi.fn(),
}));

vi.mock("@/lib/adapters/proposal-gateway", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/adapters/proposal-gateway")>()),
	getProposalGateway: getProposalGatewaySpy,
}));
vi.mock("@/lib/bevi/fulfillment", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/bevi/fulfillment")>()),
	startContract: startContractSpy,
}));
vi.mock("@/lib/agent/box/caixa", async (importOriginal) => {
	const real = await importOriginal<typeof import("@/lib/agent/box/caixa")>();
	return {
		...real,
		lerCaixa: (...a: Parameters<typeof real.lerCaixa>) => {
			lerCaixaSpy();
			return real.lerCaixa(...a);
		},
	};
});

import { subirServidorRoteirizado } from "./testing/servidor-roteirizado";
import { buildToolsLivres, type ContextoDasTools } from "./tools-livres";
import { createRunTurnLivre } from "./turno-livre";

const criadas: string[] = [];
afterEach(async () => {
	vi.clearAllMocks();
	vi.unstubAllEnvs();
	for (const id of criadas.splice(0)) {
		await db.delete(leads).where(eq(leads.conversationId, id));
		await db.delete(usoDeIa).where(eq(usoDeIa.conversationId, id));
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

const cartas: GroupSummary[] = [
	{
		id: "grupo-1",
		administradora: "ITAU",
		category: "auto",
		creditValue: 80_000,
		monthlyPayment: 812,
		adminFeePercent: 18,
		termMonths: 120,
		totalParticipants: 900,
		availableSlots: 12,
	},
];

async function rodar(
	userText: string,
	extra: Parameters<typeof createRunTurnLivre>[0] = {},
	beats: Parameters<typeof subirServidorRoteirizado>[0] = [{ text: "ok" }],
) {
	const conversationId = await novaConversa();
	const servidor = await subirServidorRoteirizado(beats);
	const run = createRunTurnLivre({
		provider: { id: "litellm", baseUrl: servidor.url, apiKey: "teste", model: "roteirizado" },
		busca: async () => cartas,
		...extra,
	});
	for await (const _ of run({
		channel: "web",
		conversationId,
		userText,
		isUserTurn: true,
		contactName: null,
	}));
	const sistema = servidor.ultimoSistema();
	await servidor.fechar();
	return { conversationId, sistema };
}

describe("seam `caixa` — a conduta injetada governa o turno", () => {
	it("o system do modelo traz a conduta injetada e a caixa do banco não é lida", async () => {
		const caixa: Caixa = {
			nome: "playground",
			label: "teste",
			versao: 7,
			texto: "CONDUTA-INJETADA-XYZ",
			origem: "banco",
		};
		const { sistema } = await rodar("oi", { caixa });
		expect(sistema).toContain("CONDUTA-INJETADA-XYZ");
		expect(lerCaixaSpy).not.toHaveBeenCalled();
	});

	it("sem `caixa` o turno lê a caixa como sempre", async () => {
		await rodar("oi");
		expect(lerCaixaSpy).toHaveBeenCalled();
	});
});

describe("seam `semCapturarContato` — o celular dito não vira lead", () => {
	it("default: o celular dito cria o lead (comportamento de produção)", async () => {
		const { conversationId } = await rodar("meu whatsapp é 11987654321");
		const l = await db.query.leads.findFirst({ where: eq(leads.conversationId, conversationId) });
		expect(l).toBeTruthy();
		expect(l?.isSimulated).toBe(true);
	});

	it("com a flag: nenhum lead é criado e o waId não é reescrito", async () => {
		const { conversationId } = await rodar("meu whatsapp é 11987654321", {
			semCapturarContato: true,
		});
		const l = await db.query.leads.findFirst({ where: eq(leads.conversationId, conversationId) });
		expect(l).toBeUndefined();
		const c = await db.query.conversations.findFirst({
			where: eq(conversations.id, conversationId),
		});
		expect(c?.waId ?? null).toBeNull();
	});
});

describe("seam `gateway` — o fecho usa o gateway injetado", () => {
	it("startContract recebe o gateway da dep; o getProposalGateway real fica em zero", async () => {
		const conversationId = await novaConversa();
		const gateway = { createProposal: vi.fn() } as unknown as ProposalGateway;
		const ctx: ContextoDasTools = {
			conversationId,
			channel: "web",
			userText: null,
			nomeDoCliente: null,
			cards: [],
			falasDoFecho: [],
			cartasNaTela: [
				{
					groupId: "grupo-1",
					administradora: "Canopus",
					carta: 80_000,
					parcela: 1_200,
					prazoMeses: 96,
				},
			],
			gruposRevelados: new Map(),
			pediuHumano: false,
			estadoDepoisDaBusca: null,
		};
		// Identidade sintética, montada em tempo de execução (nenhum CPF no arquivo).
		const base = [1, 2, 3, 4, 5, 6, 7, 8, 9];
		const dv = (n: number[]) => {
			const soma = n.reduce((a, d, i) => a + d * (n.length + 1 - i), 0);
			const r = (soma * 10) % 11;
			return r === 10 ? 0 : r;
		};
		const d1 = dv(base);
		const cpf = [...base, d1, dv([...base, d1])].join("");
		vi.stubEnv("IDENTITY_ENC_KEY", Buffer.alloc(32, 7).toString("base64"));
		const { storeIdentity } = await import("@/lib/conversation/identity");
		await storeIdentity(conversationId, { cpf, celular: "11987654321" });

		const tools = buildToolsLivres(ctx, { gateway }) as unknown as Record<
			string,
			{ execute: (i: unknown, o: unknown) => Promise<unknown> }
		>;
		await tools.fazer_proposta.execute(
			{ groupId: "grupo-1", aceiteLgpd: true },
			{ toolCallId: "c1", messages: [] },
		);

		expect(startContractSpy).toHaveBeenCalledTimes(1);
		expect((startContractSpy.mock.calls[0] as unknown[])[2]).toBe(gateway);
		expect(getProposalGatewaySpy).not.toHaveBeenCalled();
	});
});
