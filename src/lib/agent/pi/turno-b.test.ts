// O QUE O TURNO PRECISA VOLTAR A PRODUZIR — onda 3, bloco TURNO-B.
//
// Cada `describe` aqui é uma lacuna da auditoria (paridade-310e.md) com o seu
// teste: L29/P281 (índice do turno e marco da primeira carta), L41/P301
// (deduplicação por `toolCallId`), L44/P212 (valor declarado antes da busca),
// N09/P217 (custo somado antes de arredondar), CHIPS-2/L02 (flag do formulário
// de contrato) e R5.1 (o card não gruda no balão que o anunciou).
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import type { GroupSummary } from "@/lib/adapters/types";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { estadoInicialDoTurno } from "@/lib/agent/turn/estado";
import { projectToMeta } from "@/lib/agent/turn/projecao";
import { subirServidorRoteirizado } from "./testing/servidor-roteirizado";
import type { PiToolDefinition } from "./tools";
import {
	aplicarMetaDaEmissao,
	createRunTurnLivre,
	declaracaoDoTurno,
	lanceEPrazoDoTurno,
	semRepetirChamada,
	somarUsoDosBeats,
} from "./turno-livre";

const criadas: string[] = [];
afterEach(async () => {
	for (const id of criadas.splice(0)) {
		await db.delete(messages).where(eq(messages.conversationId, id));
		await db.delete(conversations).where(eq(conversations.id, id));
	}
});

async function novaConversa(isSimulated = true): Promise<string> {
	const [conv] = await db
		.insert(conversations)
		.values({ channel: "web", status: "active", isSimulated, contactName: null })
		.returning({ id: conversations.id });
	criadas.push(conv.id);
	return conv.id;
}

async function metaDa(conversationId: string): Promise<Record<string, unknown>> {
	const [conv] = await db
		.select({ metadata: conversations.metadata })
		.from(conversations)
		.where(eq(conversations.id, conversationId));
	return (conv?.metadata ?? {}) as Record<string, unknown>;
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
];

/** Roda um turno inteiro e devolve os eventos do stream. */
async function rodarTurno(args: {
	conversationId: string;
	userText: string;
	beats: Parameters<typeof subirServidorRoteirizado>[0];
	busca?: () => Promise<GroupSummary[]>;
	channel?: "web" | "whatsapp";
}): Promise<{ eventos: TurnEvent[]; chamadasDaBusca: () => number; fechar: () => Promise<void> }> {
	const servidor = await subirServidorRoteirizado(args.beats);
	let chamadas = 0;
	const run = createRunTurnLivre({
		provider: { id: "litellm", baseUrl: servidor.url, apiKey: "teste", model: "roteirizado" },
		busca: async () => {
			chamadas += 1;
			return (await args.busca?.()) ?? cartas;
		},
	});
	const eventos: TurnEvent[] = [];
	for await (const ev of run({
		channel: args.channel ?? "web",
		conversationId: args.conversationId,
		userText: args.userText,
		isUserTurn: true,
		contactName: null,
	}))
		eventos.push(ev);
	return { eventos, chamadasDaBusca: () => chamadas, fechar: servidor.fechar };
}

