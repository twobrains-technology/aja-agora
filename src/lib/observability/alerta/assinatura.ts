// Validação da assinatura HMAC do webhook do Langfuse.
//
// O Monitor assina o corpo com o segredo da automação e manda no header
// `x-langfuse-signature`, no formato `t=<unix>,v1=<hex>`, onde o hex é
// HMAC-SHA256 de `"<t>.<corpo cru>"` (langfuse/packages/shared/src/encryption/
// signature.ts). Sem esta checagem, o endpoint é um botão público para abrir
// ocorrência e disparar e-mail em nome do nosso monitoramento.
//
// Duas defesas, não uma:
//   • comparação em tempo constante (`timingSafeEqual`) — comparar hash com
//     `===` vaza o prefixo correto byte a byte para quem cronometra;
//   • janela de tolerância no `t` — sem ela, um POST capturado hoje continua
//     válido para sempre (replay).
import crypto from "node:crypto";

/** Tolerância padrão do timestamp assinado. Cinco minutos é o que o mercado
 *  usa (Stripe/GitHub) e cobre folgadamente o atraso de fila do worker. */
export const TOLERANCIA_PADRAO_S = 300;

export type ResultadoDaAssinatura =
	| { valida: true }
	| { valida: false; motivo: "header-ausente" | "header-malformado" | "expirada" | "nao-confere" };

/** Lê `t=<unix>,v1=<hex>` — o formato é do Langfuse, não é padrão de mercado. */
function parseHeader(header: string): { t: number; v1: string } | null {
	const partes = new Map(
		header
			.split(",")
			.map((p) => p.trim().split("="))
			.filter((p): p is [string, string] => p.length === 2),
	);
	const t = Number(partes.get("t"));
	const v1 = partes.get("v1");
	if (!Number.isFinite(t) || !v1) return null;
	return { t, v1 };
}

/**
 * Confere a assinatura do corpo CRU (a string exata recebida — reserializar o
 * JSON muda bytes e invalida o HMAC).
 */
export function validarAssinaturaLangfuse(args: {
	corpoCru: string;
	header: string | null;
	segredo: string;
	/** Injetável para o teste não depender do relógio. */
	agoraS?: number;
	toleranciaS?: number;
}): ResultadoDaAssinatura {
	const { corpoCru, header, segredo } = args;
	if (!header) return { valida: false, motivo: "header-ausente" };

	const lido = parseHeader(header);
	if (!lido) return { valida: false, motivo: "header-malformado" };

	const agoraS = args.agoraS ?? Math.floor(Date.now() / 1000);
	const toleranciaS = args.toleranciaS ?? TOLERANCIA_PADRAO_S;
	if (Math.abs(agoraS - lido.t) > toleranciaS) return { valida: false, motivo: "expirada" };

	const esperado = crypto
		.createHmac("sha256", segredo)
		.update(`${lido.t}.${corpoCru}`, "utf8")
		.digest("hex");

	const a = Buffer.from(esperado, "utf8");
	const b = Buffer.from(lido.v1, "utf8");
	// `timingSafeEqual` LANÇA em tamanhos diferentes — o length precisa ser
	// comparado antes, e ele não é segredo.
	if (a.length !== b.length) return { valida: false, motivo: "nao-confere" };
	return crypto.timingSafeEqual(a, b) ? { valida: true } : { valida: false, motivo: "nao-confere" };
}
