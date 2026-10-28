// O CHIP É A RESPOSTA DA PERGUNTA FECHADA — não a lista escrita no texto.
//
// O prompt diz para perguntar com opção curta no card, e mesmo assim o modelo
// escrevia "1) Agora 2) Nos próximos meses" como texto: o cliente via a lista e não
// tinha nada para tocar (medido no dev, 25/10/2026 — os chips não apareciam). O
// detector roda no TEXTO FINAL de cada trecho: pergunta fechada com opções ⇒ chip.
// Se as opções estão no texto, elas viram `quick_reply` e o texto fica só com a
// pergunta.
//
// UM CARD POR TURNO, NO ÚLTIMO BALÃO — defeito medido nos prints 07/08 (ordem do
// líder, 27/10/2026 18:08). O chip era decidido a cada trecho do turno
// (`soltarTrecho`): quando o modelo falava em dois beats, o toque nascia com as
// opções do PRIMEIRO balão e pousava embaixo do segundo — nos prints o cliente leu
// a mesma pergunta em dois balões e a pergunta final ficou sem toque do lado dela.
// Quem decide agora é o turno, uma vez, no último balão: `chipDoTurno` — e ele olha o turno
// INTEIRO para achar o balão que pede (o fecho "Tudo bem, aguardo." não apaga o pedido do CPF).
//
// TODO TURNO TEM TOQUE — ordem do dono, 27/10/2026 17:16: *os balões de sugestão
// aparecem em todo turno do agente, pergunte ele ou não*. Até aqui o chip só saía
// quando o texto tinha "?": os prints 02 (depois da oferta) e 04 (falha da tool)
// terminaram sem balão nenhum, e o cliente não tinha o que tocar no momento em que
// mais precisava de um próximo passo. Agora o turno sem pergunta também sai com os
// próximos passos do momento (`sugestoes.ts`, regra (e)), e a exceção deixou de ser
// "o texto tem '?'" para ser o CARD: o que já é a escolha (`quick_reply`,
// `value_picker`, `topic_picker`) não ganha outro por cima — seria a mesma decisão
// duas vezes —, e o card que COLETA o dado pedido (formulário/opt-in) é a resposta
// do pedido de "digite o CPF/celular". Os demais cards (oferta real, assinatura,
// upload, decisão) passam a sair ACOMPANHADOS dos balões de próximo passo: é neles
// que o cliente decide o que fazer depois de ver o card.
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

import type { Category } from "@/lib/agent/personas";
import { balaoPedeResposta, frasesDe, sugestaoDoTurno } from "@/lib/agent/pi/sugestoes";
import { CREDIT_BOUNDS } from "@/lib/agent/qualify-config";
import type { ValuePickerPayload } from "@/lib/chat/types";

/** O card já É a escolha: um segundo menu por cima duplicaria a mesma decisão. */
const CARD_DE_ESCOLHA = ["quick_reply", "value_picker", "topic_picker"];

/**
 * CARDS QUE COLETAM O DADO PEDIDO — com um deles na tela, pedir "digite o CPF/celular" não
 * ganha balão: o card é a resposta do pedido, e um toque ao lado convidaria a pessoa a
 * responder por fora dele.
 */
const CARD_QUE_COLETA = ["contract_form", "whatsapp_optin"];

/** A frase que pede o PRÓPRIO dado — a única em que o card que coleta é a resposta.
 *
 * Os verbos do PEDIDO entraram na R20 (defeito medido no SHA `3236f59f`): o modelo pede
 * CPF/celular/WhatsApp com "me manda"/"me passa" muito mais que com "digite", e com o card que
 * coleta na tela o chip do MESMO dado saía POR CIMA dele — "me manda seu CPF e celular" com
 * `contract_form` no turno ganhava "Mando meu celular" ao lado do formulário. É também o que
 * sustenta o pedido **no meio da frase** ("…, me manda seu WhatsApp aqui no card").
 *
 * Isto REVOGA a exclusão anterior de "me passa seu WhatsApp" (pedido do print 02, que pela ordem
 * das 17:16 terminava no card de opt-in e pedia os balões de próximo passo): com o card de opt-in
 * na tela, o chip de WhatsApp é a mesma decisão duas vezes (ordem da R20). */
const PEDE_PARA_DIGITAR =
	/\b(?:digite|digita|informe|escreva|escreve|preencha|preenche|me\s+(?:manda|passa|envia|compartilha))\b/i;
const O_DADO_COLETADO = /\bcpf\b|celular|telefone|whats\s?app|n[úu]mero/i;

/** A identidade PERSISTIDA do atalho (`QuickReplyOption.replyId`, L4): gerada a
 * cada emissão de propósito — um card repetido em outro turno recebe id novo e
 * não nasce "já consumido". */
export type OpcaoDeChip = { label: string; replyId: string; groupId?: string };

