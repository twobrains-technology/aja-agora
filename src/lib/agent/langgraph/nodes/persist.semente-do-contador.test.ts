/**
 * O contador de turnos precisa de uma SEMENTE — senão toda retomada mente.
 *
 * ── O buraco ────────────────────────────────────────────────────────────────
 *
 * `funnel.turnosDoCliente` nasceu em 31/08/2026 e é persistido no metadata. Toda
 * conversa que já existia no banco antes disso — e toda conversa que o worker de
 * retomada acorda — chega sem o campo. Com `?? 0`, o primeiro turno depois da
 * volta se declara turno ZERO.
 *
 * Não é ruído inofensivo: `turnoDoCliente === 0` é exatamente a condição do
 * score `primeira_resposta_com_numero`. Uma conversa de dez turnos, retomada,
 * emitiria o score da PRIMEIRA resposta — e ele é justamente o instrumento que
 * vai julgar a campanha. Apontado na revisão crítica desta branch.
 *
 * ── Por que a semente vem de `state.messages`, se foi ela que errou antes ────
 *
 * A contagem por `messages` foi descartada como CONTADOR contínuo, e por um
 * motivo específico: `run-turn.ts` monta a lista por dois caminhos (banco no
 * primeiro turno, checkpointer + `resume` nos seguintes), e a fala corrente
 * entra em momentos diferentes em cada um — dava 0 → 1 → 3.
 *
 * Como SEMENTE ela serve, porque é lida uma vez só, no turno em que o campo
 * está ausente. E esse turno é sempre o primeiro de uma thread nova do grafo —
 * o ramo `else` de `run-turn.ts`, o único que popula `messages` a partir de
 * `loadConversationHistory`. Ali a lista é o histórico do banco: exata.
 *
 * A partir do turno seguinte o contador é próprio e a lista não é mais
 * consultada. O defeito antigo não volta porque o caminho instável nunca é lido.
 */

import { describe, expect, it } from "vitest";
import { sementeDoContador } from "./persist";

/** Uma fala, no formato que `getType()` do LangChain expõe. */
const fala = (tipo: "human" | "ai") => ({ getType: () => tipo }) as never;

describe("a semente do contador de turnos", () => {
	it("conversa nova: começa em zero", () => {
		// A lista já contém a fala corrente quando o nó roda — daí o desconto de um.
		expect(sementeDoContador(undefined, [fala("human")])).toBe(0);
		// E lista vazia não vira índice negativo.
		expect(sementeDoContador(undefined, [])).toBe(0);
	});

	it("conversa RETOMADA: continua de onde o histórico parou", () => {
		// Quatro falas anteriores + a corrente = cinco na lista → índice 4. Com
		// `?? 0` este turno se declararia o primeiro, e o score da primeira
		// resposta sairia numa conversa antiga.
		const historico = [
			fala("human"),
			fala("ai"),
			fala("human"),
			fala("ai"),
			fala("human"),
			fala("ai"),
			fala("human"),
			fala("ai"),
			fala("human"),
		];
		expect(sementeDoContador(undefined, historico)).toBe(4);
	});

	it("o campo existente MANDA — a semente é só para quem não tem", () => {
		// Depois do primeiro turno, `messages` vem do checkpointer e é instável
		// (foi ela que deu 0 → 1 → 3). O contador persistido é a verdade.
		const listaInstavel = [fala("human"), fala("human"), fala("human"), fala("human")];
		expect(sementeDoContador(2, listaInstavel)).toBe(2);
	});

	it("zero persistido não é confundido com ausente", () => {
		// `0 ?? x` devolve 0, mas `0 || x` devolveria x — e a conversa que
		// legitimamente está no turno zero seria semeada pelo histórico.
		expect(sementeDoContador(0, [fala("human"), fala("human"), fala("human")])).toBe(0);
	});

	it("só fala de GENTE conta", () => {
		const soAgente = [fala("ai"), fala("ai"), fala("ai")];
		expect(sementeDoContador(undefined, soAgente)).toBe(0);
	});
});
