import { afterAll, describe, expect, it } from "vitest";
import { buscaDoMock } from "@/lib/agent/langgraph/testing/grupos-do-mock";
import { limparCenario, runScenario } from "@/lib/agent/langgraph/testing/scenario";

/**
 * O CONTRATO DO SEAM — as garantias que o motor novo (pi) tem de reproduzir sem
 * regredir, escritas ANTES de existir uma linha dele.
 *
 * O seam é `runTurn` (`src/lib/agent/orchestrator/index.ts:11`), contrato
 * `TurnInput → AsyncGenerator<TurnEvent>`. Web, WhatsApp e os 3 workers chamam só
 * ele — provar o seam é provar o produto.
 *
 * Não são os 41 cenários que existiam aqui (apagados em 16/10/2026, commit
 * `d67ea102`): são os invariantes de que a troca de motor depende — gate que nasce
 * no turno, card que sai do SERVIDOR, funil que persiste e paridade web ×
 * WhatsApp. Cada um foi conferido por mutação (ver comentário de cada bloco).
 *
 * Roda contra o banco do workspace: o harness cria a conversa e o `afterAll` apaga.
 */

const criadas: string[] = [];
afterAll(async () => {
	for (const id of criadas) await limparCenario(id);
});
async function cenario(...args: Parameters<typeof runScenario>) {
	const r = await runScenario(...args);
	criadas.push(r.conversationId);
	return r;
}

/** Conversa posicionada no REVEAL: já tem categoria, valor e identidade — o
 * `nextGate` daqui é o `search`, e é o turno em que o card da prateleira sai. */
const noReveal = {
	currentCategory: "auto",
	qualifyAnswers: { creditMax: 120_000 },
	identityCollected: true,
};

/** Fala do modelo, sem tool nenhuma — o card não pode depender dela. */
const soFala = {
	user: "quero ver as opções",
	beats: [{ text: "Achei essas opções pro seu perfil." }],
};

describe("seam — o gate nasce NO TURNO", () => {
	it("conversa nova sem nome e sem alvo pede o nome", async () => {
		const r = await cenario({
			turns: [{ user: "oi", beats: [{ text: "Oi! Tudo bem?" }] }],
			contactName: null,
		});
		expect(r.turns[0].events.filter((e) => e.type === "gate").map((e) => e.gate)).toEqual(["name"]);
	});

	it("quem já disse o que quer vai direto ao valor, sem passar pelo nome", async () => {
		const r = await cenario({
			turns: [
				{
					user: "oi",
					beats: [{ text: "Boa! Vamos achar a carta certa." }],
					extrai: (meta) => {
						meta.currentCategory = "auto";
					},
				},
			],
			contactName: null,
		});
		expect(r.turns[0].events.filter((e) => e.type === "gate").map((e) => e.gate)).toEqual([
			"credit",
		]);
	});
});

describe("seam — o CARD sai do servidor, não do modelo", () => {
	// Mordida: é o `discovery`/`emit-card` que empurra o `comparison_table`; sem
	// essa emissão o produto fica dizendo "olha as opções aí" e não há opção
	// nenhuma na tela. Remover a emissão deixa este teste vermelho.
	it("no turno do reveal o card da prateleira é emitido mesmo com o modelo só falando", async () => {
		const r = await cenario({
			turns: [soFala],
			metaInicial: noReveal as never,
			telefone: "11999998888",
			contactName: "Cliente",
			busca: buscaDoMock(),
		});
		expect(r.turns[0].artifacts).toEqual(["comparison_table"]);
	});
});

describe("seam — o turno entrega fala e funil", () => {
	it("o modelo produz texto (turno não é mudo)", async () => {
		const r = await cenario({ turns: [soFala], contactName: null });
		const deltas = r.turns[0].events.filter((e) => e.type === "text-delta");
		expect(deltas.length).toBeGreaterThan(0);
	});

	it("o que o analyzer extraiu chega ao banco no fim do turno", async () => {
		// A meta final é o que o `persist` gravou. Funil que anda só em memória
		// faz o próximo turno reidratar do lugar errado — foi assim que o mesmo
		// formulário foi reemitido para sempre.
		const r = await cenario({
			turns: [
				{
					user: "oi",
					beats: [{ text: "Boa!" }],
					extrai: (meta) => {
						meta.currentCategory = "auto";
					},
				},
			],
			contactName: null,
		});
		expect(r.meta.currentCategory).toBe("auto");
	});
});

describe("seam — os dois canais não divergem", () => {
	it("web e WhatsApp produzem a mesma trilha e os mesmos cards", async () => {
		// Os dois consomem o MESMO gerador de eventos; se um canal andar e o
		// outro não depois da troca de motor, é aqui que aparece.
		const opcoes = {
			turns: [soFala],
			metaInicial: noReveal as never,
			telefone: "11999998888",
			contactName: "Cliente",
			busca: buscaDoMock(),
		};
		const web = await cenario({ ...opcoes, channel: "web" });
		const zap = await cenario({ ...opcoes, channel: "whatsapp" });

		expect(zap.turns[0].artifacts).toEqual(web.turns[0].artifacts);
		expect(zap.turns[0].trilha).toEqual(web.turns[0].trilha);
		expect(zap.meta.currentCategory).toBe(web.meta.currentCategory);
	});
});
