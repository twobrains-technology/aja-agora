// O CONTRATO DO MOTOR LIVRE.
//
// Prova, sem Bevi e sem modelo de verdade, o que o mandato exige:
//  · o turno fala (o texto chega AO VIVO no stream);
//  · NENHUM evento `gate` existe — funil fora;
//  · o card nasce do RESULTADO da tool, não de uma `cards do funil`;
//  · a busca grava categoria e reveal na meta;
//  · a fala do cliente é persistida em `messages`.
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import type { GroupSummary } from "@/lib/adapters/types";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { subirServidorRoteirizado } from "./testing/servidor-roteirizado";
import { createRunTurnLivre, eventosDasFalasDoFecho } from "./turno-livre";

const criadas: string[] = [];
afterEach(async () => {
	for (const id of criadas.splice(0)) {
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
		id: "grupo-itaú-1",
		administradora: "ITAU",
		category: "auto",
		creditValue: 80_000,
		monthlyPayment: 812,
		adminFeePercent: 18,
		termMonths: 120,
		totalParticipants: 900,
		availableSlots: 12,
	},
	{
		id: "grupo-bb-2",
		administradora: "BANCO DO BRASIL",
		category: "auto",
		creditValue: 82_000,
		monthlyPayment: 790,
		adminFeePercent: 20,
		termMonths: 132,
		totalParticipants: 1200,
		availableSlots: 8,
	},
];

describe("motor livre — vendedor sem funil", () => {
	it("fala, busca pelo resultado da tool e NÃO emite gate", async () => {
		const conversationId = await novaConversa();
		const servidor = await subirServidorRoteirizado([
			{ toolCalls: [{ name: "buscar_cartas", args: { categoria: "auto", valorDoBem: 80_000 } }] },
			{ text: "Achei essas opções pra você: a ITAÚ e o Banco do Brasil." },
		]);

		try {
			const run = createRunTurnLivre({
				provider: {
					id: "litellm",
					baseUrl: servidor.url,
					apiKey: "teste",
					model: "modelo-roteirizado",
				},
				busca: async () => cartas,
			});

			const eventos: TurnEvent[] = [];
			for await (const ev of run({
				channel: "web",
				conversationId,
				userText: "quero um carro de 80 mil",
				isUserTurn: true,
				contactName: null,
			}))
				eventos.push(ev);

			const texto = eventos
				.filter((e) => e.type === "text-delta")
				.map((e) => (e as { text: string }).text)
				.join("");
			expect(texto).toContain("Achei essas opções");

			const gates = eventos.filter((e) => e.type === "gate");
			expect(gates).toHaveLength(0);

			const cards = eventos.filter(
				(e) =>
					e.type === "artifact" &&
					(e as { artifactType: string }).artifactType === "comparison_table",
			);
			expect(cards).toHaveLength(1);
			const payload = (cards[0] as { payload: { groups?: unknown[] } }).payload;
			expect(payload.groups).toHaveLength(2);

			const [conv] = await db
				.select({ metadata: conversations.metadata })
				.from(conversations)
				.where(eq(conversations.id, conversationId));
			const meta = (conv.metadata ?? {}) as Record<string, unknown>;
			expect(meta.currentCategory).toBe("auto");
			expect(meta.revealCompleted).toBe(true);

			const msgs = await db
				.select({ role: messages.role, content: messages.content })
				.from(messages)
				.where(eq(messages.conversationId, conversationId));
			expect(msgs.some((m) => m.role === "user" && m.content.includes("carro de 80 mil"))).toBe(
				true,
			);
			expect(msgs.some((m) => m.role === "assistant" && m.content.includes("Achei"))).toBe(true);
		} finally {
			await servidor.fechar();
		}
	});

	it("WhatsApp produz a MESMA trilha: texto + card, zero gate", async () => {
		const [conv] = await db
			.insert(conversations)
			.values({ channel: "whatsapp", status: "active", isSimulated: true, contactName: null })
			.returning({ id: conversations.id });
		criadas.push(conv.id);
		const servidor = await subirServidorRoteirizado([
			{ toolCalls: [{ name: "buscar_cartas", args: { categoria: "auto", valorDoBem: 80_000 } }] },
			{ text: "Olha o que achei pro seu caso." },
		]);
		try {
			const run = createRunTurnLivre({
				provider: { id: "litellm", baseUrl: servidor.url, apiKey: "teste", model: "roteirizado" },
				busca: async () => cartas,
			});
			const eventos: TurnEvent[] = [];
			for await (const ev of run({
				channel: "whatsapp",
				conversationId: conv.id,
				userText: "quero um carro de 80 mil",
				isUserTurn: true,
				contactName: null,
			}))
				eventos.push(ev);

			expect(eventos.filter((e) => e.type === "gate")).toHaveLength(0);
			expect(
				eventos.filter(
					(e) =>
						e.type === "artifact" &&
						(e as { artifactType: string }).artifactType === "comparison_table",
				),
			).toHaveLength(1);
			const meta = await db
				.select({ metadata: conversations.metadata })
				.from(conversations)
				.where(eq(conversations.id, conv.id));
			expect(((meta[0]?.metadata ?? {}) as Record<string, unknown>).currentCategory).toBe("auto");
		} finally {
			await servidor.fechar();
		}
	});

	it("sem busca, o vendedor ainda responde — e nenhum card de OFERTA aparece", async () => {
		const conversationId = await novaConversa();
		const servidor = await subirServidorRoteirizado([
			{ text: "Que bom! Me conta: carro, moto, imóvel ou serviços?" },
		]);
		try {
			const run = createRunTurnLivre({
				provider: { id: "litellm", baseUrl: servidor.url, apiKey: "teste", model: "roteirizado" },
				busca: async () => [],
			});
			const eventos: TurnEvent[] = [];
			for await (const ev of run({
				channel: "web",
				conversationId,
				userText: "oi",
				isUserTurn: true,
				contactName: null,
			}))
				eventos.push(ev);

			// O CHIP de pergunta fechada não é card de oferta: ele é o botão da pergunta.
			const artefatos = eventos
				.filter((e) => e.type === "artifact")
				.map((e) => (e as { artifactType: string }).artifactType);
			expect(artefatos.filter((t) => t !== "quick_reply")).toHaveLength(0);
			expect(eventos.some((e) => e.type === "text-delta")).toBe(true);
		} finally {
			await servidor.fechar();
		}
	});

	it("pergunta fechada vira chip e a lista sai do balão", async () => {
		const conversationId = await novaConversa();
		const servidor = await subirServidorRoteirizado([
			{ text: "Qual combina com você?\n1) Carro\n2) Moto" },
		]);
		try {
			const run = createRunTurnLivre({
				provider: { id: "litellm", baseUrl: servidor.url, apiKey: "teste", model: "roteirizado" },
				busca: async () => [],
			});
			const eventos: TurnEvent[] = [];
			for await (const ev of run({
				channel: "web",
				conversationId,
				userText: "oi",
				isUserTurn: true,
				contactName: null,
			}))
				eventos.push(ev);

			const texto = eventos
				.filter((e) => e.type === "text-delta")
				.map((e) => (e as { text: string }).text)
				.join("\n");
			// A pergunta fica no balão; a lista vira botão — não se lê duas vezes.
			expect(texto).toContain("Qual combina com você?");
			expect(texto).not.toContain("1) Carro");

			const chip = eventos.find((e) => e.type === "artifact") as
				| { artifactType: string; payload: { options: { label: string }[] } }
				| undefined;
			expect(chip?.artifactType).toBe("quick_reply");
			expect(chip?.payload.options.map((o) => o.label)).toEqual(["Carro", "Moto"]);
		} finally {
			await servidor.fechar();
		}
	});

	it("vazamento de máquina não chega ao canal AO VIVO", async () => {
		const conversationId = await novaConversa();
		const servidor = await subirServidorRoteirizado([
			{ text: '{"categoria": "auto", "valorDoBem": 80000}' },
		]);
		try {
			const run = createRunTurnLivre({
				provider: { id: "litellm", baseUrl: servidor.url, apiKey: "teste", model: "roteirizado" },
				busca: async () => [],
			});
			const eventos: TurnEvent[] = [];
			for await (const ev of run({
				channel: "web",
				conversationId,
				userText: "oi",
				isUserTurn: true,
				contactName: null,
			}))
				eventos.push(ev);

			const texto = eventos
				.filter((e) => e.type === "text-delta")
				.map((e) => (e as { text: string }).text)
				.join("\n");
			expect(texto).not.toContain("valorDoBem");
			expect(texto.trim().length).toBeGreaterThan(0);
		} finally {
			await servidor.fechar();
		}
	});

	it("CPF e celular não chegam ao log do servidor", async () => {
		const conversationId = await novaConversa();
		const servidor = await subirServidorRoteirizado([{ text: "Anotado!" }]);
		const logs: string[] = [];
		const espiar = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
			logs.push(args.map((a) => String(a)).join(" "));
		});
		try {
			const run = createRunTurnLivre({
				provider: { id: "litellm", baseUrl: servidor.url, apiKey: "teste", model: "roteirizado" },
				busca: async () => [],
			});
			for await (const _ev of run({
				channel: "web",
				conversationId,
				userText: "meu cpf é 111.444.777-35 e meu celular é (11) 98888-7777",
				isUserTurn: true,
				contactName: null,
			})) {
				// drena o turno inteiro
			}
		} finally {
			espiar.mockRestore();
			await servidor.fechar();
		}

		const tudo = logs.join("\n");
		expect(tudo.length).toBeGreaterThan(0);
		for (const pedaco of ["111.444.777-35", "11144477735", "98888-7777", "11988887777"]) {
			expect(tudo).not.toContain(pedaco);
		}
	});
});

describe("falas do fecho", () => {
	it("viram fala AO VIVO, uma por balão, com o último passe aplicado", () => {
		const eventos = eventosDasFalasDoFecho([
			"O valor da administradora ficou um pouco acima do que falamos.",
			"{",
		]);
		expect(eventos).toEqual([
			{ type: "text-boundary" },
			{
				type: "text-delta",
				text: "O valor da administradora ficou um pouco acima do que falamos.",
			},
		]);
	});

	// A fala do fecho nasce DEPOIS do beat, dentro de `executar`: se o turno voltar a
	// só empurrar para `estado.events`, o aviso de divergência nunca chega ao canal.
	it("o turno emite as falas do fecho no stream", () => {
		const fonte = readFileSync(new URL("./turno-livre.ts", import.meta.url).pathname, "utf8");
		const ini = fonte.indexOf("for (const ev of eventosDasFalasDoFecho");
		const corpo = fonte.slice(ini, fonte.indexOf("for (const card of ctx.cards)", ini));
		expect(ini).toBeGreaterThan(0);
		expect(corpo).toContain("emitir(ev)");
		expect(corpo).toContain("...estado.events, ev");
	});
});
