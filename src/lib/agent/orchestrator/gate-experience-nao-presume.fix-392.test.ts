// FIX-392 — enquanto o gate está aberto, a resposta é DESCONHECIDA: o agente
// pergunta, não presume.
//
// Rodada 2026-07-29 (Bruna, print `2707-1720-bruna-DIRETO-texto-automatico.jpg`,
// mandado no privado em 27/07 17:20 e reenviado no grupo em 29/07 11:32). Depois
// de entregar os cards de oferta, o agente escreveu, num só balão:
//
//   "Já que é sua primeira vez com consórcio, deixa eu explicar rápido como
//    funciona: você entra em um grupo de pessoas que querem comprar um carro,
//    todos pagam uma parcela mensal SEM juros, e a cada mês alguém é
//    contemplado por sorteio ou oferecendo um lance — quando chegar a sua vez,
//    você recebe a carta e compra o carro à vista.
//    Você já fez consórcio antes?"
//
// …com os chips "É a primeira vez / Já conheço / Tenho dúvidas" logo abaixo. Ele
// afirmou que era a primeira vez DELA e depois perguntou se era. A Bruna
// descreveu como "foi automático o texto abaixo" — e ela estava certa: soou
// automático porque foi presumido.
//
// ⚠️ O QUE **NÃO** É BUG AQUI: a explicação vir DEPOIS das ofertas. Isso é
// decisão do Kairo (ADR `2026-07-09-agente-vendas-consorcio.md`, D2 — gate
// `experience` desceu pra pós-reveal de propósito: "ver grupos primeiro,
// explicar só pra novato"). Não se toca nisso.
//
// O bug é a PRESUNÇÃO, e o modelo não a inventou: `GATE_INTENT.experience`
// mandava "Se ele disser que é a primeira vez, EXPLIQUE o mecanismo no MESMO
// turno" — uma condicional cuja condição o modelo ainda não podia avaliar,
// porque o gate estava justamente perguntando aquilo. Obedecer literalmente
// exige adivinhar a resposta. A explicação do print é a lista da instrução,
// item por item.
//
// Invariante: a intenção de um gate ABERTO nunca pode instruir comportamento
// condicionado à resposta daquele mesmo gate no mesmo turno. É a lei "não aja
// sobre entidade não-ancorada" aplicada a um atributo do CLIENTE — irmã da
// regra "número vem de tool, nunca da cabeça do modelo".
import { describe, expect, it } from "vitest";
import { GATE_INTENT } from "./system-context";

describe("FIX-392 — intenção de gate não presume a própria resposta", () => {
	it("experience: não manda explicar no MESMO turno condicionado à resposta", () => {
		const intent = GATE_INTENT.experience;
		expect(intent).toBeDefined();
		const t = intent.toLowerCase();

		// A construção exata que produziu o bug: condicional + "mesmo turno".
		const condicionaAResposta = /se ele disser|caso ele diga|se for a primeira/.test(t);
		const mandaNoMesmoTurno = /mesmo turno/.test(t);
		expect(condicionaAResposta && mandaNoMesmoTurno).toBe(false);
	});

	it("experience: diz explicitamente que a resposta AINDA não é conhecida", () => {
		const t = GATE_INTENT.experience.toLowerCase();
		// Sem isto o modelo continua livre pra abrir com "já que é sua primeira
		// vez". A instrução tem que nomear a ignorância.
		expect(t).toMatch(
			/não presuma|nao presuma|não afirme|nao afirme|ainda não sabe|ainda nao sabe/,
		);
	});

	it("experience: a explicação fica pro turno SEGUINTE, depois da resposta", () => {
		const t = GATE_INTENT.experience.toLowerCase();
		expect(t).toMatch(/próximo turno|proximo turno|turno seguinte|depois que ele responder/);
	});

	it("experience: não fixa a categoria do bem na explicação (nada de 'carro' hardcoded)", () => {
		// No print a explicação falava "comprar um carro" / "compra o carro à
		// vista". A categoria da conversa é do estado (`currentCategory`), não um
		// exemplo colado na instrução — senão quem busca imóvel ouve sobre carro.
		const t = GATE_INTENT.experience.toLowerCase();
		expect(t).not.toMatch(/\bcarro\b/);
	});

	it("NENHUM gate condiciona comportamento à resposta que ele mesmo está pedindo", () => {
		const infratores = Object.entries(GATE_INTENT)
			.filter(([, intent]) => {
				const t = intent.toLowerCase();
				return /se ele disser|caso ele diga/.test(t) && /mesmo turno/.test(t);
			})
			.map(([gate]) => gate);
		expect(infratores).toEqual([]);
	});

	it("experience continua pedindo o que precisa saber (o fix não pode esvaziar o gate)", () => {
		const t = GATE_INTENT.experience.toLowerCase();
		expect(t).toMatch(/cons[óo]rcio/);
		expect(GATE_INTENT.experience.length).toBeGreaterThan(60);
	});
});
