/**
 * A copy do gate de identidade acompanha o momento em que ele acontece.
 *
 * A vitrine moveu o `identify` de antes da busca para o fecho, e a copy foi
 * junto: de "pra eu trazer as ofertas reais" para "pra reservar essa cota no seu
 * nome". Verdadeira no mundo novo.
 *
 * Só que o kill switch da vitrine reverte o ESTADO e não revertia a FALA. Com
 * `VITRINE_CPF` vazio, `nextGate` volta a pedir o `identify` antes da busca — e
 * o cliente ouviria "pra reservar essa cota no seu nome" **sem cota nenhuma na
 * tela**. Prometer reserva de algo que o cliente ainda não viu é a classe de
 * fala que o CLAUDE.md deste projeto trata como defeito grave, e o dossiê
 * afirmava que desligar a vitrine "devolve o funil antigo inteiro".
 *
 * Devolve o estado. A fala tem que voltar junto.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gateQuestion } from "./gate-questions";

const ENV_ORIGINAL = { ...process.env };

afterEach(() => {
	process.env = { ...ENV_ORIGINAL };
});

describe("gateQuestion('identify')", () => {
	describe("com a vitrine ligada — o gate vive no fecho", () => {
		beforeEach(() => {
			process.env.VITRINE_CPF = "11144477735";
			process.env.VITRINE_CELULAR = "62992496793";
		});

		it("fala em seguir com a cota escolhida, na web", () => {
			expect(gateQuestion("identify", null, undefined, "web")).toContain("seguir com essa cota");
		});

		it("fala em seguir com a cota escolhida, no WhatsApp", () => {
			expect(gateQuestion("identify", null, undefined, "whatsapp")).toContain(
				"seguir com essa cota",
			);
		});
	});

	describe("com a vitrine desligada — o gate volta a ser pré-busca", () => {
		beforeEach(() => {
			process.env.VITRINE_CPF = "";
			process.env.VITRINE_CELULAR = "";
		});

		it("NÃO fala de uma cota que o cliente ainda não viu (web)", () => {
			const fala = gateQuestion("identify", null, undefined, "web") ?? "";

			expect(fala).not.toContain("seguir com essa cota");
			expect(fala.toLowerCase()).toContain("ofertas");
		});

		it("NÃO fala de uma cota que o cliente ainda não viu (WhatsApp)", () => {
			const fala = gateQuestion("identify", null, undefined, "whatsapp") ?? "";

			expect(fala).not.toContain("seguir com essa cota");
		});

		it("continua pedindo CPF nos dois casos — o dado exigido não mudou", () => {
			expect(gateQuestion("identify", null, undefined, "web")).toContain("CPF");
			expect(gateQuestion("identify", null, undefined, "whatsapp")).toContain("CPF");
		});
	});

	describe("a copy do CARD acompanha o mesmo momento", () => {
		// O card é client component: recebe `momento` no payload. Estes casos
		// travam os textos que a revisão adversarial pegou soltos — o aceite de
		// LGPD e o rótulo do botão de envio, que vira FALA PERSISTIDA do cliente e
		// é relida pelo modelo nos turnos seguintes.
		const fonte = readFileSync(
			join(process.cwd(), "src/components/chat/artifacts/gate-identity-form.tsx"),
			"utf8",
		);

		it("nenhum texto do card promete RESERVAR uma cota", () => {
			// O CLAUDE.md do projeto proíbe "cota reservada" antes da contratação, e
			// este passo só grava identidade — a proposta nasce no card seguinte.
			expect(fonte).not.toMatch(/reservar/i);
		});

		it("o aceite de LGPD é condicional, não fixo", () => {
			expect(fonte).toContain("pra seguir com a contratação");
			expect(fonte).toContain("pra simular as ofertas");
		});

		it("o rótulo persistido do envio é condicional", () => {
			// "Enviei meus dados pra buscar as ofertas" no FECHO ensinaria a ordem
			// antiga a partir da própria transcrição da conversa.
			expect(fonte).toContain("Enviei meus dados pra seguir com a cota");
			expect(fonte).toContain("Enviei meus dados pra buscar as ofertas");
		});
	});
});
