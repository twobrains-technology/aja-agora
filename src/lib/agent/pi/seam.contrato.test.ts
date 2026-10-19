import { afterAll, describe, expect, it } from "vitest";
import { limparCenarioPi, runScenarioPi } from "./testing/cenario";
import { buscaDoMock } from "./testing/grupos-do-mock";

/**
 * O CONTRATO DO SEAM, RODANDO NO MOTOR DO PI.
 *
 * É o mesmo contrato de `langgraph/seam.contrato.test.ts` — só muda quem executa
 * o turno. Ele existe para provar a troca de motor: as garantias que o produto
 * vende (gate que nasce no turno, card que sai do SERVIDOR, funil que persiste,
 * web × WhatsApp idênticos) não podem depender do framework.
 *
 * Roda contra o banco do workspace: cada cenário cria a conversa e o `afterAll`
 * apaga.
 */
const criadas: string[] = [];
afterAll(async () => {
	for (const id of criadas) await limparCenarioPi(id);
});
async function cenario(...args: Parameters<typeof runScenarioPi>) {
	const r = await runScenarioPi(...args);
	criadas.push(r.conversationId);
	return r;
}

/** Conversa posicionada no REVEAL: categoria, valor e identidade — o próximo
 * gate é a busca, e é o turno em que o card da prateleira sai. */
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

describe("seam (pi) — o gate nasce NO TURNO", () => {
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

describe("seam (pi) — o CARD sai do servidor, não do modelo", () => {
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

describe("seam (pi) — o turno entrega fala e funil", () => {
	it("o modelo produz texto (turno não é mudo)", async () => {
		const r = await cenario({ turns: [soFala], contactName: null });
		const deltas = r.turns[0].events.filter((e) => e.type === "text-delta");
		expect(deltas.length).toBeGreaterThan(0);
	});

	it("o que o analyzer extraiu chega ao banco no fim do turno", async () => {
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

describe("seam (pi) — os dois canais não divergem", () => {
	it("web e WhatsApp produzem a mesma trilha e os mesmos cards", async () => {
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
