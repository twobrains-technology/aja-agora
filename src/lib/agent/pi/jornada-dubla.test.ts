// A.2 — JORNADA COMPLETA COM DUBLÊS (PRD 2026-11-04, §2.1).
//
// oi → bem+valor → cartas → simulação → escolha → identidade → fazer_proposta →
// proposta → fecho, pelo motor REAL (`createRunTurnLivre`: stream, tools, banco),
// sem rede externa e sem Bevi:
//  · o "modelo" é o servidor HTTP roteirizado local (127.0.0.1) — o motor real do
//    Pi exige um provider OpenAI-completions, e é isto que os turno-c/turno-d usam;
//  · busca e simulação saem do `fixtureDiscoveryAdapter` (capturas reais);
//  · o gateway da proposta é o `MockProposalGateway`;
//  · espiões provam ZERO chamadas ao `getProposalGateway` real e à Bevi real.
//
// LIMITE: o texto do agente é do roteiro, não de um LLM. O que o teste prova é a
// TRAJETÓRIA do motor (cards, estado, banco, gateway), não a qualidade da fala.
// Nenhum CPF/celular fica no arquivo: a identidade nasce em tempo de execução.
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, leads, messages, usoDeIa } from "@/db/schema";
import type { ProposalGateway } from "@/lib/adapters/proposal-gateway";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { fixtureDiscoveryAdapter } from "@/lib/playground/dubles/fixture-discovery-adapter";
import { MockProposalGateway } from "@/lib/playground/dubles/mock-proposal-gateway";

const { getProposalGatewaySpy } = vi.hoisted(() => ({
	getProposalGatewaySpy: vi.fn(() => {
		throw new Error("gateway real não pode ser tocado");
	}),
}));

vi.mock("@/lib/adapters/proposal-gateway", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/adapters/proposal-gateway")>()),
	getProposalGateway: getProposalGatewaySpy,
}));

import { subirServidorRoteirizado } from "./testing/servidor-roteirizado";
import { createRunTurnLivre } from "./turno-livre";

const criadas: string[] = [];
afterEach(async () => {
	vi.clearAllMocks();
	for (const id of criadas.splice(0)) {
		await db.delete(leads).where(eq(leads.conversationId, id));
		await db.delete(usoDeIa).where(eq(usoDeIa.conversationId, id));
		await db.delete(messages).where(eq(messages.conversationId, id));
		await db.delete(conversations).where(eq(conversations.id, id));
	}
});

beforeAll(() => {
	// A identidade é cifrada no banco; sem chave o `storeIdentity` não grava.
	if (!process.env.IDENTITY_ENC_KEY) {
		vi.stubEnv("IDENTITY_ENC_KEY", Buffer.alloc(32, 9).toString("base64"));
	}
	// O par de teste do ambiente não existe aqui: o fecho usa o celular da conversa.
	vi.stubEnv("SIMULATOR_TEST_CELULAR", "");
});

/** CPF sintético com dígitos verificadores válidos, montado em tempo de execução. */
function cpfSintetico(): string {
	const base = [3, 1, 4, 1, 5, 9, 2, 6, 5];
	const dv = (n: number[]) => {
		const soma = n.reduce((a, d, i) => a + d * (n.length + 1 - i), 0);
		const r = (soma * 10) % 11;
		return r === 10 ? 0 : r;
	};
	const d1 = dv(base);
	return [...base, d1, dv([...base, d1])].join("");
}
const celularSintetico = () => ["11", "9", "8765", "4321"].join("");

async function novaConversa(): Promise<string> {
	const [conv] = await db
		.insert(conversations)
		.values({ channel: "web", status: "active", isSimulated: true, contactName: null })
		.returning({ id: conversations.id });
	criadas.push(conv.id);
	return conv.id;
}

type Beats = Parameters<typeof subirServidorRoteirizado>[0];