describe("L29/P281 — o turno sabe QUAL turno ele é", () => {
	it("o primeiro turno do cliente anuncia o índice 0 e grava o contador", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "oi",
			beats: [{ text: "Oi! Me conta o que você quer comprar." }],
		});
		await turno.fechar();

		const indice = turno.eventos.find((e) => e.type === "turno-do-cliente") as
			| { type: "turno-do-cliente"; indice: number }
			| undefined;
		expect(indice?.indice).toBe(0);
		expect((await metaDa(conversationId)).turnosDoCliente).toBe(1);
	});

	it("o segundo turno do cliente anuncia 1 — a semente não reinicia", async () => {
		const conversationId = await novaConversa();
		const primeiro = await rodarTurno({
			conversationId,
			userText: "oi",
			beats: [{ text: "Oi! O que você quer comprar?" }],
		});
		await primeiro.fechar();
		const segundo = await rodarTurno({
			conversationId,
			userText: "um carro",
			beats: [{ text: "Boa! Qual valor você tem em mente?" }],
		});
		await segundo.fechar();

		const indice = segundo.eventos.find((e) => e.type === "turno-do-cliente") as
			| { type: "turno-do-cliente"; indice: number }
			| undefined;
		expect(indice?.indice).toBe(1);
		expect((await metaDa(conversationId)).turnosDoCliente).toBe(2);
	});

	it("a primeira carta da conversa vira sinal UMA vez, e não volta na busca seguinte", async () => {
		const conversationId = await novaConversa(false);
		const logs: string[] = [];
		const espiar = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
			logs.push(args.map((a) => String(a)).join(" "));
		});
		const busca = [{ toolCalls: [{ name: "buscar_cartas", args: { categoria: "auto" } }] }];
		try {
			const primeiro = await rodarTurno({
				conversationId,
				userText: "quero um carro",
				beats: [...busca, { text: "Olha as opções." }],
			});
			await primeiro.fechar();
			const segunda = await rodarTurno({
				conversationId,
				userText: "e a parcela?",
				beats: [...busca, { text: "Essas são as parcelas." }],
			});
			await segunda.fechar();
		} finally {
			espiar.mockRestore();
		}

		const cartasVistas = logs.filter((l) => l.includes("[sinal]") && l.includes("carta_vista"));
		expect(cartasVistas).toHaveLength(1);
		// 1 = o cliente viu preço já na primeira fala dele.
		expect(cartasVistas[0]).toContain('"value":1');
	});
});

describe("L41/P301 — a mesma chamada de tool não acontece duas vezes", () => {
	const toolFalsa = (executar: () => Promise<string>): PiToolDefinition => ({
		name: "buscar_cartas",
		label: "buscar_cartas",
		description: "falsa",
		parameters: { type: "object", properties: {} },
		execute: async () => {
			const texto = await executar();
			return { content: [{ type: "text", text: texto }], details: {} };
		},
	});

	it("repetir o `toolCallId` reaproveita o resultado em vez de executar de novo", async () => {
		let execucoes = 0;
		const [tool] = semRepetirChamada([
			toolFalsa(async () => {
				execucoes += 1;
				return "cartas";
			}),
		]);

		const primeira = await tool?.execute("call-1", {});
		const segunda = await tool?.execute("call-1", {});
		// Id diferente é OUTRA chamada: o memo é por id, não por nome da tool.
		await tool?.execute("call-2", {});

		expect(execucoes).toBe(2);
		expect(segunda).toEqual(primeira);
	});

	it("o turno passa as tools pelo memo — sem isso o `toolCallId` reentregue executa de novo", () => {
		const fonte = readFileSync(new URL("./turno-livre.ts", import.meta.url).pathname, "utf8");
		expect(fonte).toMatch(/tools: semRepetirChamada\(/);
	});

	it("a mesma busca repetida não empilha a mesma tabela na tela", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "quero um carro de 80 mil",
			beats: [
				{
					toolCalls: [
						{ id: "call-a", name: "buscar_cartas", args: { categoria: "auto" } },
						{ id: "call-b", name: "buscar_cartas", args: { categoria: "auto" } },
					],
				},
				{ text: "Olha o que achei." },
			],
		});
		await turno.fechar();

		const tabelas = turno.eventos.filter(
			(e) =>
				e.type === "artifact" &&
				(e as { artifactType: string }).artifactType === "comparison_table",
		);
		expect(tabelas).toHaveLength(1);
	});

	it("o mesmo `toolCallId` reentregue não vira dois eventos nem dois cards", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "quero um carro de 80 mil",
			beats: [
				{
					toolCalls: [
						{ id: "call-repetido", name: "buscar_cartas", args: { categoria: "auto" } },
						{ id: "call-repetido", name: "buscar_cartas", args: { categoria: "auto" } },
					],
				},
				{ text: "Olha o que achei." },
			],
		});
		await turno.fechar();

		// O harness pode nem executar a chamada repetida; o que NÃO pode acontecer é
		// ela virar dois eventos/cards no turno.
		expect(turno.chamadasDaBusca()).toBeLessThanOrEqual(1);
		expect(turno.eventos.filter((e) => e.type === "tool-call")).toHaveLength(1);
		const tabelas = turno.eventos.filter(
			(e) =>
				e.type === "artifact" &&
				(e as { artifactType: string }).artifactType === "comparison_table",
		);
		expect(tabelas.length).toBeLessThanOrEqual(1);
	});
});

