// A borda que alerta: e-mail + Cortex no billing, com dedupe de 1 h.
//
// O caso real é a rajada: 29 erros iguais em uma hora. Sem dedupe, isso vira 29
// e-mails e 29 cards — inflação de alerta mata alerta. Aqui o SendGrid e o
// Cortex são dublados: nenhum teste pode disparar e-mail de verdade.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.hoisted(() => vi.fn(async () => {}));
const abrirOcorrenciaNoCortex = vi.hoisted(() =>
	vi.fn(async () => ({ aberta: true as boolean })),
);

vi.mock("@/lib/email/sendgrid", () => ({ sendEmail }));
vi.mock("@/lib/observability/alerta/cortex", () => ({ abrirOcorrenciaNoCortex }));

import { registrarFalhaDoLlm, resetarDedupeDeAlerta } from "./alerta-do-llm";

const ERRO_DE_BILLING = new Error("Your credit balance is too low to access the Anthropic API");

const AGORA = Date.parse("2026-10-05T18:00:00.000Z");

beforeEach(() => {
	resetarDedupeDeAlerta();
	sendEmail.mockClear();
	abrirOcorrenciaNoCortex.mockClear();
	process.env.ALERTA_OBSERVABILIDADE_TO = "operacao@ajaagora.com.br";
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
	delete process.env.ALERTA_OBSERVABILIDADE_TO;
});

describe("registrarFalhaDoLlm", () => {
	it("billing manda e-mail para o destinatário configurado e abre ocorrência", async () => {
		await registrarFalhaDoLlm(ERRO_DE_BILLING, { origem: "teste" }, AGORA);

		expect(sendEmail).toHaveBeenCalledTimes(1);
		expect(sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({ to: "operacao@ajaagora.com.br" }),
		);
		expect(abrirOcorrenciaNoCortex).toHaveBeenCalledTimes(1);
	});

	it("escreve log estruturado parseável com o tipo", async () => {
		await registrarFalhaDoLlm(ERRO_DE_BILLING, {}, AGORA);

		const linha = (console.error as ReturnType<typeof vi.fn>).mock.calls
			.map((c) => c[0])
			.find((c) => typeof c === "string" && c.startsWith("[llm-erro]"));
		expect(linha).toBeTruthy();
		const json = JSON.parse((linha as string).replace("[llm-erro] ", ""));
		expect(json.tipo).toBe("billing");
	});

	it("dedupe de 1 h: a segunda falha do mesmo tipo não re-alerta", async () => {
		await registrarFalhaDoLlm(ERRO_DE_BILLING, {}, AGORA);
		await registrarFalhaDoLlm(ERRO_DE_BILLING, {}, AGORA + 30 * 60_000);

		expect(sendEmail).toHaveBeenCalledTimes(1);
		expect(abrirOcorrenciaNoCortex).toHaveBeenCalledTimes(1);
	});

	it("passada a janela de 1 h, alerta de novo", async () => {
		await registrarFalhaDoLlm(ERRO_DE_BILLING, {}, AGORA);
		await registrarFalhaDoLlm(ERRO_DE_BILLING, {}, AGORA + 61 * 60_000);

		expect(sendEmail).toHaveBeenCalledTimes(2);
	});

	it("tipo que não é billing não alerta (só loga)", async () => {
		await registrarFalhaDoLlm(new Error("boom da administradora"), {}, AGORA);

		expect(sendEmail).not.toHaveBeenCalled();
		expect(abrirOcorrenciaNoCortex).not.toHaveBeenCalled();
	});

	it("sem destinatário configurado não envia e-mail e não lança", async () => {
		delete process.env.ALERTA_OBSERVABILIDADE_TO;
		await expect(registrarFalhaDoLlm(ERRO_DE_BILLING, {}, AGORA)).resolves.toBeUndefined();
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("envio que falha NÃO consome a janela: a próxima falha ainda alerta", async () => {
		// Os dois canais caem na primeira tentativa — nada saiu, então o dedupe
		// não pode ser marcado. Se fosse marcado antes de enviar, a segunda falha
		// (5 min depois) ficaria 55 min em silêncio, que é o defeito medido.
		sendEmail.mockRejectedValueOnce(new Error("sendgrid fora do ar"));
		abrirOcorrenciaNoCortex.mockRejectedValueOnce(new Error("cortex fora do ar"));
		await registrarFalhaDoLlm(ERRO_DE_BILLING, {}, AGORA);

		sendEmail.mockResolvedValueOnce(undefined);
		abrirOcorrenciaNoCortex.mockResolvedValueOnce({ aberta: true });
		await registrarFalhaDoLlm(ERRO_DE_BILLING, {}, AGORA + 5 * 60_000);

		expect(sendEmail).toHaveBeenCalledTimes(2);
	});
});