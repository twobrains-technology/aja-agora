// FIX-408 — a prova no nível onde o dinheiro se move: o FORMULÁRIO DE CONTRATO.
//
// O teste de unidade (`orchestrator/exclusao-e-recusa.fix-408.test.ts`) prova que
// o resolvedor não devolve mais a marca excluída. Este prova o que o CLIENTE
// recebe, que é outra coisa — e a distinção é justamente o que fez as rodadas
// anteriores parecerem resolvidas sem estarem.
//
// Quem chega ao `contract_form` é `recommendedAdministradora` (emit-card.ts,
// PASSO 5), não `escolha`. O FIX-406 fechou `escolha` e a 9ª revisão independente
// mediu, no grafo real com Postgres real, que o formulário continuava saindo com
// a marca EXCLUÍDA:
//
//   turno 1: "manda as opções"                              → reveal com G171
//   turno 2: "qualquer uma menos a Rodobens, quero fechar"
//   → contract_form.administradora = RODOBENS
//
// Oito falas naturais reproduziam. É o mesmo formato de teste do FIX-406, com a
// busca rodando DE VERDADE no primeiro turno — a menção resolve contra ofertas
// persistidas, e um `metaInicial` sintético faria o resolvedor devolver `null` e
// o teste passar sem tocar o caminho.
import { afterAll, describe, expect, it } from "vitest";
import { buscaDoMock } from "./testing/grupos-do-mock";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Funil respondido, busca AINDA NÃO feita — o reveal do turno 1 é o que
 * persiste as ofertas (G171: CANOPUS, ÂNCORA, ITAÚ, RODOBENS). */
const ANTES_DA_BUSCA = {
	desireAsked: true,
	identityCollected: true,
	currentCategory: "auto" as const,
	experiencePrev: "returning" as const,
	recoConsentAnswered: true,
	simulatorOfferDispatched: true,
	qualifyAnswers: {
		creditMax: 180_000,
		prazoMeses: 12,
		hasLance: "yes" as const,
		lanceValue: 90_000,
		lanceEmbutido: false,
	},
};

const BUSCA = { user: "manda as opções", beats: [{ text: "Vou buscar agora!" }] };

async function jornada(fala: string) {
	return runScenario({
		busca: buscaDoMock(96),
		metaInicial: ANTES_DA_BUSCA,
		turns: [
			BUSCA,
			{ user: fala, intent: "ready_to_proceed" as const, beats: [{ text: "Certo." }] },
		],
	});
}

describeIfDb("FIX-408 — a marca excluída não chega ao contrato", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it.each([
		"qualquer uma menos a Rodobens, quero fechar",
		"sem a Rodobens, bora fechar",
		"a Rodobens tá fora, quero fechar",
		"tirei a Rodobens da lista, quero fechar",
	])("nem ancora nem vai pro formulário: %s", async (fala) => {
		const r = await jornada(fala);
		criadas.push(r.conversationId);

		// Sentinela de não-vacuidade: sem reveal, a menção não teria contra o que
		// resolver e o teste passaria por acidente.
		expect(r.meta.revealCompleted, "o reveal precisa ter rodado").toBe(true);

		expect(r.meta.recommendedOffer?.administradora, fala).not.toBe("RODOBENS");
		expect(r.meta.recommendedAdministradora, fala).not.toBe("RODOBENS");

		const form = r.turns
			.flatMap((t) => t.events)
			.find((e) => e.type === "artifact" && e.artifactType === "contract_form");
		if (form) {
			expect((form as { payload: { administradora?: string } }).payload.administradora).not.toBe(
				"RODOBENS",
			);
		}
	});

	it("excluir uma e pedir OUTRA leva a outra ao contrato", async () => {
		// A metade que impede o fix de virar "exclusão paralisa a venda". Dizer o
		// que não quer é a forma mais comum de dizer o que quer.
		const r = await jornada("qualquer uma menos a Rodobens, quero a Canopus");
		criadas.push(r.conversationId);

		expect(r.meta.recommendedOffer?.administradora).toBe("CANOPUS");
	});
});
