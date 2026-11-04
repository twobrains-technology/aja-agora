// O NOME SE PEDE NA ABERTURA E, NO MÁXIMO, MAIS UMA VEZ (ordem do líder, 28/10 04:35).
//
// Medido na conversa dos prints `final-02b/03b` (modelo de produção): o agente perguntou o nome três
// vezes — na oferta, no pedido de CPF ("Também não esqueço de perguntar: como você se chama?") e
// depois da falha da proposta. A conduta já dizia "no máximo uma repetição" e o modelo não cumpriu:
// quantas vezes o nome já foi pedido é FATO do histórico, então o limite mora no servidor, não no
// prompt. Esta é uma regra de CONTAGEM de pedido, não de tom: o texto só é cortado quando o limite
// já foi gasto (ou o nome já é conhecido).
import { RESPOSTA_LIVRE } from "@/lib/agent/pi/sugestoes";

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

/** A frase que vem depois da pergunta só para justificá-la: "Assim eu já te chamo pelo nome." */
const JUSTIFICATIVA_DO_NOME = /\b(?:chamo|chamar|chamá-lo)\b[^.!?]*\bnome\b|\bpelo\s+nome\b/i;

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

/** O texto sem a(s) pergunta(s) de nome (e a frase que só a justifica). O resto fica como o modelo
 * escreveu. Texto que só pedia o nome volta vazio. */
export function semPerguntaDeNome(texto: string): string {
	const linhas = (texto ?? "").split(/\n{2,}/);
	const saida: string[] = [];
	for (const linha of linhas) {
		const frases = linha.split(/(?<=[.!?])\s+/).filter((f) => f.trim().length > 0);
		const mantidas: string[] = [];
		let cortouAnterior = false;
		for (const frase of frases) {
			if (fraseEhPerguntaDeNome(frase)) {
				cortouAnterior = true;
				continue;
			}
			if (cortouAnterior && JUSTIFICATIVA_DO_NOME.test(frase)) continue;
			cortouAnterior = false;
			mantidas.push(frase);
		}
		const montada = mantidas.join(" ").trim();
		if (montada) saida.push(montada);
	}
	return saida.join("\n\n");
}

/** O agente ainda pode pedir o nome neste turno? `jaPedidos` vem do histórico (+ o que este turno
 * já pediu). Nome conhecido = nunca mais. */
export function podePedirONome(args: { nomeConhecido: boolean; jaPedidos: number }): boolean {
	return !args.nomeConhecido && args.jaPedidos < LIMITE_DE_PEDIDOS_DE_NOME;
}
