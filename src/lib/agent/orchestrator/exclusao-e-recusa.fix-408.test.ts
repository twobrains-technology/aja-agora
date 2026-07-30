// FIX-408 — excluir uma marca é recusá-la. A família da EXCLUSÃO.
//
// Nono achado, nona revisão independente, mesma classe das oito anteriores — e o
// mais caro de todos, porque atinge o campo que efetivamente move dinheiro.
//
// Cenário medido no grafo real (canal web, Postgres real):
//
//   turno 1: "manda as opções"                              → reveal com G171
//   turno 2: "qualquer uma menos a Rodobens, quero fechar"
//
//   → recommendedOffer.administradora = RODOBENS
//   → contract_form.administradora    = RODOBENS   ← a marca que ele EXCLUIU
//
// A causa é lexical e simétrica à do FIX-402: `NEGATION_TRIGGER` cresceu por
// achados pontuais (PRA LA, DE LADO, ESQUECE, CANCELA, NAO QUERO) e `falaRecusa`
// cobre a negação clássica mais a família enfática (de jeito nenhum, jamais,
// nunca…). Nenhuma das duas cobre a forma como as pessoas de fato eliminam uma
// opção de uma LISTA — que é o gesto natural depois de ver seis cards:
//
//   "qualquer uma menos a X" · "sem a X" · "menos a X" · "exceto a X"
//   "a X tá fora" · "tirei a X da lista" · "descarto a X" · "tirando a X"
//
// ⚠️ Este fix NÃO é uma caçada a sinônimos — a ressalva que o FIX-402 já fez e
// que continua valendo. Exclusão é uma FAMÍLIA SINTÁTICA fechada e reconhecível
// ("menos/sem/exceto/fora/tirando + marca"), não um sentimento a interpretar. É a
// mesma natureza da lista de afirmações em `yes-no.ts`: cada entrada é
// inequívoca.
//
// E a assimetria de custo é a de sempre, agora explícita: deixar de ancorar uma
// marca que o cliente queria custa UMA pergunta repetida (o card de decisão
// aparece). Ancorar a marca que ele excluiu custa o formulário de contrato da
// cota errada.
import { describe, expect, it } from "vitest";
import { resolveAdministradoraMention } from "./choose-offer";

type Oferta = Parameters<typeof resolveAdministradoraMention>[0][number];

const OFERTAS = [
	{
		groupId: "rodobens",
		administradora: "RODOBENS",
		creditValue: 171_000,
		monthlyPayment: 2_719,
		termMonths: 96,
	},
	{
		groupId: "canopus",
		administradora: "CANOPUS",
		creditValue: 170_000,
		monthlyPayment: 1_092,
		termMonths: 96,
	},
] as unknown as Oferta[];

describe("FIX-408 — exclusão explícita não ancora a marca excluída", () => {
	it.each([
		"qualquer uma menos a Rodobens",
		"sem a Rodobens",
		"menos a Rodobens",
		"exceto a Rodobens",
		"a Rodobens tá fora",
		"tirei a Rodobens da lista",
		"a Rodobens eu descarto",
		"tirando a Rodobens",
		// Com o pedido de fechamento na mesma frase — a forma exata que a 9ª
		// revisão mediu chegando ao `contract_form`.
		"qualquer uma menos a Rodobens, quero fechar",
	])("não resolve para a marca excluída: %s", (fala) => {
		expect(resolveAdministradoraMention(OFERTAS, fala)?.administradora, fala).not.toBe("RODOBENS");
	});

	it.each([
		// Objeção de PREÇO sobre a marca. Quem reclama do preço de uma cota não
		// está escolhendo essa cota — e o card de decisão perguntar é o desfecho
		// correto aqui.
		"a Rodobens tá cara demais",
		"a Rodobens é caro demais pra mim",
	])("objeção de preço sobre a marca não a ancora: %s", (fala) => {
		expect(resolveAdministradoraMention(OFERTAS, fala)?.administradora, fala).not.toBe("RODOBENS");
	});

	it("exclui UMA e afirma a OUTRA: resolve para a afirmada", () => {
		// A metade que impede o fix de virar "exclusão paralisa tudo". Dizer o que
		// NÃO quer é a forma mais comum de dizer o que quer, e o vendedor tem que
		// acompanhar: aqui a Canopus é uma escolha explícita, e ela deve valer.
		expect(
			resolveAdministradoraMention(OFERTAS, "qualquer uma menos a Rodobens, quero a Canopus")
				?.administradora,
		).toBe("CANOPUS");
		expect(
			resolveAdministradoraMention(OFERTAS, "sem a Rodobens, prefiro a Canopus")?.administradora,
		).toBe("CANOPUS");
	});

	it.each([
		// ⚠️ A contraprova que protege a venda. Se a família da exclusão vazasse
		// para além da sintaxe fechada, um pedido legítimo pararia de resolver — e
		// perder venda é o defeito que este projeto já cometeu duas vezes tentando
		// se proteger de inferência.
		"quero a Rodobens",
		"bora fechar com a Rodobens",
		"a Rodobens me atende",
		"prefiro a Rodobens mesmo",
		"pode ser a Rodobens",
		// "menor" NÃO é "menos" — a de menor parcela do conjunto é a Canopus, e
		// esta frase não exclui ninguém.
		"quero a Rodobens, que é a de menor prazo",
	])("pedido legítimo continua resolvendo: %s", (fala) => {
		expect(resolveAdministradoraMention(OFERTAS, fala)?.administradora, fala).toBe("RODOBENS");
	});
});
