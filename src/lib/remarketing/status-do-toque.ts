/**
 * A CLASSIFICAÇÃO DA FALHA DE ENVIO DA META — pura, sem banco (FIX-441, D12).
 *
 * O ciclo carimba o toque ANTES de enviar (a defesa contra duplicidade), e
 * quando o envio falha o carimbo precisa ser COMPENSADO — devolver step,
 * `ultimo_toque_em` e a cota, e empurrar o próximo toque para um backoff. O que
 * fazer depende de QUAL erro a Meta devolveu, e essa leitura mora aqui, longe do
 * banco: o ciclo (falha síncrona) e o webhook de status (falha assíncrona) só
 * aplicam a decisão.
 *
 * ── Os códigos que importam ────────────────────────────────────────────────
 *
 *   131049 — "This message was not delivered to maintain healthy ecosystem
 *            engagement." Foi o código medido em produção (02/10 14:00): um
 *            toque carimbado, nenhuma mensagem entregue, cota consumida à toa.
 *            Devolve a cota e reagenda com backoff de DIAS.
 *   131050 / 131026 — a Meta recusou o envio de forma que não adianta insistir
 *            (opt-in/qualidade). Encerram a régua com `motivo_saida`, para a
 *            linha sair do índice e a mesa poder olhar.
 *
 * Qualquer outra falha compensa a cota e volta com o backoff CURTO — o lado de
 * menos toque, que é a doutrina da régua inteira.
 */

/** "This message was not delivered to maintain healthy ecosystem engagement." */
export const CODIGO_DEVOLVE_COTA = 131049;

/** As recusas em que insistir só gastaria cota — a régua para. */
export const CODIGOS_ENCERRA_REGUA: readonly number[] = [131050, 131026];

/** Backoff do 131049: dias (a Meta reabre a janela de engajamento). */
export const BACKOFF_DE_DIAS_MS = 3 * 24 * 60 * 60 * 1000;

/** Backoff das demais falhas: horas. */
export const BACKOFF_PADRAO_MS = 3 * 60 * 60 * 1000;

/**
 * O `motivo_saida` da linha que a Meta mandou encerrar. O valor é cunhado aqui
 * (a régua tem um vocabulário só de saída, em `motivo-de-exclusao.ts`) e a tela
 * o mostra cru até ganhar rótulo — melhor o valor cru do que um rótulo genérico
 * que esconderia a divergência.
 */
export const MOTIVO_SAIDA_META = "recusado_pela_meta";

/** `remarketing_touches.envio_status` quando o envio saiu. */
export const ENVIO_STATUS_ENVIADO = "enviado";

/** `remarketing_touches.envio_status` quando o envio falhou e a cota voltou. */
export const ENVIO_STATUS_FALHOU = "falhou";

export type DisposicaoDaFalha = "devolve_cota" | "encerra_regua";

/**
 * O código de erro da Meta, do shape que estiver na mão: o número cru, o objeto
 * do status do webhook (`{ code, title }`) ou o corpo de texto que o envio
 * devolve (`{"error":{"code":...}}`). Sem código reconhecível, `null` — e a
 * decisão cai no lado conservador.
 */
export function codigoDaMeta(entrada: unknown): number | null {
	if (typeof entrada === "number") return Number.isFinite(entrada) ? entrada : null;
	if (typeof entrada === "object" && entrada !== null && !Array.isArray(entrada)) {
		const code = (entrada as { code?: unknown }).code;
		if (typeof code === "number" && Number.isFinite(code)) return code;
		return null;
	}
	if (typeof entrada !== "string") return null;

	const texto = entrada.trim();
	if (!texto) return null;

	// O corpo da Meta é JSON: `{"error":{"code":131049,"message":"..."}}`.
	try {
		const parsed: unknown = JSON.parse(texto);
		const doJson = codigoDaMeta(parsed);
		if (doJson !== null) return doJson;
	} catch {
		// Não é JSON — cai no regex abaixo.
	}

	// O número cru ("131049") ou o campo em texto solto (`"code": 131049`).
	if (/^\d+$/.test(texto)) return Number(texto);
	const casado = /"code"\s*:\s*(\d+)/.exec(texto);
	return casado ? Number(casado[1]) : null;
}

/** O que fazer com a linha diante da falha. Desconhecido ⇒ devolve a cota. */
export function disposicaoDaFalha(codigo: number | null): DisposicaoDaFalha {
	return codigo !== null && CODIGOS_ENCERRA_REGUA.includes(codigo)
		? "encerra_regua"
		: "devolve_cota";
}

/** Quanto esperar para o próximo toque, em milissegundos. */
export function backoffDaFalha(codigo: number | null): number {
	return codigo === CODIGO_DEVOLVE_COTA ? BACKOFF_DE_DIAS_MS : BACKOFF_PADRAO_MS;
}