describe("L44/P212 — o valor declarado entra no estado antes da busca", () => {
	it("lê o que o cliente DECLAROU: bem e valor com marcador", () => {
		expect(declaracaoDoTurno("quero um carro de 80 mil")).toEqual({
			categoria: "auto",
			valorDoBem: 80_000,
		});
		expect(declaracaoDoTurno("queria um imóvel de R$ 300.000")).toEqual({
			categoria: "imovel",
			valorDoBem: 300_000,
		});
	});

	it("não inventa: lance, orçamento mensal e comparação de bens ficam de fora", () => {
		// O lance tem campo próprio; `parseAssetValue` não conhece a distinção.
		expect(declaracaoDoTurno("meu lance é 30 mil")).toEqual({});
		// Cadência mensal é parcela, nunca valor do bem.
		expect(declaracaoDoTurno("consigo pagar 850 por mês")).toEqual({});
		// "carro ou moto" é comparação — escolher uma das duas envenenaria o painel.
		expect(declaracaoDoTurno("não sei, carro ou moto, uns 60 mil").categoria).toBeUndefined();
	});

	it("troca de categoria: a negada sai, a afirmada é a declarada", () => {
		// Golden `golden-troca-de-categoria`: o modelo diz que trocou e o banco
		// continuava com o `currentCategory` antigo.
		expect(declaracaoDoTurno("Pensando melhor, na verdade eu quero uma moto, não imóvel")).toEqual({
			categoria: "moto",
		});
		expect(declaracaoDoTurno("não quero carro, quero imóvel")).toEqual({ categoria: "imovel" });
		expect(declaracaoDoTurno("deixa o carro, quero uma moto de 20 mil")).toEqual({
			categoria: "moto",
			valorDoBem: 20_000,
		});
	});

	it("a comparação pura continua fora, mesmo com duas categorias na fala", () => {
		// Nenhuma negada: sobra mais de uma e não há o que declarar.
		expect(declaracaoDoTurno("carro ou moto, tanto faz").categoria).toBeUndefined();
		// Negadas as duas: também não há categoria afirmada.
		expect(declaracaoDoTurno("não quero carro nem moto").categoria).toBeUndefined();
	});

	it("o turno sem NENHUMA busca ainda grava categoria e faixa na meta", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "quero um carro de 80 mil",
			beats: [{ text: "Boa escolha! Vamos ver as opções." }],
		});
		await turno.fechar();

		const meta = await metaDa(conversationId);
		expect(meta.currentCategory).toBe("auto");
		const qualify = meta.qualifyAnswers as Record<string, unknown>;
		expect(qualify.creditMax).toBe(80_000);
		expect(qualify.valorDoBemAlvo).toBe(80_000);
	});

	it("a palavra 'entrada' não invalida o valor do BEM dito na mesma frase", () => {
		// "sem entrada" não apaga o preço do bem…
		expect(declaracaoDoTurno("quero um carro de 80 mil, sem entrada")).toEqual({
			categoria: "auto",
			valorDoBem: 80_000,
		});
		// …e, com bem e entrada distintos, o bem vai para o seu campo; a entrada não vira
		// lance — `entrada` não é molde de lance.
		expect(declaracaoDoTurno("quero um carro de 80 mil e dou 20 mil de entrada")).toEqual({
			categoria: "auto",
			valorDoBem: 80_000,
		});
		// lado seguro: fora dos moldes (onda 17)
		expect(lanceEPrazoDoTurno("quero um carro de 80 mil e dou 20 mil de entrada")).toEqual({});
	});

	it("o turno sem busca grava o valor do bem mesmo com 'entrada' na frase", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "quero um carro de 80 mil, sem entrada",
			beats: [{ text: "Boa escolha! Vamos ver as opções." }],
		});
		await turno.fechar();

		const meta = await metaDa(conversationId);
		expect(meta.currentCategory).toBe("auto");
		const qualify = meta.qualifyAnswers as Record<string, unknown>;
		expect(qualify.creditMax).toBe(80_000);
		expect(qualify.valorDoBemAlvo).toBe(80_000);
		// "sem entrada" é a AUSÊNCIA de lance, não dinheiro disponível.
		expect(qualify.lanceValue).toBeUndefined();
	});

	it("com bem e entrada distintos, o bem cai no seu campo e a entrada não vira lance", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "quero um carro de 80 mil e dou 20 mil de entrada",
			beats: [{ text: "Perfeito, então você entra com 20 mil." }],
		});
		await turno.fechar();

		const qualify = (await metaDa(conversationId)).qualifyAnswers as Record<string, unknown>;
		expect(qualify.creditMax).toBe(80_000);
		expect(qualify.valorDoBemAlvo).toBe(80_000);
		// lado seguro: fora dos moldes (onda 17) — "dou 20 mil de entrada" não fecha molde
		expect(qualify.lanceValue).toBeUndefined();
	});

	// RODADA 6 / P212 — a PERGUNTA sobre o lance, na mesma fala, não pode apagar o
	// bem declarado: no HEAD a vírgula não fechava frase, `semAsPerguntas` apagava
	// a fala inteira terminada em `?` e o cliente saía sem `creditMax` — captura
	// que a main fazia (`a2bc3024:src/lib/agent/orchestrator/analyze.ts:230`).
	it("a pergunta sobre o lance NÃO apaga o bem declarado na mesma fala", async () => {
		const fala = "Quero um carro de 80 mil, quanto de lance?";
		expect(declaracaoDoTurno(fala)).toEqual({ categoria: "auto", valorDoBem: 80_000 });
		expect(lanceEPrazoDoTurno(fala)).toEqual({});

		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: fala,
			beats: [{ text: "Boa escolha! O lance a gente vê com calma." }],
		});
		await turno.fechar();

		const meta = await metaDa(conversationId);
		expect(meta.currentCategory).toBe("auto");
		const qualify = meta.qualifyAnswers as Record<string, unknown>;
		expect(qualify.creditMax).toBe(80_000);
		expect(qualify.valorDoBemAlvo).toBe(80_000);
		// A pergunta não vira recurso próprio: quem pergunta o lance não declarou ter.
		expect(qualify.lanceValue).toBeUndefined();
	});

	// RODADA 7 / P139+P212 — `tenho` com OUTRO objeto não declara dinheiro: o verbo de posse
	// não pode aprovar o número do bem. No TURNO COMPLETO, sem busca: o lance fica pendente
	// e o bem de 80 mil continua, como a main (`analyze.ts:230` lê o texto ORIGINAL).
	it("«Tenho interesse em um carro de 80 mil e quero entender o lance.» não vira lance e não perde o bem", async () => {
		const fala = "Tenho interesse em um carro de 80 mil e quero entender o lance.";
		expect(lanceEPrazoDoTurno(fala)).toEqual({});
		expect(declaracaoDoTurno(fala)).toEqual({ categoria: "auto", valorDoBem: 80_000 });

		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: fala,
			beats: [{ text: "Boa! Um carro de 80 mil, e o lance a gente vê depois." }],
		});
		await turno.fechar();

		const meta = await metaDa(conversationId);
		const qualify = meta.qualifyAnswers as Record<string, unknown>;
		// Morde: com `tenho` lido como posse do dinheiro, o 80 mil virava reserva do cliente
		// (os cenários usariam recurso que ele não tem) e o perfil ficava sem valor informado.
		expect(qualify.lanceValue).toBeUndefined();
		expect(qualify.creditMax).toBe(80_000);
		expect(qualify.valorDoBemAlvo).toBe(80_000);
		expect(meta.currentCategory).toBe("auto");
	});

	// RODADA 8 / P212 — no TURNO COMPLETO, sem busca: a máscara do bem só remove o dinheiro que
	// casa um dos DOIS moldes da máscara, ambos com a palavra `lance`/`entrada`.
	it("«Tenho 80 mil de orçamento para um carro.» não perde o valor do bem", async () => {
		const fala = "Tenho 80 mil de orçamento para um carro.";
		expect(declaracaoDoTurno(fala)).toEqual({ categoria: "auto", valorDoBem: 80_000 });
		// Sem a palavra lance/entrada, o verbo de posse não aprova o número: lance pendente.
		expect(lanceEPrazoDoTurno(fala)).toEqual({});

		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: fala,
			beats: [{ text: "Beleza! Um carro de 80 mil." }],
		});
		await turno.fechar();

		const meta = await metaDa(conversationId);
		const qualify = meta.qualifyAnswers as Record<string, unknown>;
		// Morde: com o verbo dos moldes de captura reaproveitado na máscara, o 80 mil era apagado
		// e o painel contava o cliente sem valor informado — a main o capturava no texto original.
		expect(qualify.creditMax).toBe(80_000);
		expect(qualify.valorDoBemAlvo).toBe(80_000);
		expect(qualify.lanceValue).toBeUndefined();
		expect(meta.currentCategory).toBe("auto");
	});

	// RODADA 8 / P212 — o MESMO intervalo casado pelo molde e pelo associador era removido duas
	// vezes com as posições originais sobre o texto já encurtado: a segunda remoção comia o número
	// seguinte.
	it("«Meu lance: R$ 30.000; 80 mil para o carro.» mantém o lance e o bem", async () => {
		const fala = "Meu lance: R$ 30.000; 80 mil para o carro.";
		expect(lanceEPrazoDoTurno(fala)).toEqual({ lanceValue: 30_000 });
		expect(declaracaoDoTurno(fala)).toEqual({ categoria: "auto", valorDoBem: 80_000 });

		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: fala,
			beats: [{ text: "Anotado: 30 mil de lance para um carro de 80 mil." }],
		});
		await turno.fechar();

		const meta = await metaDa(conversationId);
		const qualify = meta.qualifyAnswers as Record<string, unknown>;
		// Morde: com o intervalo duplicado, só o lance chegava e o bem de 80 mil sumia da meta.
		expect(qualify.creditMax).toBe(80_000);
		expect(qualify.valorDoBemAlvo).toBe(80_000);
		expect(qualify.lanceValue).toBe(30_000);
		expect(meta.currentCategory).toBe("auto");
	});

	// RODADA 9 / P212 — o molde não atravessa a FRASE. Em duas linhas, o "De lance, não tenho
	// nada." da frase seguinte não pode comer o preço do BEM da frase anterior: os moldes rodam
	// frase a frase e a adjacência entre tokens é só horizontal (`[ \t]`). No TURNO COMPLETO, sem
	// busca, o bem de 80 mil continua na qualificação.
	// O lance desta fala fica de fora porque não há reserva anterior: sem reserva não há o que
	// zeroar — a transição "30 mil → não tenho" ⇒ 0 está provada em `turno-lance.test.ts`.
	it("«Quero um carro de 80 mil\nDe lance, não tenho nada.» não perde o bem de 80 mil", async () => {
		const fala = "Quero um carro de 80 mil\nDe lance, não tenho nada.";
		expect(declaracaoDoTurno(fala)).toEqual({ categoria: "auto", valorDoBem: 80_000 });
		expect(lanceEPrazoDoTurno(fala)).toEqual({});

		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: fala,
			beats: [{ text: "Anotado: carro de 80 mil, sem lance." }],
		});
		await turno.fechar();

		const meta = await metaDa(conversationId);
		const qualify = meta.qualifyAnswers as Record<string, unknown>;
		// Morde: com `\s+` entre os tokens do molde, o 80 mil da primeira linha era lido como
		// dinheiro de LANCE e mascarado do bem — a `main` o capturava no texto original
		// (`analyze.ts:230` → `parse-asset-value.ts:245`).
		expect(qualify.creditMax).toBe(80_000);
		expect(qualify.valorDoBemAlvo).toBe(80_000);
		expect(qualify.lanceValue).toBeUndefined();
		expect(meta.currentCategory).toBe("auto");
	});

	// O rótulo que liga PALAVRA a VALOR chega pelas quatro formas que o cliente
	// usa no chat (`:`, `-`, `=`, "é de"). O `:` era o único que separava a
	// oração: "Meu lance: R$ 30.000" deixava o dinheiro órfão e o `parseAssetValue`
	// o lia como valor do BEM (regressão de `6edd54d4`, P212).
	const rotulados: Array<{ fala: string; bem: Record<string, unknown>; lance?: number }> = [
		{ fala: "carro: 80 mil", bem: { categoria: "auto", valorDoBem: 80_000 } },
		{ fala: "quero um carro de 80 mil", bem: { categoria: "auto", valorDoBem: 80_000 } },
		{
			fala: "quero um carro de 80 mil, sem entrada",
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		{
			fala: "quero um carro de 80 mil e dou 20 mil de entrada",
			bem: { categoria: "auto", valorDoBem: 80_000 },
			// lado seguro: fora dos moldes (onda 17) — `entrada` não é molde de lance
			lance: undefined,
		},
		{
			fala: "dou 20 mil de entrada pra um carro de 80 mil",
			bem: { categoria: "auto", valorDoBem: 80_000 },
			// lado seguro: fora dos moldes (onda 17) — `entrada` não é molde de lance
			lance: undefined,
		},
		{
			fala: "quero um imóvel de 300 mil e 50 mil de entrada",
			bem: { categoria: "imovel", valorDoBem: 300_000 },
			// RODADA 6 / P139: atribuir 50 mil à entrada não é afirmar que o cliente
			// os TEM (não há verbo de posse na fala), então o lance não é gravado — mas
			// o dinheiro da entrada sai do caminho do bem.
		},
		// RODADA 6 / P212 — a pergunta ao lado NÃO apaga o bem declarado (a main lê o
		// texto ORIGINAL em `analyze.ts:230`; o livre apagava a frase inteira).
		{
			fala: "Quero um carro de 80 mil, quanto de lance?",
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		{
			fala: "carro de 80 mil com 30 mil de lance",
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		{ fala: "Meu lance: R$ 30.000", bem: {}, lance: 30_000 },
		// RODADA 8 / P212 — os dois moldes da máscara exigem a palavra `lance`/`entrada`; o verbo
		// dos moldes de captura não reaproveita na máscara, e o intervalo duplicado não pode comer
		// o número seguinte.
		{
			fala: "Tenho 80 mil de orçamento para um carro.",
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		{
			fala: "Meu lance: R$ 30.000; 80 mil para o carro.",
			bem: { categoria: "auto", valorDoBem: 80_000 },
			lance: 30_000,
		},
		{ fala: "minha casa vale 300 mil", bem: { categoria: "imovel", valorDoBem: 300_000 } },
	];

	it.each(rotulados)("«$fala» declara só o que é do bem", ({ fala, bem, lance }) => {
		expect(declaracaoDoTurno(fala)).toEqual(bem);
		expect(lanceEPrazoDoTurno(fala).lanceValue).toBe(lance);
	});

	it("frases separadas NUNCA se juntam: o bem de 80 mil sobrevive ao 'lance eu não tenho'", async () => {
		const fala = "Quero um carro de 80 mil. Lance eu não tenho.";
		// No extrator: o 80 mil é o preço do BEM, e o "não tenho" da frase seguinte
		// não vira recurso próprio.
		expect(declaracaoDoTurno(fala)).toEqual({ categoria: "auto", valorDoBem: 80_000 });
		expect(lanceEPrazoDoTurno(fala)).toEqual({});

		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: fala,
			beats: [{ text: "Entendi: carro de 80 mil, e o lance a gente vê depois." }],
		});
		await turno.fechar();

		const meta = await metaDa(conversationId);
		const qualify = meta.qualifyAnswers as Record<string, unknown>;
		// Morde: emendando as duas frases o turno via "80 mil Lance" na mesma
		// oração, tirava o 80 mil do bem e o gravava como lance — o cliente saía sem
		// valor informado na distribuição por faixa e com dinheiro que não tem.
		expect(qualify.creditMax).toBe(80_000);
		expect(qualify.valorDoBemAlvo).toBe(80_000);
		expect(qualify.lanceValue).toBeUndefined();
		expect(meta.currentCategory).toBe("auto");
	});

	it("lance com dois-pontos NÃO substitui o bem de um turno anterior, sem busca", async () => {
		const conversationId = await novaConversa();
		const primeiro = await rodarTurno({
			conversationId,
			userText: "quero um carro de 80 mil",
			beats: [{ text: "Boa escolha! E de quanto seria o lance?" }],
		});
		await primeiro.fechar();
		const segundo = await rodarTurno({
			conversationId,
			userText: "Meu lance: R$ 30.000",
			beats: [{ text: "Perfeito, anotei 30 mil de lance." }],
		});
		await segundo.fechar();

		const meta = await metaDa(conversationId);
		const qualify = meta.qualifyAnswers as Record<string, unknown>;
		// Morde: sem o par rótulo→valor, o 30 mil do LANCE sobrescrevia o bem de
		// 80 mil e a distribuição por faixa contava o cliente na faixa errada.
		expect(qualify.creditMax).toBe(80_000);
		expect(qualify.valorDoBemAlvo).toBe(80_000);
		expect(qualify.lanceValue).toBe(30_000);
		expect(meta.currentCategory).toBe("auto");
	});
});

