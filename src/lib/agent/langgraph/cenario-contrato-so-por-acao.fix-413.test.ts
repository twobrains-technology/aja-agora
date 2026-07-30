// FIX-413 — A PAREDE. O formulário de contrato deixa de ler o campo que o texto escreve.
//
// Dez revisões independentes, notas 5,4,4,4,3,3,4,3,3,3. Todas acharam a MESMA
// classe. As duas últimas chegaram sozinhas ao mesmo diagnóstico, e ele é o
// certo:
//
//   `escolha` NUNCA foi o campo que move dinheiro. Quem chega ao `contract_form`
//   é `recommendedAdministradora` — e essa continua sendo escrita por resolução
//   de texto livre, de propósito, porque é ela que faz a conversa acompanhar a
//   atenção do cliente.
//
// Eu passei quatro rodadas fechando `escolha` e escrevendo em commit que a porta
// estava fechada. Estava — a porta errada. E o `advance.ts:328` já tinha a frase
// certa desde o FIX-406: "não se fecha porta a porta — fecha-se a parede".
//
// A decisão do Kairo, que sempre cobriu isto e que eu apliquei no campo errado:
// "Texto livre é para conversa, não para comprometer dinheiro. O custo extra do
// clique é o preço da segurança e da previsibilidade."
//
// ── A SEPARAÇÃO ──
//
//   `recommendedOffer` / `recommendedAdministradora`
//       = a COTA EM FOCO. Texto pode mexer à vontade. Alimenta a conversa, os
//         números do balão, os cards. Errar aqui custa uma frase confusa.
//
//   `contractOffer`
//       = a COTA DO CONTRATO. Nasce SÓ de ação estruturada: clique no card
//         (`choose_offer` resolve o groupId contra os artifacts REAIS;
//         `interest` traz a marca no payload do próprio card) ou da tool
//         `escolher_cota` (groupId conferido contra as ofertas exibidas + veto de
//         recusa). Errar aqui custa dinheiro — por isso não há caminho de texto.
//
// O `contract_form` e a checagem de conflito de proposta passam a ler APENAS
// `contractOffer`. Sem ação estruturada, o formulário sai SEM administradora
// amarrada e o cliente escolhe — em vez de sair amarrado na marca errada.
//
// ⚠️ O QUE ISSO TORNA IRRELEVANTE, e é o ponto: as listas lexicais continuam lá e
// continuam imperfeitas (a própria 10ª revisão achou 9 formas de exclusão que
// escapavam, e o resíduo da objeção de preço está documentado em
// `exclusao-e-recusa.fix-408.test.ts`). A diferença é que agora o pior desfecho
// delas é uma CONVERSA errada, não um CONTRATO errado. A décima primeira revisão
// pode achar a décima primeira frase; ela não vai mais chegar ao dinheiro.
import { afterAll, describe, expect, it } from "vitest";
import { buscaDoMock } from "./testing/grupos-do-mock";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

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

function formDe(r: Awaited<ReturnType<typeof jornada>>) {
	return r.turns
		.flatMap((t) => t.events)
		.find((e) => e.type === "artifact" && e.artifactType === "contract_form") as
		| { payload: { administradora?: string } }
		| undefined;
}

describeIfDb("FIX-413 — texto nunca amarra o contrato a uma administradora", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it.each([
		// Fala LIMPA: mesmo sem nenhuma recusa, texto não amarra contrato. É o
		// coração do fix — não se trata de detectar recusa melhor, e sim de tirar o
		// texto do caminho do dinheiro.
		"bora fechar",
		"quero fechar essa",
		// A família da exclusão que a 10ª revisão achou escapando das listas.
		"qualquer uma menos essa Rodobens, quero fechar",
		"sem ser a Rodobens, quero fechar",
		// E o resíduo ASSUMIDO: objeção de preço, que eu decidi não perseguir com
		// léxico. Aqui ela para de importar pro contrato.
		"a Rodobens é muito cara, quero fechar",
		"a Rodobens tá cara demais, quero fechar",
	])("o formulário não sai amarrado por texto: %s", async (fala) => {
		const r = await jornada(fala);
		criadas.push(r.conversationId);

		// Sentinela de não-vacuidade: sem reveal não há cota nenhuma em jogo e o
		// teste passaria por acidente — foi assim que eu me enganei duas vezes.
		expect(r.meta.revealCompleted, "o reveal precisa ter rodado").toBe(true);

		// O contrato não pode ter nascido de texto.
		expect(r.meta.contractOffer, fala).toBeUndefined();
		expect(formDe(r)?.payload.administradora, fala).toBeUndefined();
	});

	it("a CONVERSA continua seguindo o cliente — a cota em foco muda por texto", async () => {
		// A metade que impede o fix de virar "ignorar o cliente". A separação só faz
		// sentido se o lado da conversa permanecer livre: quem nomeia a Rodobens
		// continua sendo atendido na Rodobens, com os números dela.
		const r = await jornada("bora fechar com a Rodobens");
		criadas.push(r.conversationId);

		expect(r.meta.recommendedOffer?.administradora).toBe("RODOBENS");
		expect(r.meta.recommendedOffer?.monthlyPayment).toBe(2_719.11);
		// …mas isso NÃO é o contrato.
		expect(r.meta.contractOffer).toBeUndefined();
	});
});
