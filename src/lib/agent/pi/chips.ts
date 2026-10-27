// O CHIP É A RESPOSTA DA PERGUNTA FECHADA — não a lista escrita no texto.
//
// O prompt diz para perguntar com opção curta no card, e mesmo assim o modelo
// escrevia "1) Agora 2) Nos próximos meses" como texto: o cliente via a lista e não
// tinha nada para tocar (medido no dev, 25/10/2026 — os chips não apareciam). O
// detector roda no TEXTO FINAL de cada trecho: pergunta fechada com opções ⇒ chip.
// Se o turno já mostrou um card de escolha, nada muda. Se as opções estão no texto,
// elas viram `quick_reply` e o texto fica só com a pergunta.
//
// Duas fronteiras aprendidas na main e que aqui valem igual (L26, L33, N05):
//  · OPÇÃO TEM MARCADOR. Lista de verdade abre cada linha com `1)`, `a)`, `-` ou
//    `•`; duas linhas curtas em sequência são PROSA ("Fica tranquilo" / "Eu te
//    ajudo com isso"), não menu. Sem marcador, o detector exige a alternativa
//    escrita ("A ou B") para tratar como pergunta fechada.
//  · O ATALHO TEM IDENTIDADE. Cada opção nasce com `replyId` gerado aqui (o
//    servidor, nunca o modelo): é o que `quick-reply.tsx` reivindica em
//    `/api/chat/quick-reply` (`click:<conversationId>:<replyId>`) para o botão
//    sumir depois de usado e não voltar no reload. `groupId` — a cota que o
//    atalho escolhe — só existe quando o MODELO declarou a cota, e é conferido
//    contra as cartas reais em `cards-livres.ts` (fail-closed da main).

import { sugestoesDaPergunta } from "@/lib/agent/pi/sugestoes";

const CARD_DE_ESCOLHA = ["quick_reply", "value_picker", "topic_picker"];

/**
 * CARDS QUE JÁ PEDEM UM TOQUE — o chip não entra por cima.
 *
 * Card que já tem botão próprio (opt-in do WhatsApp, formulário de contratação, proposta real,
 * pedido de assinatura, decisão) dispensa resposta rápida: duplicar seria mostrar duas vezes a
 * mesma escolha, que é o defeito de duplicidade que a bateria mede.
 */
const CARD_QUE_JA_ESPERA_TOQUE = [
	...CARD_DE_ESCOLHA,
	"whatsapp_optin",
	"contract_form",
	"real_offer",
	"signature_handoff",
	"document_upload",
	"decision_prompt",
];

/** A identidade PERSISTIDA do atalho (`QuickReplyOption.replyId`, L4): gerada a
 * cada emissão de propósito — um card repetido em outro turno recebe id novo e
 * não nasce "já consumido". */
export type OpcaoDeChip = { label: string; replyId: string; groupId?: string };

export type ChipGerado = { type: "quick_reply"; payload: { options: OpcaoDeChip[] } };

const TETO_DE_OPÇÕES = 4;
const MAXIMO_DE_ROTULO = 40;
const MAXIMO_DE_ROTULO_DE_FRASE = 60;
/** O que faz de uma linha uma OPÇÃO: o marcador de lista, sempre no começo. */
const MARCADOR_DE_LISTA = /^(?:\d+[).:]|[a-zA-Z][).]|[-*–—•])\s+/;

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
 * A lista MARCADA do texto — e o texto sem ela.
 *
 * Duas linhas curtas sem marcador não chegam aqui: `null`, e o detector segue
 * para a alternativa escrita na frase. Quando a lista vem numa linha só
 * ("1) Agora 2) Nos próximos meses"), o pedaço sem marcador (a pergunta) volta
 * para o balão.
 */
function listaDeOpcoes(texto: string): { opcoes: string[]; textoLimpo: string } | null {
	const marcadas: string[] = [];
	const restante: string[] = [];
	for (const linha of texto.split(/\n+/)) {
		const limpa = linha.trim();
		if (!limpa) continue;
		const partes = limpa.split(/\s+(?=\d+[).:]\s)/).map((p) => p.trim());
		const daLista = partes.filter((p) => MARCADOR_DE_LISTA.test(p) && !p.includes("?"));
		const foraDaLista = partes.filter((p) => !daLista.includes(p));
		marcadas.push(...daLista);
		if (foraDaLista.length > 0) restante.push(foraDaLista.join(" "));
	}
	if (marcadas.length < 2) return null;
	const opcoes = marcadas
		.map((m) => rotulo(m))
		.filter((r) => r.length > 0 && r.length <= MAXIMO_DE_ROTULO)
		.slice(0, TETO_DE_OPÇÕES);
	if (opcoes.length < 2) return null;
	return { opcoes, textoLimpo: restante.join("\n").trim() || texto.trim() };
}