describe("N09/P217 — o custo é somado exato e arredondado UMA vez", () => {
	// Beat do modelo default do vendedor: 80.000 tokens de entrada × US$ 0,05/M.
	const beatSubcentavo = { modelo: "qwen3.6-flash", tokensInput: 80_000, tokensOutput: 0 };

	it("três beats subcentavo somam 1 centavo (o arredondamento por beat daria 0)", () => {
		const uso = somarUsoDosBeats([beatSubcentavo, beatSubcentavo, beatSubcentavo]);
		expect(uso.tokensInput).toBe(240_000);
		expect(uso.custoUsdCents).toBe(1);
	});

	it("um beat sem preço torna o custo do turno DESCONHECIDO, nunca zero", () => {
		const uso = somarUsoDosBeats([beatSubcentavo, { ...beatSubcentavo, modelo: "sem-preco" }]);
		expect(uso.custoUsdCents).toBeNull();
		expect(uso.tokensInput).toBe(160_000);
	});
});

describe("CHIPS-2/L02 — o formulário de contrato deixa a flag na meta", () => {
	const estadoBase = () =>
		estadoInicialDoTurno({
			conversationId: "conv-teste",
			channel: "whatsapp",
			contactName: null,
			isUserTurn: true,
			userText: "quero contratar",
			baseMeta: {},
			historico: [],
		});

	it("a marca do card entra no funil", () => {
		const depois = aplicarMetaDaEmissao(estadoBase(), { contractFormDispatched: true });
		expect(depois.funnel.contractFormDispatched).toBe(true);
	});

	it("sem marca, o estado volta intacto (o que o turno não mexeu não é regravado)", () => {
		const antes = estadoBase();
		expect(aplicarMetaDaEmissao(antes, undefined)).toBe(antes);
		expect(aplicarMetaDaEmissao(antes, {}).funnel.contractFormDispatched).toBeUndefined();
	});

	it("a flag chega ao metadata do turno", async () => {
		const antes = estadoBase();
		expect(antes.funnel.contractFormDispatched).toBeUndefined();
		// `projectToMeta` é quem leva o funil ao metadata na persistência.
		expect(
			projectToMeta(aplicarMetaDaEmissao(antes, { contractFormDispatched: true }))
				.contractFormDispatched,
		).toBe(true);
	});

	// A metade de cá só vale se `mostrar_card` escrever o campo (bloco FECHO-B) E o
	// turno ler depois do beat. Este é o caminho inteiro, no canal que não tinha a
	// flag: o `contract_confirm` do WhatsApp.
	it("o turno que mostra o formulário grava a flag no metadata", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			channel: "whatsapp",
			userText: "quero contratar o da ITAU",
			beats: [
				{ toolCalls: [{ name: "mostrar_card", args: { tipo: "contract_form" } }] },
				{ text: "Preenche aqui que eu já gero sua proposta." },
			],
		});
		await turno.fechar();

		expect((await metaDa(conversationId)).contractFormDispatched).toBe(true);
	});
});

describe("R5.1 — o card abre balão próprio e não gruda na fala que o anunciou", () => {
	it("o artifact é precedido por um text-boundary no stream", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "quero um carro de 80 mil",
			beats: [
				{ toolCalls: [{ name: "buscar_cartas", args: { categoria: "auto" } }] },
				{ text: "Pronto! Aí estão os números." },
			],
		});
		await turno.fechar();

		const indiceDoCard = turno.eventos.findIndex(
			(e) =>
				e.type === "artifact" &&
				(e as { artifactType: string }).artifactType === "comparison_table",
		);
		expect(indiceDoCard).toBeGreaterThan(0);
		const anterior = turno.eventos.slice(0, indiceDoCard).reverse();
		// O primeiro evento antes do card, ignorando texto, é um boundary.
		const primeiroNaoTexto = anterior.find((e) => e.type !== "text-delta");
		expect(primeiroNaoTexto?.type).toBe("text-boundary");
	});
});
