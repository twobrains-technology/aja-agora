// FIX-394 (investigação de B9) — o WhatsApp mostra a LISTA de ofertas, não só a
// recomendada?
//
// Rodada 2026-07-29 (grupo AJA AGORA + Twobrains, 22/07 18:14). O Bernardo
// testou pelo WhatsApp:
//
//   "Tô aqui punhetando o agente. Ele andou num ritmo estranho comigo. Só
//    mostrou 1 opção, perguntou se eu queria ver outras."
//   (Kairo: "pelo whats ou pela web?" → Bernardo: "WhatsApp")
//
// O `comparisonTableToWhatsApp` (formatter.ts:166) renderiza até 10 opções numa
// lista interativa, então o canal SABE mostrar várias — o cap não é ele. A
// hipótese é de EMISSÃO: se o reveal no WhatsApp entrega só o
// `recommendation_card` (o hero, 1 oferta) e nunca o `comparison_table`, o
// cliente vê exatamente "1 opção" e a pergunta "quer ver outras?" fica sendo a
// única saída.
//
// Este cenário existe pra DECIDIR isso com evidência em vez de palpite: roda o
// mesmo momento do funil nos dois canais e compara os artifacts emitidos. Se a
// paridade já existir, B9 morre aqui e o achado do Bernardo era percepção (ou um
// bug de renderização do lado da Meta, que não é este código).
//
// ⚠️ O que se asserta é PRESENÇA e ORDEM de artifact, nunca texto — travar prosa
// é o que este repo proíbe.
import { afterAll, describe, expect, it } from "vitest";
import { buscaDoMock } from "./testing/grupos-do-mock";
import { limparCenario, runScenario, type ScenarioResult } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Cliente com tudo que a busca exige, no turno em que o reveal acontece. */
const PRONTO_PRA_BUSCAR = {
	desireAsked: true,
	identityCollected: true,
	currentCategory: "imovel" as const,
	qualifyAnswers: { creditMax: 700_000 },
};

function artifactsDoCenario(r: ScenarioResult): string[] {
	return r.turns.flatMap((t) => t.artifacts);
}

describeIfDb("FIX-394 — paridade de reveal entre web e WhatsApp", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	async function revelar(channel: "web" | "whatsapp") {
		const r = await runScenario({
			channel,
			busca: buscaDoMock(96),
			metaInicial: PRONTO_PRA_BUSCAR,
			turns: [
				{
					user: "manda as opções",
					intent: "ready_to_proceed",
					beats: [{ text: "Já volto com as ofertas reais." }],
				},
			],
		});
		criadas.push(r.conversationId);
		return artifactsDoCenario(r);
	}

	it("web: o reveal entrega a LISTA de ofertas", async () => {
		const arts = await revelar("web");
		expect(arts).toContain("comparison_table");
	});

	it("whatsapp: o reveal entrega a LISTA de ofertas também (não só a recomendada)", async () => {
		const arts = await revelar("whatsapp");
		// O ponto do Bernardo: se só vier o hero, ele vê "1 opção".
		expect(arts).toContain("comparison_table");
	});

	it("os dois canais emitem o MESMO conjunto de artifacts no reveal", async () => {
		const [web, wa] = await Promise.all([revelar("web"), revelar("whatsapp")]);
		// Ordem pode diferir (cadência do WhatsApp é outra); o CONJUNTO não pode.
		expect([...new Set(wa)].sort()).toEqual([...new Set(web)].sort());
	});
});
