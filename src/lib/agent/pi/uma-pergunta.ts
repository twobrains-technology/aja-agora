// UMA PERGUNTA POR MENSAGEM — a medida do texto final de cada trecho.
//
// P11 (Kairo, 05/11): o corte saiu do runtime — "nada de teto em código" (premissa
// P11 do projeto). O texto passa INALTERADO; `contarPerguntas` vira medida e, quando
// a fala tem mais de uma pergunta, o sinal `fala_com_multiplas_perguntas` registra
// quantas foram, para correção de contexto e painel.
//
// Pergunta = frase terminada em `?` fora de aspas. Citação entre aspas não conta.
import { publicarScores } from "@/lib/observability/sinais/publicar";

/** Substitui o miolo de trechos entre aspas por espaços do mesmo tamanho, para
 * que um `?` citado não seja contado e os índices continuem valendo. */
export function semCitacoes(texto: string): string {
	return texto.replace(/(["“«])[^"”»\n]*\1|“[^”\n]*”|«[^»\n]*»/g, (m) => " ".repeat(m.length));
}

export function contarPerguntas(texto: string): number {
	return (semCitacoes(texto).match(/\?+(?=\s|$|[*_)\]])/g) ?? []).length;
}

/** Devolve o texto inalterado; se tem mais de uma pergunta, emite o sinal da medida. */
export function manterUmaPergunta(texto: string): string {
	const perguntas = contarPerguntas(texto);
	if (perguntas > 1) {
		try {
			publicarScores(
				[{ name: "fala_com_multiplas_perguntas", value: perguntas, dataType: "NUMERIC" }],
				"remendos-fala",
			);
		} catch {
			// Observabilidade nunca derruba o turno.
		}
	}
	return texto;
}
