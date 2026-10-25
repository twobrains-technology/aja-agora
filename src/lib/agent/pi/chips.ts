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
const MAXIMO_DE_ROTULO_DE_FRASE = 60;

/** Rótulo limpo: numeração, travessão de lista e pontuação de fim fora. */
function rotulo(bruto: string): string {
	return bruto
		.replace(/^\s*(?:\d+[).:]|[-*–—•])\s*/, "")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/[?.!:;,]+$/, "");
}

/** Rótulo comprido demais para botão: corta no conector, não no meio da palavra. */
function encurta(bruto: string): string {
	const curto = bruto
		.split(/\s+(?:antes de|depois de|mesmo que|pra|para|durante|enquanto)\b/)[0]
		.trim();
	return curto.length >= 3 ? curto : bruto.slice(0, MAXIMO_DE_ROTULO).trim();
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

	// A forma real medida no dev é a alternativa dentro da pergunta, com pontuação:
	// "Qual dessas faz mais sentido pra você: parcela menor por mais tempo, ou prazo mais curto?"
	// O rótulo é o que vem DEPOIS da introdução da pergunta — senão o chip sairia com a
	// pergunta inteira como botão.
	// A PERGUNTA, não o texto todo: no dev o detector pegou uma frase afirmativa antes da
	// pergunta ("a contemplação (quando você recebe o dinheiro) vem por sorteio ou lance") e
	// entregou um botão com "ê recebe o dinheiro) vem por sorteio". Primeira sentença que
	// termina em "?", parênteses fora, rótulo depois dos dois pontos.
	const frase = texto
		.split(/(?<=[?.!])\s+/)
		.map((s) => s.trim())
		.find((s) => s.endsWith("?"));
	if (!frase) return [];
	let corpo = frase.replace(/\([^)]*\)/g, "").replace(/\?$/, "");
	if (corpo.includes(":")) corpo = corpo.slice(corpo.lastIndexOf(":") + 1);
	const opcoesDaFrase = corpo
		.split(/\s+ou\s+/)
		.map((parte) =>
			rotulo(parte).replace(
				/^(?:você|vc|ele|ela)\s+(?:prefere|preferir|quer|escolhe|opta|pensa|vai|foi)\s+/i,
				"",
			),
		)
		.map((o) => (o.length <= MAXIMO_DE_ROTULO ? o : encurta(o)))
		.filter((o) => o.length >= 3 && o.length <= MAXIMO_DE_ROTULO_DE_FRASE);
	// Uma pergunta sem "ou" não é fechada entre dois caminhos — não vira chip.
	if (opcoesDaFrase.length < 2) return [];
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
