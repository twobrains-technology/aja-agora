import { describe, expect, it, vi } from "vitest";

// O módulo importa o banco; aqui só interessam as decisões de estágio.
vi.mock("@/db", () => ({ db: {} }));

describe("o aceite da carta REAL por texto finaliza como o botão", () => {
	it("'sim', 'pode fechar' e 'confirmo' finalizam", async () => {
		const { decideOfferConfirmStage } = await import("./contract-capture");
		for (const fala of ["sim", "pode fechar", "confirmo", "pode seguir, confirmado"]) {
			expect(decideOfferConfirmStage(fala)).toEqual({ handled: true, outcome: "finalize" });
		}
	});

	it("pergunta e dúvida NÃO finalizam — vão pro modelo", async () => {
		const { decideOfferConfirmStage } = await import("./contract-capture");
		expect(decideOfferConfirmStage("e se eu quiser contemplar no mês 20?")).toEqual({
			handled: false,
		});
		expect(decideOfferConfirmStage("essa parcela é fixa?")).toEqual({ handled: false });
	});

	it("recusa continua recusando (não vira fecho)", async () => {
		const { decideOfferConfirmStage } = await import("./contract-capture");
		expect(decideOfferConfirmStage("quero ver outras opções")).toEqual({
			handled: true,
			outcome: "cancel",
		});
	});

	it("o estágio 'confirm' segue disparando a proposta (fire), não finalizando", async () => {
		const { decideConfirmStage } = await import("./contract-capture");
		expect(decideConfirmStage("pode fechar")).toEqual({ handled: true, outcome: "fire" });
	});
});
