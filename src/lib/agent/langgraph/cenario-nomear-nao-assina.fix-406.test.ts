// FIX-406 — nomear uma cota MOVE a conversa, mas não ASSINA por ela.
//
// Este é o fim de uma linha de oito revisões independentes. Todas acharam a
// mesma classe de defeito, cada vez num ponto mais fino:
//
//   1  "faz sentido" não era aceite            5  substring / oferta stale
//   2  recusa sem "não" virava ACEITE          6  proxy do WhatsApp, fora do grafo
//   3  adversativa CRIAVA aceite               7  casamento por NOME ignora recusa
//   4  "aceito" no gate errado ancorava        8  "Itaú, não obrigado" ancorava Itaú
//
// O FIX-400 removeu as origens `afirmacao` e `criterio` e manteve `mencao`,
// porque a 5ª revisão a classificou como "verificável": o nome ou bate com uma
// oferta da tela, ou não bate. O DADO é verificável mesmo — o erro foi concluir
// que a INTENÇÃO também era. As rodadas 6, 7 e 8 vazaram exatamente aqui, e
// sempre pelo mesmo motivo: entre "o cliente pronunciou a marca X" e "o cliente
// escolheu X" existe interpretação de linguagem, e é ali que a regressão mora.
//
// A palavra do Kairo, que já cobria este caso: "escolha e decisionDispatched só
// via clique no card. Texto livre é para conversa, não para comprometer
// dinheiro."
//
// ── O CORTE É CIRÚRGICO, e a distinção é o ponto do fix ──
//
// Nomear uma marca continua fazendo TUDO que é sobre conversa: a cota ancorada
// muda, os números do balão passam a ser os dela, o card certo aparece. O agente
// segue a atenção do cliente como um vendedor seguiria. O que nomear deixa de
// fazer é registrar `escolha` e `decisionDispatched` — ou seja, comprometer
// dinheiro. Pra isso existe o card de decisão, que é um clique, e cujo payload é
// dado do servidor em vez de texto interpretado.
//
// ── SOBRE ESTE TESTE, que é o motivo de ele existir neste formato ──
//
// A primeira versão que escrevi passou 11/11 de primeira e NÃO PROVAVA NADA:
// montava o estado com `metaInicial` (`revealCompleted: true`) e nomeava marcas.
// Só que a resolução por menção é um lookup contra as ofertas PERSISTIDAS da
// conversa, e um meta sintético não persiste oferta nenhuma — então o resolver
// devolvia null em todos os casos, e o verde vinha de o caminho jamais ter sido
// tocado. Metade dos nomes que usei (`Banco do Brasil`) nem estava na lista que
// o mock devolve pra aquela faixa de crédito.
//
// Por isso o cenário aqui roda a BUSCA DE VERDADE no primeiro turno: as ofertas
// nascem do fluxo, ficam persistidas, e o segundo turno nomeia uma marca que
// está comprovadamente na tela (RODOBENS, do grupo G171). Medido antes da
// correção, este mesmo cenário devolvia:
//
//   escolha: { origem: "mencao", groupId: "mock-rodobens-3", creditValue: 171000 }
//
// Teste que passa sem exercitar o caminho é pior que cobertura ausente — a
// ausência a gente enxerga.
//
// 2026-08-19 (PRD "Destravar o agente", D6) — A PORTA QUE SE ABRIU AO LADO
// DESTA PAREDE, e por que ela não a derruba.
//
// A parede continua de pé: TEXTO LIVRE não assina. O que se descobriu em
// produção é que ela tinha engolido, junto, a porta legítima — o cliente
// respondendo à pergunta de escolha que o PRÓPRIO agente fez, com os atalhos
// que o PRÓPRIO produto ofereceu ("A de prazo mais curto"). Ele cooperava e não
// tinha caminho até o contrato.
//
// A porta nova exige TRÊS fatos simultâneos, e o primeiro é estado do servidor,
// não interpretação de fala: (1) o servidor ofertou uma escolha entre cotas
// específicas no turno anterior (`escolhaOfertada`, coagida por ele mesmo a
// partir dos atalhos), (2) a fala resolve deterministicamente para UMA daquelas
// cotas, (3) é a MESMA que o modelo indicou. Fora disso, o veto é o de sempre.
//
// A prova de que as duas coisas convivem está em `cenario-jornada-rute.test.ts`:
// lá, a mesma frase ancora COM a pergunta de escolha aberta e NÃO ancora sem
// ela.

