// FIX-410 — a tool `escolher_cota` é o ÚLTIMO escritor de `escolha`, e o veto
// dela usava metade do predicado de recusa.
//
// A 9ª revisão independente listou esta tool como HIPÓTESE não confirmada: "não
// consegui reproduzir end-to-end; no harness a tool-call roteirizada não chegou a
// gravar `escolha` nem no caso positivo, então não sei se o caminho está inerte
// ou se a sonda não o alcança". Eu tinha falhado antes no mesmo ponto e apaguei a
// tentativa em vez de commitar um teste que passava sem exercitar nada.
//
// O que faltava aos dois: a tool resolve o `groupId` contra as ofertas
// PERSISTIDAS da conversa (`listShownOffersForConversation`). Com `metaInicial`
// sintético não há oferta persistida, `find` devolve undefined e a tool é inerte
// — verde por vacuidade. Aqui o turno 1 roda a BUSCA DE VERDADE, e o `groupId` é
// o do próprio mock (`mock-rodobens-3`, do G171).
//
// O CONTROLE POSITIVO é a parte que torna este arquivo confiável: ele prova que
// a tool DE FATO grava `escolha` quando nada a veta. Sem ele, os casos negativos
// não valeriam nada — seria impossível distinguir "o veto funcionou" de "o
// caminho nunca rodou", que é exatamente a dúvida que a 9ª revisão registrou.
//
// O defeito: o veto era `detectYesNoText(...) === false` — a MESMA metade de
// predicado que o FIX-407 acabou de corrigir em dois outros lugares. Recusa sem
// a palavra "não" devolve `null`, não `false`:
//
//   detectYesNoText("de jeito nenhum", "ready_to_proceed") → null → NÃO vetava
//
// E isto importa mais do que parece: `converse` roda DEPOIS de `advance`, então
// esta escrita SOBRESCREVE o funil — ela é a última palavra do turno.
import { afterAll, describe, expect, it } from "vitest";
import { buscaDoMock } from "./testing/grupos-do-mock";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Do G171, exibido pelo reveal do turno 1 (crédito ≥ 150 mil). */
const RODOBENS = "mock-rodobens-3";

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

async function comToolCall(fala: string, intent: "ready_to_proceed" | "declines" | "neutral") {
	return runScenario({
		busca: buscaDoMock(96),
		metaInicial: ANTES_DA_BUSCA,
		turns: [
			BUSCA,
			{
				user: fala,
				intent,
				// ⚠️ A tool-call vai no SEGUNDO beat, e isto não é detalhe de estilo:
				// medido, com ela no PRIMEIRO beat o `converse` não materializa
				// `tool_calls` e o caminho fica inerte — o cenário passa sem tocar em
				// nada. Foi exatamente onde a 9ª revisão independente parou ("não sei se
				// o caminho está inerte ou se a sonda não o alcança") e onde eu já tinha
				// desistido antes. O CONTROLE POSITIVO abaixo é o que expõe a diferença.
				beats: [
					{ text: "Certo." },
					{
						text: "",
						toolCalls: [{ name: "escolher_cota", args: { groupId: RODOBENS } }],
					},
				],
			},
		],
	});
}

describeIfDb("FIX-410 — o veto da tool `escolher_cota` usa o predicado INTEIRO", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("CONTROLE POSITIVO: sem recusa, a tool grava a escolha", async () => {
		// Este teste não guarda invariante nenhum — ele guarda os OUTROS testes.
		// Se ele quebrar, os casos negativos abaixo passam a ser vacuosos e param de
		// provar qualquer coisa. Foi a ausência desta prova que deixou a 9ª revisão
		// sem conseguir classificar a tool.
		const r = await comToolCall("é essa que eu quero", "ready_to_proceed");
		criadas.push(r.conversationId);

		expect(r.meta.revealCompleted, "o reveal precisa ter rodado").toBe(true);
		expect(r.meta.escolha?.administradora, "a tool precisa estar VIVA").toBe("RODOBENS");
	});

	it.each([
		// Recusa SEM a palavra "não" — `detectYesNoText` devolve `null` aqui, e o
		// veto antigo só barrava `false`. Todas com intent `ready_to_proceed` de
		// propósito: a sonda `pnpm sonda:intent` mostrou que o analyzer real rotula
		// assim várias recusas (FIX-388), então não dá pra confiar no rótulo.
		"de jeito nenhum",
		"nem pensar",
		"jamais",
		"detesto essa",
		"esquece",
		"deixa pra lá",
	])("recusa sem 'não' veta a gravação: %s", async (fala) => {
		const r = await comToolCall(fala, "ready_to_proceed");
		criadas.push(r.conversationId);
		expect(r.meta.escolha, fala).toBeUndefined();
	});

	it("recusa clássica segue vetada (o FIX-405 não regride)", async () => {
		const r = await comToolCall("não quero essa", "declines");
		criadas.push(r.conversationId);
		expect(r.meta.escolha).toBeUndefined();
	});
});
