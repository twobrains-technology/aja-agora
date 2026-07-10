import { describe, expect, it } from "vitest";
import { SPECIALIST_BASE_PROMPT } from "./system-prompt";

// FIX-259 (rodada 5, veredito Fable r4, P1 #2): quando o fechamento troca a
// administradora confirmada (BUG-ADMIN-TROCADA-NO-FECHAMENTO em forma nova), o
// agente negava a proposta real registrada e prometia "refazer com a marca
// pedida" — impossível (reprocessar a mesma simulação devolve a MESMA oferta),
// virando um loop. Regra estática: nunca negar, nunca prometer refazer.

describe("FIX-259 — nunca nega a oferta real registrada, nunca promete refazer com marca indisponível", () => {
	it("proíbe prometer 'refazer'/'trocar'/'simular de novo' com outra administradora", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/refaz/i);
		expect(SPECIALIST_BASE_PROMPT.toLowerCase()).toMatch(/nunca prometa|proibido prometer/);
	});

	it("proíbe negar a oferta/proposta registrada quando o usuário contesta", () => {
		expect(SPECIALIST_BASE_PROMPT.toLowerCase()).toMatch(/n[ãa]o negue|nunca negue/);
	});

	it("oferece os dois próximos passos reais (aceitar a exibida OU escolher outra ANTES de confirmar)", () => {
		expect(SPECIALIST_BASE_PROMPT.toLowerCase()).toMatch(/seguir com a oferta/);
		expect(SPECIALIST_BASE_PROMPT.toLowerCase()).toMatch(/escolher outra/);
	});
});
