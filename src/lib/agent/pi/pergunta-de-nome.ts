// O NOME SE PEDE NA ABERTURA E, NO MÁXIMO, MAIS UMA VEZ (ordem do líder, 28/10 04:35).
//
// Medido na conversa dos prints `final-02b/03b` (modelo de produção): o agente perguntou o nome três
// vezes — na oferta, no pedido de CPF ("Também não esqueço de perguntar: como você se chama?") e
// depois da falha da proposta. A conduta já dizia "no máximo uma repetição" e o modelo não cumpriu:
// quantas vezes o nome já foi pedido é FATO do histórico, então o limite mora no servidor, não no
// prompt. Esta é uma regra de CONTAGEM de pedido, não de tom.
//
// P11 (Kairo, 05/11): o corte saiu do runtime — "nada de teto em código" (premissa P11).
// O texto passa INALTERADO; `pedeONome` e `pedidosDeNomeNoHistorico` ficam como medida,
// e o sinal `fala_pede_nome` registra quando a fala pediu o nome.
import { RESPOSTA_LIVRE } from "@/lib/agent/pi/sugestoes";
import { publicarScores } from "@/lib/observability/sinais/publicar";

/** Total de vezes que o agente pode pedir o nome numa conversa: a abertura + uma repetição. */
export const LIMITE_DE_PEDIDOS_DE_NOME = 2;

function frasesDe(texto: string): string[] {
	return texto.split(/(?<=[.!?])\s+|\n+/).filter((f) => f.trim().length > 0);
}

/** Esta frase PERGUNTA o nome? ("como você se chama?", "qual o seu nome?") — mesma régua dos
 * toques (`RESPOSTA_LIVRE`), mas só vale se for pergunta de fato. */
function fraseEhPerguntaDeNome(frase: string): boolean {
	return frase.includes("?") && RESPOSTA_LIVRE.test(frase);
}

/** O texto pede o nome? */
export function pedeONome(texto: string): boolean {
	return frasesDe(texto ?? "").some(fraseEhPerguntaDeNome);
}

/** Quantas falas do agente, no histórico, pediram o nome. Conta por fala (balão do histórico),
 * não por frase: duas frases na mesma fala são um pedido só. */
export function pedidosDeNomeNoHistorico(
	historico: readonly { role: string; content: string }[],
): number {
	return historico.filter((m) => m.role === "assistant" && pedeONome(m.content)).length;
}

/** Devolve o texto inalterado; se a fala pede o nome, emite o sinal da medida. */
export function semPerguntaDeNome(texto: string): string {
	if (pedeONome(texto)) {
		try {
			publicarScores([{ name: "fala_pede_nome", value: 1, dataType: "BOOLEAN" }], "remendos-fala");
		} catch {
			// Observabilidade nunca derruba o turno.
		}
	}
	return texto;
}

/** O agente ainda pode pedir o nome neste turno? `jaPedidos` vem do histórico (+ o que este turno
 * já pediu). Nome conhecido = nunca mais. */
export function podePedirONome(args: { nomeConhecido: boolean; jaPedidos: number }): boolean {
	return !args.nomeConhecido && args.jaPedidos < LIMITE_DE_PEDIDOS_DE_NOME;
}
