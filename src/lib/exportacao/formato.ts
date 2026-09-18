/**
 * FORMATO DE SAÍDA — CSV (RFC 4180) e JSON.
 *
 * Duas decisões que parecem detalhe e não são:
 *
 *   1. **Separador `,` e BOM UTF-8.** O Gustavo abre no Excel. Sem BOM o
 *      "ã" chega como "Ã£"; é o defeito de acento que o `CLAUDE.md` trata como
 *      entrega quebrada. `;` está fora de propósito — quem lê do outro lado
 *      (script da growth) espera CSV de verdade.
 *   2. **Célula vazia é ERRO, não saída.** A regra do pedido ("vínculo ausente
 *      sai escrito") vira invariante de código aqui: `paraCsv`/`paraJson`
 *      LANÇAM se algum valor for `""`, `null` ou `undefined`. O bug de uma
 *      célula em branco escapando não fica escondido num arquivo grande — a
 *      geração falha na hora, com o nome da coluna.
 */

export type LinhaExportada = Record<string, string>;

/** `msgId` → `msg_id`; `dadosIndisponiveis` → `dados_indisponiveis`. */
export function chaveParaColuna(chave: string): string {
	return chave.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function vazia(valor: unknown): boolean {
	return valor === null || valor === undefined || String(valor) === "";
}

/** Falha alto e cedo: célula vazia é defeito de entrega, não dado ausente. */
function conferirSemVazio(linhas: LinhaExportada[]): void {
	for (const [indice, linha] of linhas.entries()) {
		for (const [chave, valor] of Object.entries(linha)) {
			if (vazia(valor)) {
				throw new Error(
					`Célula vazia na linha ${indice + 1}, coluna "${chaveParaColuna(chave)}" — ` +
						'vazio tem que sair escrito ("sem vínculo: …" / "indisponível: …").',
				);
			}
		}
	}
}

function celaCsv(valor: string): string {
	return /[",\n\r]/.test(valor) ? `"${valor.replaceAll('"', '""')}"` : valor;
}

/** CSV RFC 4180, UTF-8 com BOM. Cabeçalhos em snake_case, na ordem das chaves. */
export function paraCsv(linhas: LinhaExportada[]): string {
	conferirSemVazio(linhas);
	const cabecalhos = Object.keys(linhas[0] ?? {});
	const corpo = [
		cabecalhos.map(chaveParaColuna).join(","),
		...linhas.map((linha) => cabecalhos.map((chave) => celaCsv(linha[chave])).join(",")),
	];
	return `\ufeff${corpo.join("\n")}\n`;
}

/** JSON (array), datas já em ISO (string) pelas funções de exportação. */
export function paraJson(linhas: LinhaExportada[]): string {
	conferirSemVazio(linhas);
	return JSON.stringify(linhas, null, 2);
}

/** JSON de um arquivo vazio continua sendo um array válido — e vazio mesmo. */
export function paraCsvVazio(): string {
	return "\ufeff\n";
}

export function paraJsonVazio(): string {
	return "[]";
}

export function gerar(formato: "csv" | "json", linhas: LinhaExportada[]): string {
	if (formato === "csv") return linhas.length === 0 ? paraCsvVazio() : paraCsv(linhas);
	return linhas.length === 0 ? paraJsonVazio() : paraJson(linhas);
}