/** O card que o `garantirChip` devolve. `value_picker` é o slider do VALOR do bem — a pergunta
 * de valor com a categoria conhecida sai nele, não em botão. */
export type CardGerado =
	| { type: "quick_reply"; payload: { options: OpcaoDeChip[] } }
	| { type: "value_picker"; payload: ValuePickerPayload };

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
	// PERGUNTA ABERTA NÃO É MENU: "Qual dessas opções mais te interessa ou prefere alguma outra
	// característica?" abre com pronome interrogativo e SEM introdução de dois-pontos — o lado
	// esquerdo é a própria pergunta, e virava o botão (visto ao vivo, 28/10).
	if (
		/^\s*(?:qual|quais|quanto|quantos|quantas|como|quando|onde|o\s+que|por\s+que|porque)\b/i.test(
			corpo,
		)
	) {
		return { opcoes: [], textoLimpo: texto };
	}
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

/** O toque deste turno neste balão seria a MESMA decisão já na tela? */
function toqueBloqueado(texto: string, cardsDoTurno: readonly { type: string }[]): boolean {
	const tipos = cardsDoTurno.map((c) => c.type);
	if (tipos.some((t) => CARD_DE_ESCOLHA.includes(t))) return true;
	return (
		tipos.some((t) => CARD_QUE_COLETA.includes(t)) &&
		PEDE_PARA_DIGITAR.test(texto) &&
		O_DADO_COLETADO.test(texto)
	);
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
	/** A última fala do cliente: o anti-eco do `sugestoes.ts` não repete o que ele disse. */
	falaDoCliente?: string;
	/** Categoria do bem já declarada — é ela que autoriza o `value_picker` do valor. */
	categoriaDoBem?: Category;
}): {
	texto: string;
	chip: CardGerado | null;
} {
	if (toqueBloqueado(args.texto, args.cardsDoTurno)) return { texto: args.texto, chip: null };

	// 1. A opção escrita no TEXTO (lista marcada ou "A ou B?") — a melhor de todas: a lista sai
	//    do balão e vira botão.
	const { opcoes, textoLimpo } = detectarOpcoes(args.texto);
	// A alternativa escrita só vale quando o corte parece RÓTULO. "O bem é carro, moto ou imóvel?"
	// saía como dois botões quebrados ("O bem é carro, moto" / "imóvel") — vírgula no rótulo é o
	// sinal de que a frase era pergunta, não menu. Aí quem responde é o momento (`sugestoes.ts`).
	const corteUtil = opcoes.length >= 2 && !opcoes.some((o) => o.includes(","));
	if (corteUtil) return { texto: textoLimpo, chip: chipDe(opcoes) };

	// 2. A opção derivada do MOMENTO (ordem do dono, 27/10): pergunta feita sem toque é pergunta
	//    perdida — e turno SEM pergunta também tem próximo passo (ordem das 17:16). Aqui o balão
	//    NÃO muda: só ganha os botões.
	const sugestao = sugestaoDoTurno(args.texto, {
		temCartaNaTela: args.temCartaNaTela === true,
		...(args.canal ? { canal: args.canal } : {}),
		...(args.falaDoCliente ? { falaDoCliente: args.falaDoCliente } : {}),
		...(args.categoriaDoBem ? { categoriaDoBem: args.categoriaDoBem } : {}),
	});
	if (sugestao.opcoes.length < 2) return { texto: args.texto, chip: null };
	if (sugestao.tipoDoCard === "value_picker" && args.categoriaDoBem) {
		return { texto: args.texto, chip: sliderDoValor(args.categoriaDoBem) };
	}
	return { texto: args.texto, chip: chipDe(sugestao.opcoes) };
}

/**
 * O ÚNICO card de toque do TURNO — um por turno, no último balão, derivado do ÚLTIMO PEDIDO do
 * turno.
 *
 * Defeito medido no print `prints-ux/07` (conversa web `1a4927bd`, 27/10/2026 20:49:07) e cobrado
 * pelo líder às 18:08: o chip era decidido a cada TRECHO do turno (`soltarTrecho`), então o toque
 * saía com as opções do balão em que o assunto começou e pousava embaixo do balão seguinte — no
 * print 08 o cliente leu "Qual dessas cartas você quer seguir?" sem toque do lado dela, porque o
 * único card do turno tinha sido decidido duas falas antes. Aqui a decisão é do TURNO: o texto que
 * entra é o do último balão, e o card que sai é UM só.
 *
 * A lista MARCADA escrita nesse balão ("1) … 2) …") continua ganhando do momento: ela é a escolha
 * que o modelo escreveu. A alternativa solta na frase ("…, ou prefere usar só o embutido?") NÃO é
 * menu — foi ela que virava botão com a pergunta inteira dentro (ver `garantirChip`), e por isso
 * aqui quem responde é o `sugestoes.ts`.
 *
 * O TURNO INTEIRO, e não só o último balão (R20). Defeito medido no SHA `3236f59f`: o pedido de
 * CPF/celular saía num balão e o fecho ("Tudo bem, aguardo.") noutro — o toque nascia do fecho,
 * que não pede nada, e virava `Quero essa`. Agora o balão que PEDE (pergunta ou pedido de dado,
 * `balaoPedeResposta`) é procurado de trás pra frente no turno inteiro; só quando nenhum balão
 * pede nada é que a resposta é o próximo passo do momento. O card continua UM, no fim do turno.
 *
 * Esta função NUNCA cria fala: ela só deriva os toques. O card é mensagem própria (`[card: …]`),
 * como sempre foi.
 */
