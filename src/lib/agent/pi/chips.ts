// O CHIP É A RESPOSTA DA PERGUNTA FECHADA — não a lista escrita no texto.
//
// O prompt diz para perguntar com opção curta no card, e mesmo assim o modelo
// escrevia "1) Agora 2) Nos próximos meses" como texto: o cliente via a lista e não
// tinha nada para tocar (medido no dev, 25/10/2026 — os chips não apareciam). O
// detector roda no TEXTO FINAL de cada trecho: pergunta fechada com opções ⇒ chip.
// Se o turno já mostrou um card de escolha, nada muda. Se as opções estão no texto,
// elas viram `quick_reply` e o texto fica só com a pergunta.

const CARD_DE_ESCOLHA = ["quick_reply", "value_picker", "topic_picker"];

export type ChipGerado = { type: "quick_reply"; payload: { options: { label: string }[] } };

const TETO_DE_OPÇÕES = 4;
const MAXIMO_DE_ROTULO = 40;

/** Rótulo limpo: numeração, travessão de lista e pontuação de fim fora. */
function rotulo(bruto: string): string {
	return bruto
		.replace(/^\s*(?:\d+[).:]|[-*–—•])\s*/, "")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/[?.!:;]+$/, "");
}

/**
 * As opções de uma pergunta fechada, no texto final.
 *
 * Dois formatos medidos: lista (uma opção por linha ou `1) …`) e a alternativa
 * escrita na frase (`Agora ou Nos próximos meses?`). Lista manda quando existe.
 */
export function opcoesDePerguntaFechada(texto: string): string[] {
	if (!texto.includes("?")) return [];

	const lista = texto
		.split(/\n+/)
		.map((linha) => rotulo(linha))
		.filter(
			(linha) => linha.length > 0 && linha.length <= MAXIMO_DE_ROTULO && !linha.includes("?"),
		);
	if (lista.length >= 2) return lista.slice(0, TETO_DE_OPÇÕES);

	const frase = texto.match(/\b([^?]{3,40}?)\s+ou\s+([^?]{3,40}?)\?/);
	if (!frase) return [];
	const opcoesDaFrase = [frase[1], frase[2]].map((parte) =>
		rotulo(parte).replace(
			/^(?:você|vc|ele|ela)\s+(?:prefere|preferir|quer|escolhe|opta|pensa|vai|foi)\s+/i,
			"",
		),
	);
	if (opcoesDaFrase.some((o) => o.length < 3)) return [];
	return opcoesDaFrase;
}

/**
 * O trecho que sai no balão e o chip que o acompanha.
 *
 * `cardsDoTurno` é o que o modelo já mostrou neste turno: se havia card de escolha,
 * o texto não é uma lista — não se duplica o chip.
 */
export function garantirChip(args: { texto: string; cardsDoTurno: readonly { type: string }[] }): {
	texto: string;
	chip: ChipGerado | null;
} {
	if (args.cardsDoTurno.some((c) => CARD_DE_ESCOLHA.includes(c.type))) {
		return { texto: args.texto, chip: null };
	}

	const opcoes = opcoesDePerguntaFechada(args.texto);
	if (opcoes.length < 2) return { texto: args.texto, chip: null };

	// O texto guarda a PERGUNTA; as opções viram botão. Assim o balão não repete o
	// que o cliente vai tocar.
	const pergunta = args.texto
		.split(/\n+/)
		.filter((linha) => linha.includes("?"))
		.join("\n")
		.trim();

	return {
		texto: pergunta || args.texto,
		chip: { type: "quick_reply", payload: { options: opcoes.map((label) => ({ label })) } },
	};
}
