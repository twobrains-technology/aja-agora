// FIX-378 — o número que o cliente disse não pode virar outro número.
//
// Visto ao vivo (Kairo, 2026-07-26): o cliente escreveu "100 reais". O agente
// respondeu "você deve ter querido dizer R$ 100.000,00, certo?"; o cliente
// corrigiu ("foi 100 reais mesmo") — e o estado guardou R$ 1.000,00. Dez vezes
// o que ele falou, sem que ninguém tivesse dito aquele número.
//
// Esse valor virou `creditMax` e disparou a corrente do FIX-377 (busca abaixo
// do piso → vazio → loop). Ou seja: não é só cosmético, é o gatilho.
//
// A checagem é ANCORAGEM, não adivinhação de intenção: o valor extraído tem que
// ser derivável dos números que estão no texto. Não cabe ao guard decidir se o
// cliente quis dizer outra coisa — cabe recusar o que ele NÃO disse.
import { describe, expect, it } from "vitest";
import { valorAncoradoNoTexto } from "./valor-declarado";

describe("FIX-378 — valor extraído tem que estar ancorado na fala do cliente", () => {
	it("recusa o valor inflado que ninguém disse (o bug real)", () => {
		expect(valorAncoradoNoTexto("100 reais", 1_000)).toBe(false);
		expect(valorAncoradoNoTexto("uai, falei que só podia pagar 100 reais por mês", 1_000)).toBe(
			false,
		);
		// A inflação clássica: transformar reais em milhares por conta própria.
		expect(valorAncoradoNoTexto("100 reais", 100_000)).toBe(false);
	});

	it("aceita o valor exatamente como foi dito", () => {
		expect(valorAncoradoNoTexto("100 reais", 100)).toBe(true);
		expect(valorAncoradoNoTexto("quero um carro de uns 180 mil", 180_000)).toBe(true);
		expect(valorAncoradoNoTexto("uns 90 mil", 90_000)).toBe(true);
		expect(valorAncoradoNoTexto("200k", 200_000)).toBe(true);
		expect(valorAncoradoNoTexto("R$ 1.200,50 por mês", 1200.5)).toBe(true);
		expect(valorAncoradoNoTexto("entre 100 e 200 mil", 200_000)).toBe(true);
	});

	it("é permissivo quando o texto não traz número", () => {
		// O valor pode ter vindo do slider (`value_picker`), de um card ou de um
		// turno anterior. Bloquear aqui quebraria o fluxo legítimo — o guard só
		// existe pra pegar CONTRADIÇÃO entre o que foi dito e o que foi gravado.
		expect(valorAncoradoNoTexto("pode ser esse mesmo", 180_000)).toBe(true);
		expect(valorAncoradoNoTexto("", 50_000)).toBe(true);
		expect(valorAncoradoNoTexto("quero um carro novo", 90_000)).toBe(true);
	});

	it("tolera a escrita de dinheiro do dia a dia", () => {
		expect(valorAncoradoNoTexto("R$ 180.339", 180_339)).toBe(true);
		expect(valorAncoradoNoTexto("180.000,00", 180_000)).toBe(true);
		expect(valorAncoradoNoTexto("uns 250 milhões", 250_000_000)).toBe(true);
		// "mil" grudado no número, sem espaço.
		expect(valorAncoradoNoTexto("90mil", 90_000)).toBe(true);
	});
});

// FIX-431 (P0 #2) — a resposta numérica NUA à pergunta de valor.
//
// Produção, WhatsApp, 2026-08-13, sessão `a68b1945`. O agente perguntou o valor
// do BYD Song; o cliente respondeu **"238"**. O analyzer entendeu certo
// (R$ 238.000 — é o preço do carro e o único sentido possível na frase), mas
// este guard vetou: `valoresPlausiveis("238")` devolve `[238]`, e 238 ≠ 238000.
//
// O veto apagou o `creditMax`, deixou `creditMin` órfão, e o funil ficou preso
// no gate `credit` para sempre — o escape do FIX-307 repromovia o valor a cada
// 3 turnos e este guard revertia. Foi assim que a venda de R$ 238 mil morreu.
//
// A correção NÃO abre a porta: a escala implícita de milhar só vale no turno em
// que o servidor PERGUNTOU o valor do bem. Fora dele, "238" solto continua sem
// ancorar — que é o caso que o FIX-378 nasceu para pegar.
describe("FIX-431 — resposta numérica nua no gate de valor", () => {
	it("no gate de valor, '238' ancora R$ 238.000 (o caso da venda perdida)", () => {
		expect(valorAncoradoNoTexto("238", 238_000, { escalaImplicita: true })).toBe(true);
	});

	it("fora do gate de valor, '238' continua NÃO ancorando 238.000", () => {
		expect(valorAncoradoNoTexto("238", 238_000)).toBe(false);
	});

	it("a escala implícita não legitima qualquer número: '238' não vira 500.000", () => {
		expect(valorAncoradoNoTexto("238", 500_000, { escalaImplicita: true })).toBe(false);
	});

	it("o valor literal continua valendo com a escala ligada ('1200' = R$ 1.200)", () => {
		expect(valorAncoradoNoTexto("1200", 1_200, { escalaImplicita: true })).toBe(true);
	});

	it("quem já escreveu a escala não muda de comportamento", () => {
		expect(valorAncoradoNoTexto("238 mil", 238_000, { escalaImplicita: true })).toBe(true);
		expect(valorAncoradoNoTexto("22k", 22_000, { escalaImplicita: true })).toBe(true);
	});

	// O guard nasceu deste caso: "100 reais" virando R$ 1.000. Com a escala
	// implícita ligada, "100 reais" ainda não pode virar 100.000 — a unidade
	// está escrita na frase.
	it("unidade escrita na frase vence a escala implícita", () => {
		expect(valorAncoradoNoTexto("100 reais", 100_000, { escalaImplicita: true })).toBe(false);
	});
});

// Risco levantado na auditoria de 2026-08-13: com a escala implícita ligada,
// QUALQUER número nu passaria a legitimar o seu ×1000 — "3" (de "Ok 3 anos")
// autorizaria `creditMax = 3.000` se o analyzer errasse. A escala existe para
// resolver "238" → R$ 238 mil, que é resposta de PREÇO DE BEM; um bem de
// R$ 3.000 não existe em nenhuma categoria que a Bevi opera.
describe("FIX-431 — a escala implícita não vale para número que não é preço de bem", () => {
	it("'3' não legitima R$ 3.000 nem no gate de valor", () => {
		expect(valorAncoradoNoTexto("Ok 3 anos", 3_000, { escalaImplicita: true })).toBe(false);
	});

	it("'12' (meses) não legitima R$ 12.000", () => {
		expect(valorAncoradoNoTexto("12", 12_000, { escalaImplicita: true })).toBe(false);
	});

	// O piso é o do bem mais barato que a jornada vende (moto). Abaixo disso, a
	// escala não se aplica — acima, resolve o caso real.
	it("'22' ancora R$ 22 mil (a moto da sessão 04fda013)", () => {
		expect(valorAncoradoNoTexto("22", 22_000, { escalaImplicita: true })).toBe(true);
	});

	it("'238' ancora R$ 238 mil (a venda perdida)", () => {
		expect(valorAncoradoNoTexto("238", 238_000, { escalaImplicita: true })).toBe(true);
	});
});
