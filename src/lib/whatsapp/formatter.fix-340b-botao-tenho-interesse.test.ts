import { describe, expect, it } from "vitest";
import {
	groupCardToWhatsApp,
	recommendationToWhatsApp,
	simulationResultToWhatsApp,
} from "./formatter";

// FIX-340(b) (bloco-c-whatsapp-invariantes) — dossiês moto/imóvel/serviços:
// o botão apareceu citado no texto do modelo como `"Tenho interesse!\n\n"`
// (aspas + quebra de linha). A causa era o system-prompt instruindo o modelo
// a citar o rótulo entre aspas (contradição resolvida em
// system-prompt.fix-340b-botao-nao-nomeado.test.ts); este teste trava que o
// TÍTULO REAL do botão (o widget interactive, não a fala do modelo) nunca sai
// com quebra de linha ou espaço sobrando — regressão determinística.
function allButtonTitles(payload: ReturnType<typeof groupCardToWhatsApp>): string[] {
	const buttons = payload.interactive?.action?.buttons ?? [];
	return buttons.map((b) => b.reply.title ?? "");
}

describe("FIX-340(b) — título do botão 'Tenho interesse!' nunca carrega \\n ou espaço sobrando", () => {
	it("groupCardToWhatsApp", () => {
		const payload = groupCardToWhatsApp({
			id: "g1",
			administradora: "ITAÚ",
			category: "auto",
			creditValue: 100000,
			monthlyPayment: 1000,
			termMonths: 60,
			contemplationRate: 2.5,
		});
		for (const title of allButtonTitles(payload)) {
			expect(title).not.toMatch(/\n/);
			expect(title).toBe(title.trim());
		}
	});

	it("simulationResultToWhatsApp", () => {
		const payload = simulationResultToWhatsApp({
			groupId: "g1",
			creditValue: 100000,
			monthlyPayment: 1000,
			termMonths: 60,
		});
		for (const title of allButtonTitles(payload)) {
			expect(title).not.toMatch(/\n/);
			expect(title).toBe(title.trim());
		}
	});

	it("recommendationToWhatsApp", () => {
		const payload = recommendationToWhatsApp({
			id: "g1",
			administradora: "ITAÚ",
			category: "auto",
			creditValue: 100000,
			monthlyPayment: 1000,
			termMonths: 60,
			contemplationRate: 2.5,
			score: 0.9,
		});
		for (const title of allButtonTitles(payload)) {
			expect(title).not.toMatch(/\n/);
			expect(title).toBe(title.trim());
		}
	});
});
