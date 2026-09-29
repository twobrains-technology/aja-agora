/**
 * bloco-telefone-ab — a REGRA do desbloqueio do telefone, testada pura.
 *
 * A mesma pergunta — "esta visita já pode ver a comparação?" — é feita no
 * servidor (para decidir o que emitir) e no cliente (para decidir o que
 * renderizar). Este teste trava a resposta ÚNICA, para as duas pontas não
 * divergirem — que é o defeito clássico deste tipo de card (a tela mostra o que
 * o servidor já decidiu esconder, ou o contrário).
 *
 * Cobre FIX-394 (variante → estado), FIX-395 (variante B) e FIX-396 (variante C).
 * Nenhum teste aqui toca banco nem rede.
 */

import { describe, expect, it } from "vitest";
import {
	comparacaoLiberada,
	estadoDoDesbloqueio,
	temCardDeTelefone,
} from "./desbloqueio-do-telefone";

describe("estadoDoDesbloqueio — a regra", () => {
	it("variante B sem telefone ⇒ pede-antes (a comparação NÃO foi liberada)", () => {
		expect(estadoDoDesbloqueio({ variante: "B", celularConhecido: false })).toBe("pede-antes");
	});

	it("variante C sem telefone ⇒ borrado (a comparação veio, escondida)", () => {
		expect(estadoDoDesbloqueio({ variante: "C", celularConhecido: false })).toBe("borrado");
	});

	it("telefone já conhecido ⇒ livre, nas DUAS variantes", () => {
		expect(estadoDoDesbloqueio({ variante: "B", celularConhecido: true })).toBe("livre");
		expect(estadoDoDesbloqueio({ variante: "C", celularConhecido: true })).toBe("livre");
	});

	it("'Agora não' ⇒ livre (só a variante C tem essa saída)", () => {
		expect(
			estadoDoDesbloqueio({ variante: "C", celularConhecido: false, recusado: true }),
		).toBe("livre");
	});

	it("telefone conhecido GANHA da recusa (nunca trava quem já deu o número)", () => {
		expect(
			estadoDoDesbloqueio({ variante: "C", celularConhecido: true, recusado: true }),
		).toBe("livre");
	});
});

describe("comparacaoLiberada — o que o servidor pode emitir", () => {
	it("em pede-antes a comparação NÃO pode aparecer", () => {
		expect(comparacaoLiberada("pede-antes")).toBe(false);
	});

	it("em borrado e livre ela aparece (borrada ou legível é renderização)", () => {
		expect(comparacaoLiberada("borrado")).toBe(true);
		expect(comparacaoLiberada("livre")).toBe(true);
	});
});

describe("temCardDeTelefone", () => {
	it("livre ⇒ sem card; pede-antes/borrado ⇒ com card", () => {
		expect(temCardDeTelefone("livre")).toBe(false);
		expect(temCardDeTelefone("pede-antes")).toBe(true);
		expect(temCardDeTelefone("borrado")).toBe(true);
	});
});