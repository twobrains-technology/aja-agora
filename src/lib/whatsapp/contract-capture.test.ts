import { describe, expect, it, vi } from "vitest";
import { decidirCpfDoTexto } from "@/lib/conversation/telefone-ou-cpf";

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

describe("o estágio do CPF aplica a regra ÚNICA de 'tentativa de CPF'", () => {
	it("CPF com DV válido dispara a proposta", async () => {
		const { decideCpfStage } = await import("./contract-capture");
		expect(decideCpfStage("meu cpf é 529.982.247-25")).toEqual({
			handled: true,
			outcome: "fire",
			cpf: "52998224725",
		});
	});

	it("o número ambíguo 11900000083 é CPF aqui: o agente acabou de pedir", async () => {
		const { decideCpfStage } = await import("./contract-capture");
		// Celular de SP (DDD 11 + 9º dígito) que TAMBÉM passa no DV do CPF. O estágio
		// `cpf` só existe depois do pedido, então o número é resposta ao pedido — a
		// mesma leitura da `main` e da regra única com `pedidoDeCpf: true`.
		expect(decideCpfStage("11900000083")).toEqual({
			handled: true,
			outcome: "fire",
			cpf: "11900000083",
		});
		expect(decidirCpfDoTexto("11900000083", { pedidoDeCpf: true })).toEqual({
			outcome: "captured",
			cpf: "11900000083",
		});
	});

	it("tentativa de CPF com DV errado responde 'não confere' em vez de ir pro modelo", async () => {
		const { decideCpfStage } = await import("./contract-capture");
		expect(decideCpfStage("11987654321")).toEqual({ handled: true, outcome: "invalid-cpf" });
		expect(decideCpfStage("111.444.777-36")).toEqual({ handled: true, outcome: "invalid-cpf" });
	});

	it("o que não tem cara de CPF segue pro modelo", async () => {
		const { decideCpfStage } = await import("./contract-capture");
		expect(decideCpfStage("vocês atendem em Curitiba?")).toEqual({ handled: false });
		expect(decideCpfStage("tá caro, quero um de 80 mil")).toEqual({ handled: false });
	});
});