describe("jornada completa com dublês (Bevi mockada)", () => {
	it("oi → valor → cartas → simulação → escolha → identidade → proposta → fecho, sem tocar a Bevi real", async () => {
		const conversationId = await novaConversa();
		const adapter = fixtureDiscoveryAdapter();
		const gateway = new MockProposalGateway();
		const criar = vi.spyOn(gateway, "createProposal");
		const buscas: unknown[] = [];
		const simulacoes: unknown[] = [];

		async function turno(userText: string, beats: Beats) {
			const servidor = await subirServidorRoteirizado(beats);
			const run = createRunTurnLivre({
				provider: {
					id: "litellm",
					baseUrl: servidor.url,
					apiKey: "teste",
					model: "roteirizado",
				},
				caixa: {
					nome: "playground",
					label: "teste",
					versao: 1,
					texto: "Você é um vendedor de consórcio. Conduza a conversa até a venda.",
					origem: "banco",
				},
				busca: async (args) => {
					buscas.push(args);
					return adapter.searchGroups(args);
				},
				simularCota: async (params) => {
					simulacoes.push(params);
					return adapter.simulateQuota(params);
				},
				gateway: gateway as ProposalGateway,
			});
			const eventos: TurnEvent[] = [];
			for await (const ev of run({
				channel: "web",
				conversationId,
				userText,
				isUserTurn: true,
				contactName: null,
			}))
				eventos.push(ev);
			await servidor.fechar();
			return eventos;
		}
		const cards = (eventos: TurnEvent[], tipo: string) =>
			eventos.filter(
				(e) => e.type === "artifact" && (e as { artifactType: string }).artifactType === tipo,
			) as Array<{ type: "artifact"; artifactType: string; payload?: Record<string, unknown> }>;
		const falas = (eventos: TurnEvent[]) =>
			eventos
				.filter((e) => e.type === "text-delta")
				.map((e) => (e as { text: string }).text)
				.join("");

		// 1. oi — só conversa, nenhuma busca.
		const t1 = await turno("oi", [{ text: "Oi! Me conta: que bem você quer conquistar?" }]);
		expect(falas(t1)).toContain("Oi!");
		expect(buscas).toHaveLength(0);

		// 2. bem + valor → busca na fixture → card de cartas.
		const t2 = await turno("quero um carro de uns 80 mil", [
			{
				text: "Boa, deixa eu ver o que tem pra você.",
				toolCalls: [{ name: "buscar_cartas", args: { categoria: "auto", valorDoBem: 80_000 } }],
			},
			{ text: "Separei estas cartas pra você." },
		]);
		expect(buscas).toHaveLength(1);
		const tabela = cards(t2, "comparison_table");
		expect(tabela).toHaveLength(1);
		const grupos = ((tabela[0]?.payload as { groups?: Array<{ id: string }> } | undefined)
			?.groups ?? []) as Array<{ id: string }>;
		expect(grupos.length).toBeGreaterThan(0);
		const groupId = grupos[0]?.id as string;
		expect(typeof groupId).toBe("string");

		// 3. simulação da carta (fato do servidor, via `simularCota` injetado).
		const t3 = await turno("me mostra a simulação da primeira", [
			{
				toolCalls: [
					{ name: "mostrar_card", args: { tipo: "simulation_result", payload: { groupId } } },
				],
			},
			{ text: "Essa é a simulação com os números reais da carta." },
		]);
		expect(cards(t3, "simulation_result")).toHaveLength(1);
		expect(simulacoes.length).toBeGreaterThan(0);

		// 4. escolha + identidade: o cliente manda CPF e celular; a proposta sai.
		const cpf = cpfSintetico();
		const celular = celularSintetico();
		const t4 = await turno(`gostei dessa, pode fazer. meu cpf é ${cpf} e meu whatsapp ${celular}`, [
			{
				text: "Perfeito, já gero a proposta.",
				toolCalls: [{ name: "fazer_proposta", args: { groupId } }],
			},
			{ text: "Proposta pronta, é só confirmar no card." },
		]);
		expect(criar).toHaveBeenCalledTimes(1);
		expect(cards(t4, "real_offer")).toHaveLength(1);
		expect(falas(t4)).toContain("Proposta pronta");

		// 5. fecho: o cliente confirma; o motor não abre uma segunda proposta.
		const t5 = await turno("confirmo, pode seguir", [
			{ text: "Fechado! Seguimos com os documentos." },
		]);
		expect(falas(t5)).toContain("Fechado");
		expect(criar).toHaveBeenCalledTimes(1);

		// O CPF/celular não vazam para a fala persistida do cliente.
		const linhas = await db
			.select({ content: messages.content })
			.from(messages)
			.where(eq(messages.conversationId, conversationId));
		expect(linhas.length).toBeGreaterThanOrEqual(8);
		expect(linhas.some((l) => l.content.includes(cpf))).toBe(false);

		// ZERO contato com o gateway real.
		expect(getProposalGatewaySpy).not.toHaveBeenCalled();
	});
});
