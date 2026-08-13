// O endpoint de alerta abre ocorrência no Cortex e dispara e-mail. Sem a
// checagem de assinatura ele é um botão público para fazer as duas coisas em
// nome do nosso monitoramento — por isso a validação tem teste próprio, e não
// só o caminho feliz.
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { validarAssinaturaLangfuse } from "./assinatura";

const SEGREDO = "lf-whsec_0123456789abcdef";
const CORPO = JSON.stringify({ type: "monitor-alert", apiVersion: "v1" });
const AGORA = 1_800_000_000;

function assinar(corpo: string, t: number, segredo = SEGREDO): string {
	const v1 = crypto.createHmac("sha256", segredo).update(`${t}.${corpo}`, "utf8").digest("hex");
	return `t=${t},v1=${v1}`;
}

describe("assinatura do webhook do Langfuse", () => {
	it("aceita corpo assinado com o segredo certo, dentro da janela", () => {
		const r = validarAssinaturaLangfuse({
			corpoCru: CORPO,
			header: assinar(CORPO, AGORA),
			segredo: SEGREDO,
			agoraS: AGORA + 10,
		});
		expect(r.valida).toBe(true);
	});

	it("recusa corpo adulterado (o mesmo header, outro payload)", () => {
		const r = validarAssinaturaLangfuse({
			corpoCru: `${CORPO} `,
			header: assinar(CORPO, AGORA),
			segredo: SEGREDO,
			agoraS: AGORA,
		});
		expect(r).toEqual({ valida: false, motivo: "nao-confere" });
	});

	it("recusa assinatura feita com outro segredo", () => {
		const r = validarAssinaturaLangfuse({
			corpoCru: CORPO,
			header: assinar(CORPO, AGORA, "lf-whsec_outro"),
			segredo: SEGREDO,
			agoraS: AGORA,
		});
		expect(r).toEqual({ valida: false, motivo: "nao-confere" });
	});

	// Sem janela, um POST capturado hoje vale para sempre.
	it("recusa replay fora da janela de tolerância", () => {
		const r = validarAssinaturaLangfuse({
			corpoCru: CORPO,
			header: assinar(CORPO, AGORA),
			segredo: SEGREDO,
			agoraS: AGORA + 301,
		});
		expect(r).toEqual({ valida: false, motivo: "expirada" });
	});

	it("recusa header ausente ou malformado", () => {
		expect(
			validarAssinaturaLangfuse({ corpoCru: CORPO, header: null, segredo: SEGREDO }).valida,
		).toBe(false);
		expect(
			validarAssinaturaLangfuse({ corpoCru: CORPO, header: "sem-formato", segredo: SEGREDO }),
		).toEqual({ valida: false, motivo: "header-malformado" });
	});

	// `timingSafeEqual` lança quando os buffers têm tamanhos diferentes — um
	// hash truncado não pode derrubar a rota com exceção.
	it("hash truncado não lança, só recusa", () => {
		expect(() =>
			validarAssinaturaLangfuse({
				corpoCru: CORPO,
				header: `t=${AGORA},v1=abc`,
				segredo: SEGREDO,
				agoraS: AGORA,
			}),
		).not.toThrow();
	});
});