/**
 * As opções de uma pergunta fechada, no texto final.
 *
 * Dois formatos medidos: lista MARCADA (uma opção por linha ou `1) …`) e a
 * alternativa escrita na frase (`Agora ou Nos próximos meses?`). Lista manda
 * quando existe.
 */
export function opcoesDePerguntaFechada(texto: string): string[] {
	return detectarOpcoes(texto).opcoes;
}

function detectarOpcoes(texto: string): { opcoes: string[]; textoLimpo: string } {
	if (!texto.includes("?")) return { opcoes: [], textoLimpo: texto };

	const daLista = listaDeOpcoes(texto);
	if (daLista) return daLista;

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
	if (!frase) return { opcoes: [], textoLimpo: texto };
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
	if (opcoesDaFrase.length < 2) return { opcoes: [], textoLimpo: texto };
	// A alternativa estava DENTRO da pergunta: o balão continua inteiro.
	return { opcoes: opcoesDaFrase, textoLimpo: texto };
}

/**
 * O trecho que sai no balão e o chip que o acompanha.
 *
 * `cardsDoTurno` é o que o modelo já mostrou neste turno: se havia card de escolha,
 * o texto não é uma lista — não se duplica o chip. `texto` é o balão SEM a lista
 * que virou botão (N05): o cliente não lê a mesma opção duas vezes.
 */
export function garantirChip(args: {
	texto: string;
	cardsDoTurno: readonly { type: string }[];
	/** Fato do turno: já existe carta na tela desta conversa. Muda a resposta rápida de uma
	 * pergunta aberta ("qual dessas fica melhor?") para as opções da oferta. */
	temCartaNaTela?: boolean;
	canal?: "web" | "whatsapp";
}): {
	texto: string;
	chip: ChipGerado | null;
} {
	if (args.cardsDoTurno.some((c) => CARD_QUE_JA_ESPERA_TOQUE.includes(c.type))) {
		return { texto: args.texto, chip: null };
	}

	// 1. A opção escrita no TEXTO (lista marcada ou "A ou B?") — a melhor de todas: a lista sai
	//    do balão e vira botão.
	const { opcoes, textoLimpo } = detectarOpcoes(args.texto);
	// A alternativa escrita só vale quando o corte parece RÓTULO. "O bem é carro, moto ou imóvel?"
	// saía como dois botões quebrados ("O bem é carro, moto" / "imóvel") — vírgula no rótulo é o
	// sinal de que a frase era pergunta, não menu. Aí quem responde é o momento (`sugestoes.ts`).
	const corteUtil = opcoes.length >= 2 && !opcoes.some((o) => o.includes(","));
	if (corteUtil) return { texto: textoLimpo, chip: chipDe(opcoes) };

	// 2. A opção derivada do MOMENTO (ordem do dono, 27/10): pergunta feita sem toque é pergunta
	//    perdida. Aqui o balão NÃO muda — só ganha os botões.
	const doMomento = sugestoesDaPergunta(args.texto, {
		temCartaNaTela: args.temCartaNaTela === true,
		...(args.canal ? { canal: args.canal } : {}),
	});
	if (doMomento && doMomento.length >= 2) return { texto: args.texto, chip: chipDe(doMomento) };

	return { texto: args.texto, chip: null };
}

/** Cada opção nasce com `replyId` do SERVIDOR (nunca do modelo) — é ele que o clique consome. */
function chipDe(opcoes: readonly string[]): ChipGerado {
	return {
		type: "quick_reply",
		payload: {
			// `crypto.randomUUID` é global no runtime do servidor (mesmo id que a
			// main gerava em `converse.ts`) — o id é do SERVIDOR, nunca do modelo.
			options: opcoes.map((label) => ({ label, replyId: crypto.randomUUID() })),
		},
	};
}