import { afterAll, describe, expect, it } from "vitest";
import { buscaDoMock } from "./testing/grupos-do-mock";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Antes da busca, mas com o RESTO do funil já respondido. As duas metades
 * importam:
 *
 * · `searchDispatched` ausente faz o reveal acontecer DE VERDADE no primeiro
 *   turno — é o que persiste as ofertas contra as quais a menção resolve, e sem
 *   o que este cenário passaria por vacuidade (ver o cabeçalho).
 * · o resto respondido é o que deixa o funil CHEGAR na decisão. Sem isso o gate
 *   pendente é `experience`, e o teste do card de decisão falharia por a
 *   pergunta certa estar na mesa — não por regressão.
 *
 * R$ 180 mil cai no G171 (CANOPUS, ÂNCORA, ITAÚ, RODOBENS). */
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

describeIfDb("FIX-406 — nomear cota move a conversa, não assina contrato", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("nomear uma marca EXIBIDA não grava escolha nem decisionDispatched", async () => {
		const r = await runScenario({
			busca: buscaDoMock(96),
			metaInicial: ANTES_DA_BUSCA,
			turns: [
				BUSCA,
				{
					user: "bora fechar com a Rodobens",
					intent: "ready_to_proceed",
					beats: [{ text: "Fechado." }],
				},
			],
		});
		criadas.push(r.conversationId);

		// Sentinela de não-vacuidade: se o reveal não tiver acontecido, a menção
		// não teria contra o que resolver e o teste passaria por acidente — que foi
		// exatamente como a 1ª versão deste arquivo se enganou.
		expect(r.meta.revealCompleted, "o reveal precisa ter rodado de verdade").toBe(true);

		expect(r.meta.escolha).toBeUndefined();

		// ⚠️ `decisionDispatched` FICA true aqui, e está certo: ele significa "o card
		// de decisão foi EXIBIDO", e foi — é o efeito desejado do fix (perguntar em
		// vez de assumir), não o resíduo dele. Uma versão anterior deste teste
		// afirmava o contrário e falhava por confundir os dois sentidos.
		//
		// O que NÃO pode voltar é o dispatch nascer da MENÇÃO, junto com a escolha,
		// pulando a pergunta. `escolha === undefined` acima é o que prova isso: as
		// duas escritas eram do mesmo bloco, e ele deixou de existir.
	});

	it("mas a conversa SEGUE o cliente: a cota ancorada passa a ser a que ele nomeou", async () => {
		// A metade que impede este fix de virar "ignorar o cliente". Sem ela, a
		// correção poderia ser lida como "nomear não faz nada" — e aí o agente
		// continuaria falando dos números do Canopus depois de o cliente perguntar
		// pela Rodobens, que é defeito de conversa, não segurança.
		const r = await runScenario({
			busca: buscaDoMock(96),
			metaInicial: ANTES_DA_BUSCA,
			turns: [
				BUSCA,
				{
					user: "bora fechar com a Rodobens",
					intent: "ready_to_proceed",
					beats: [{ text: "Fechado." }],
				},
			],
		});
		criadas.push(r.conversationId);

		expect(r.meta.recommendedOffer?.administradora).toBe("RODOBENS");
		// Os números viajam JUNTOS com a cota (invariante do FIX-375): trocou de
		// grupo, o lance médio e a parcela são os DELE, nunca herdados do anterior.
		expect(r.meta.recommendedOffer?.creditValue).toBe(171_000);
		expect(r.meta.recommendedOffer?.monthlyPayment).toBe(2_719.11);
		expect(r.meta.recommendedOffer?.avgBidValue).toBe(89_946);
	});

	it("no lugar da inferência, aparece o card de DECISÃO — o clique é do cliente", async () => {
		const r = await runScenario({
			busca: buscaDoMock(96),
			metaInicial: ANTES_DA_BUSCA,
			turns: [
				BUSCA,
				{
					user: "bora fechar com a Rodobens",
					intent: "ready_to_proceed",
					beats: [{ text: "Fechado." }],
				},
			],
		});
		criadas.push(r.conversationId);

		// A contrapartida de não inferir é PERGUNTAR. Sem isto, o funil ficaria
		// mudo justamente no momento do fecho — que é o defeito oposto, e igualmente
		// caro: o cliente pede pra fechar e o agente não oferece por onde.
		const trilha = r.turns.flatMap((t) => t.trilha);
		expect(trilha.some((t) => t.includes("decision"))).toBe(true);
	});

	it("SUPERADO PELO FIX-413: nomear NÃO leva mais a cota ao formulário", async () => {
		// ⚠️ Este teste afirmava o CONTRÁRIO até o FIX-413, e a inversão é o registro
		// mais honesto do que aconteceu nesta campanha.
		//
		// Eu escrevi aqui: "quem chega ao contract_form é recommendedAdministradora,
		// não escolha — confundir os dois é o que fez as rodadas anteriores parecerem
		// resolvidas". Estava certo no diagnóstico e ERRADO na conclusão: em vez de
		// tirar o texto do caminho do dinheiro, eu passei a EXIGIR que o texto
		// acertasse a marca. Ou seja, transformei o bug num requisito, e blindei-o
		// com um teste.
		//
		// Duas revisões independentes depois, a separação chegou: `contractOffer` só
		// nasce de ação estruturada, e o formulário lê apenas ela. Nomear uma marca
		// continua movendo a CONVERSA (o teste acima), e deixou de amarrar dinheiro.
		const r = await runScenario({
			busca: buscaDoMock(96),
			metaInicial: ANTES_DA_BUSCA,
			turns: [
				BUSCA,
				{
					user: "bora fechar com a Rodobens",
					intent: "ready_to_proceed",
					beats: [{ text: "Fechado." }],
				},
			],
		});
		criadas.push(r.conversationId);

		const form = r.turns
			.flatMap((t) => t.events)
			.find((e) => e.type === "artifact" && e.artifactType === "contract_form");
		expect(form, "o formulário precisa ter saído — senão o teste não prova nada").toBeDefined();
		expect(
			(form as { payload: { administradora?: string } }).payload.administradora,
		).toBeUndefined();
		expect(r.meta.contractOffer).toBeUndefined();
	});

	it("recusar a marca nomeada não ancora coisa nenhuma (a 8ª revisão, in loco)", async () => {
		// "Itaú, não obrigado" foi o achado CRÍTICO da 8ª revisão, e nasceu de uma
		// exceção de vírgula que eu mesmo tinha introduzido pra resolver outro caso.
		// Com a menção fora do caminho da escolha, a frase deixa de ter qualquer
		// poder de comprometer — mas o teste fica, porque a re-âncora de conversa
		// continua viva e ela não pode seguir uma marca RECUSADA.
		const r = await runScenario({
			busca: buscaDoMock(96),
			metaInicial: ANTES_DA_BUSCA,
			turns: [
				BUSCA,
				{ user: "Rodobens, não obrigado", intent: "declines", beats: [{ text: "Sem problema." }] },
			],
		});
		criadas.push(r.conversationId);

		expect(r.meta.escolha).toBeUndefined();
		expect(r.meta.recommendedOffer?.administradora).not.toBe("RODOBENS");
	});
	it("a porta nova exige a oferta do SERVIDOR — nomear continua não assinando", async () => {
		// PRD 19/08/2026 (D6): responder à pergunta de escolha do agente passou a
		// ancorar, mas SÓ com `escolhaOfertada` no estado (fato que o servidor
		// grava ao emitir os atalhos). Nomear a marca solto, como aqui, segue
		// movendo a conversa e não assinando nada — que é o invariante deste
		// arquivo.
		const r = await runScenario({
			busca: buscaDoMock(96),
			metaInicial: ANTES_DA_BUSCA,
			turns: [
				BUSCA,
				{
					user: "quero a do Banco do Brasil",
					intent: "providing_info",
					beats: [{ text: "Boa escolha." }, { text: "Alguma dúvida?" }],
				},
			],
		});
		criadas.push(r.conversationId);
		expect(r.meta.escolha).toBeUndefined();
		expect(r.meta.contractOffer).toBeUndefined();
	});
});
