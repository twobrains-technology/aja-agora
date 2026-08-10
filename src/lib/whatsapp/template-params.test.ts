/**
 * O disparo de retomada era recusado pela Meta em TODA tentativa (prod,
 * 2026-08-10):
 *
 *   (#132000) body: number of localizable_params (0) does not match (1)
 *
 * `aja_agora_atendente_retomada` tem "Oi, {{1}}!" e o envio ia sem `components`.
 * O atendente lia "contato de retomada enviado" e o cliente não recebia nada.
 *
 * Estes testes prendem a aridade ao CORPO APROVADO — que é quem manda — em vez
 * de a uma constante que alguém precisa lembrar de mudar.
 */
import { describe, expect, it } from "vitest";
import { contarParametros, montarComponents, primeiroNome } from "./template-params";

const RETOMADA =
	"Oi, {{1}}! Tudo bem?\n\nAqui é da Aja Agora, estou tentando falar com você sobre o seu consórcio.\n\nPode me responder por aqui?";

describe("aridade do template", () => {
	it("conta o parâmetro do template de retomada — o que a Meta cobrava", () => {
		expect(contarParametros(RETOMADA)).toBe(1);
	});

	it("template sem placeholder não pede parâmetro nenhum", () => {
		expect(contarParametros("Sua proposta foi registrada.")).toBe(0);
		expect(contarParametros(null)).toBe(0);
	});

	it("o MAIOR índice manda — a Meta preenche por posição", () => {
		// Só "{{2}}" no corpo ainda exige dois valores; mandar um é 132000.
		expect(contarParametros("Olá {{2}}")).toBe(2);
		expect(contarParametros("{{1}} e {{3}}")).toBe(3);
	});

	it("tolera espaço dentro das chaves", () => {
		expect(contarParametros("Oi, {{ 1 }}!")).toBe(1);
	});
});

describe("components enviados à Meta", () => {
	it("manda exatamente um parâmetro, com o primeiro nome do cliente", () => {
		expect(montarComponents(RETOMADA, "Kairo Gray")).toEqual([
			{ type: "body", parameters: [{ type: "text", text: "Kairo" }] },
		]);
	});

	it("sem nome no cadastro o envio ainda sai — travar deixaria o atendente sem saída", () => {
		expect(montarComponents(RETOMADA, null)).toEqual([
			{ type: "body", parameters: [{ type: "text", text: "cliente" }] },
		]);
	});

	it("template sem placeholder vai SEM components — array vazio também é 132000", () => {
		expect(montarComponents("Recebemos seu pedido.", "Kairo")).toBeUndefined();
	});
});

describe("primeiro nome", () => {
	it("corta no primeiro espaço e ignora espaço sobrando", () => {
		expect(primeiroNome("  Junya   Ishigaki Pires  ")).toBe("Junya");
		expect(primeiroNome("Kairo")).toBe("Kairo");
	});

	it("nome vazio é ausência, não string vazia", () => {
		expect(primeiroNome("   ")).toBeNull();
		expect(primeiroNome(undefined)).toBeNull();
	});
});
