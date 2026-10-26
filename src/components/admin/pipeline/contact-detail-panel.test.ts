import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Guarda de acoplamento: o painel do contato era o ÚLTIMO lugar do admin que decides
 * sozinho como desenhar uma linha de `messages` (imprimia `[card: quick_reply]` literal)
 * e como ordená-la. Ele tem que obedecer o visualizador único e a ordem canônica. */
const FONTE = readFileSync(new URL("./contact-detail-panel.tsx", import.meta.url).pathname, "utf8");

describe("painel do contato — obedece o visualizador único e a ordem canônica", () => {
	it("desenha o corpo pela fonte única, não imprime o marcador cru", () => {
		expect(FONTE).toContain("ConteudoDaMensagem");
		expect(FONTE).toContain("ordenarMensagens");
		// O corpo não pode ser impresso cru: era assim que `[card: quick_reply]` aparecia na tela.
		expect(FONTE).not.toMatch(/<p[^>]*>\{msg\.content\}/);
	});

	it("tem o controle de teste no cabeçalho, com confirmação", () => {
		expect(FONTE).toContain('data-testid="marcar-como-teste"');
		expect(FONTE).toContain("Marcar como teste");
		expect(FONTE).toContain("Voltar a contar");
	});
});