export function chipDoTurno(args: {
	/** Os textos dos balões do turno, na ORDEM em que foram ao canal. */
	baloes: readonly string[];
	cardsDoTurno: readonly { type: string }[];
	temCartaNaTela?: boolean;
	canal?: "web" | "whatsapp";
	falaDoCliente?: string;
	categoriaDoBem?: Category;
}): CardGerado | null {
	const baloes = args.baloes.map((b) => b.trim()).filter(Boolean);
	const ultimo = baloes[baloes.length - 1];
	if (!ultimo) return null;

	// O BALÃO DO PEDIDO: o último, de trás pra frente, que pergunta ou pede um dado. Sem nenhum,
	// o turno não pede resposta — e aí o último balão é o que ganha o próximo passo do momento.
	//
	// A busca é feita nas FRASES de cada balão: num balão único com o pedido numa frase e o fecho
	// noutra ("Pode me mandar o CPF e o celular escritos aqui mesmo? Se for a Canopus de 96 meses
	// que eu recomendei, eu já gero a proposta no seu nome.") quem pede é a PRIMEIRA frase — o
	// fecho afirmativo não pode decidir o card. O que segue para a derivação é o BALÃO da frase que
	// pede, e não a frase solta: a lista marcada (`listaDeOpcoes`) e o `toqueBloqueado` leem o
	// balão inteiro, e o `sugestoes.ts` refaz a varredura frase a frase dentro dele.
	const pedido =
		[...baloes].reverse().find((balao) => frasesDe(balao).some(balaoPedeResposta)) ?? ultimo;

	// O card que COLETA o dado pedido é a resposta do pedido — vale para o balão de onde o toque
	// sai, não para o texto solto do fim do turno.
	if (toqueBloqueado(pedido, args.cardsDoTurno)) return null;

	// 1. A lista MARCADA escrita no balão do pedido.
	const daLista = listaDeOpcoes(pedido);
	if (daLista) return chipDe(daLista.opcoes);

	// 2. A resposta do que o agente acabou de perguntar/pedir.
	const sugestao = sugestaoDoTurno(pedido, {
		temCartaNaTela: args.temCartaNaTela === true,
		...(args.canal ? { canal: args.canal } : {}),
		...(args.falaDoCliente ? { falaDoCliente: args.falaDoCliente } : {}),
		...(args.categoriaDoBem ? { categoriaDoBem: args.categoriaDoBem } : {}),
	});
	if (sugestao.opcoes.length < 2) return null;
	if (sugestao.tipoDoCard === "value_picker" && args.categoriaDoBem) {
		return sliderDoValor(args.categoriaDoBem);
	}
	return chipDe(sugestao.opcoes);
}

/**
 * O SLIDER DO VALOR DO BEM — o card `value_picker` com a faixa REAL da categoria.
 *
 * Ordem da auditoria ("4 turnos pedindo valor saíram em texto puro") e ordem do dono das 13:50:
 * a pergunta de valor tem card. Os números não são inventados: `min`/`max`/`step`/`default` vêm de
 * `CREDIT_BOUNDS`, a mesma régua do funil — e é por isso que sem a categoria na conversa o card
 * não sai (faixa de valor de categoria desconhecida seria número inventado).
 */
function sliderDoValor(categoria: Category): CardGerado {
	const { min, max, step, default: padrao } = CREDIT_BOUNDS[categoria];
	return {
		type: "value_picker",
		payload: {
			category: categoria,
			fields: [
				{
					id: "valor-do-bem",
					label: "Valor do bem",
					min,
					max,
					step,
					default: padrao,
					format: "currency",
				},
			],
		},
	};
}

/** Cada opção nasce com `replyId` do SERVIDOR (nunca do modelo) — é ele que o clique consome. */
function chipDe(opcoes: readonly string[]): CardGerado {
	return {
		type: "quick_reply",
		payload: {
			// `crypto.randomUUID` é global no runtime do servidor (mesmo id que a
			// main gerava em `converse.ts`) — o id é do SERVIDOR, nunca do modelo.
			options: opcoes.map((label) => ({ label, replyId: crypto.randomUUID() })),
		},
	};
}
