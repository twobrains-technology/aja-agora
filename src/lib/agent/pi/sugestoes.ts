// A RESPOSTA RÁPIDA QUE FAZ SENTIDO NO MOMENTO — derivada do ESTADO, não do texto.
//
// Ordem do dono (27/10/2026, 13:35): *"sempre ter opcoes de responta automatica que facam sentido
// com a dinamica da conversa"*. Medido antes desta mudança: **408 de 3.073** turnos do agente
// (13,3 %) traziam `quick_reply` — o detector de `chips.ts` só reconhecia a lista marcada no texto
// ("1) … 2) …") ou a alternativa escrita ("A ou B?"), então toda pergunta aberta do vendedor
// ("qual dessas fica melhor pra você?") ficava sem botão.
//
// Aqui a opção nasce do FATO do turno: o que o vendedor acabou de perguntar e o que já está na
// tela. Não é guarda de fala — nada é cortado nem reescrito; é o mesmo contrato de UI de
// `manterUmaPergunta`/`garantirChip`: pergunta feita sem toque disponível é pergunta perdida.
// O que o modelo escreve continua mandando: se ele mostrou um card de escolha, o card é a
// resposta e nada é acrescentado (`garantirChip`).
//
// DUAS ORDENS NOVAS DO DONO (27/10/2026, 17:15 e 17:16) mudaram o critério:
//
// · 17:15 — *o toque é a RESPOSTA do cliente ao que ESTE turno do agente acabou de dizer*: nunca
//   a pergunta que o cliente fez, nunca tema de outro momento. Caso medido no print
//   `.orientacao/prints-ux/05-fala-curta-com-quick-reply.png`: o cliente perguntou "e como
//   funciona esse lance? vale a pena dar lance?", o agente explicou e fechou com "Quer que eu
//   mostre os números exatos do lance na carta de R$ 230 mil, para você comparar?" — e os toques
//   saíram `Quero dar lance` · `Prefiro só sorteio` · `Como funciona o lance?`: não respondem ao
//   pedido do agente e o terceiro repete a fala do cliente. A causa estava AQUI: o array `TIPOS`
//   casava por PALAVRA-TEMA em qualquer lugar da última frase (`/\blance\b/i` vinha antes de
//   tudo), e o sim/não só era consultado depois. Por isso o tema saiu da frente: a classificação
//   agora é a do PEDIDO do agente, na ordem (a)→(f) abaixo, e a fala do cliente entra só como
//   filtro anti-eco.
// · 17:16 — *os balões aparecem em TODO turno do agente*, pergunte ele ou não: sem pergunta, os
//   balões são os próximos passos naturais do cliente naquele momento (depois da falha da
//   proposta: `Tentar de novo` · `Ver outra carta`). A garantia é de CÓDIGO: o turno sem balão é
//   derivado aqui, não depende de o modelo lembrar. Fim do `null` para texto sem "?".
//
// A ORDEM DE DECISÃO (a)→(f), a primeira que casa ganha:
//   (a) alternativa explícita na pergunta ("A ou B?", "carro, moto ou imóvel") → ela mesma. Quem
//       detecta isso no TEXTO é o `detectarOpcoes` de `chips.ts`, que roda ANTES de chamar esta
//       função — aqui a mesma ideia aparece no pedido de tipo de bem (`Carro`/`Moto`/`Imóvel`).
//   (b) pergunta de sim/não → respostas de sim/não CASADAS COM O VERBO do pedido.
//   (c) pedido de DADO concreto (valor, parcela, tipo de bem, CPF) → as opções daquele dado;
//       valor do bem com a categoria conhecida pede o card `value_picker` (slider), não chips.
//   (d) pergunta aberta com carta na tela → a decisão sobre o que ele está vendo.
//   (e) turno SEM pergunta → os próximos passos do momento.
//   (f) fallback → o par que serve a qualquer conversa.

import type { Category } from "@/lib/agent/personas";

/** O card que a sugestão pede. `value_picker` só para o VALOR do bem: o slider é a pergunta do
 * valor (faixa real da categoria, `CREDIT_BOUNDS`); parcela não tem régua no repo — ver
 * `FAIXAS_DE_PARCELA`. */
export type CardDaSugestao = "quick_reply" | "value_picker";

export type MomentoDaConversa = {
	/** Já há carta (oferta real) na tela desta conversa. */
	temCartaNaTela?: boolean;
	/** Canal da conversa — o WhatsApp tem botão de lista, a web tem chip. Hoje os dois usam o
	 * mesmo `quick_reply`; o campo existe para o dia em que divergirem. */
	canal?: "web" | "whatsapp";
	/** A ÚLTIMA fala do cliente — a que este turno do agente está respondendo. É contra ela que
	 * roda o filtro anti-eco: a resposta rápida não pode repetir o que a pessoa acabou de dizer
	 * (ordem das 17:15). */
	falaDoCliente?: string;
	/** Categoria do bem já declarada na conversa. Sem ela NÃO há `value_picker`: o slider do
	 * valor vale a faixa real da categoria, e faixa inventada é número inventado. */
	categoriaDoBem?: Category;
};

/** O que o turno deve oferecer para toque, e em que card. */
export type SugestaoDoTurno = { opcoes: string[]; tipoDoCard: CardDaSugestao };

/**
 * Perguntas de RESPOSTA LIVRE: nenhum botão responde por ela — e um botão genérico ali é pior
 * que nenhum. Hoje, o nome.
 *
 * Medido na rodada de produção de 27/10 (R7, modelo de produção, 155 perguntas do agente): **28**
 * `quick_reply` genéricos ("Pode seguir / Tenho uma dúvida") caíram logo depois de "como posso te
 * chamar?" — convite a pular justamente o dado que salva o lead (P6). A primeira versão desta
 * regex só via "seu nome" e "como você se chama"; o modelo pergunta de outros jeitos.
 */
/** Atalhos da pergunta de NOME: nenhum botão escreve o nome pela pessoa, mas a conversa não
 * pode parar por causa dele. Duas saídas honestas, nenhuma convidando a recusar o dado. */
const SAIDAS_DO_NOME = ["Vamos direto às cartas", "Depois eu te digo"];

const RESPOSTA_LIVRE =
	/\b(?:seu|teu)\s+(?:primeiro\s+)?nome\b|\bcomo\s+(?:voc[êe]|vc|posso|eu\s+posso|devo)\s+(?:te\s+|lhe\s+)?(?:se\s+)?cham(?:a|ar|o|á-lo)\b|\bme\s+diz\s+(?:o\s+)?(?:seu\s+)?nome\b|\bqual\s+(?:é|e|eh)?\s*o\s+nome\b|\bposso\s+te\s+chamar\b/i;

/** A pergunta é do tipo sim/não — a resposta mais natural é "sim" ou a dúvida. O sujeito
 * ("você quer…", "vc prefere…") vem na frente do verbo em quase toda pergunta do vendedor. */
const SIM_NAO =
	/^\s*(?:(?:voc[êe]|vc|tu)\s+)?(?:quer|querer|pode|posso|podemos|vamos|prefere|deseja|gostaria|confirma|tudo\s+bem|faz\s+sentido|ok)\b/i;

/** A pergunta que só pede confirmação no fim ("…, certo?", "…, combinado?"). */
const CONFIRMA_NO_FIM = /,\s*(?:certo|combinado|tudo\s+bem|beleza|ok)\s*\?/i;

/** O VERBO do pedido decide a resposta do sim/não. A ordem importa: "números" também contém
 * "número" (o do WhatsApp), e o pedido de mostrar os números vem antes. */
const PEDIDO_DE_NUMEROS = /mostr|\bver\b|n[úu]meros|compara/i;
const PEDIDO_DE_SEGUIR = /seguir|gerar|proposta|fechar|preparar/i;
const PEDIDO_DE_WHATS = /whats\s?app|telefone|celular|n[úu]mero/i;

/** O pedido de dado pode vir de pergunta ("quanto você pensa em gastar?") ou de imperativo
 * ("me diz quanto…", "digite seu CPF"). */
const PEDIDO_DIRETO =
	/^(?:me\s+(?:diz|diga|fala|passa|manda|informa)|digite|digita|informe|escreva|escreve)\b/i;

/** (c) Os dados que o agente pede — a lista daquele dado, na voz da pessoa. */
const FAIXAS_DE_VALOR = ["Até R$ 50 mil", "Uns R$ 80 mil", "R$ 100 mil ou mais"];
/** Parcela NÃO virou `value_picker`: o repo não tem régua de parcela (o slider do valor vale
 * `CREDIT_BOUNDS`, que é crédito do bem). O que existe é `parcelaEstimadaDeMercado`, que é número
 * DERIVADO de um valor — pendência para o dono decidir se algum dia houver faixa própria. */
const FAIXAS_DE_PARCELA = ["Até R$ 800", "Até R$ 1.200", "Quero saber o mínimo"];
const TIPOS_DE_BEM = ["Carro", "Moto", "Imóvel"];
const RESPOSTAS_DO_CPF = ["Pode usar meu CPF", "Por que precisa do CPF?"];

const DADO_DE_PARCELA = /parcela|por\s+m[êe]s|mensalidade/i;
const DADO_DE_CPF = /\bcpf\b/i;
const DADO_DE_VALOR = /\bquanto\b|valor|or[çc]amento|gastar|investir/i;
const DADO_DE_BEM = /carro|moto|im[óo]vel|tipo\s+de\s+bem|qual\s+bem/i;

/** (d) A pergunta aberta com a carta na tela é sobre o que ele está vendo. */
const DEPOIS_DA_OFERTA = ["Quero essa", "Ver outra opção", "Como funciona o lance?"];

/** (e) Turno SEM pergunta: o próximo passo natural do cliente naquele momento. */
const PROXIMOS_SEM_CARTA = ["Quero ver as opções", "Tenho uma dúvida"];
const PROXIMOS_COM_CARTA = ["Quero essa", "Ver outra opção", "Falar do lance"];

/** (f) A conversa continua mesmo quando o pedido não é nenhuma das formas acima. */
const GENERICO = ["Pode seguir", "Tenho uma dúvida"];

/** A última frase é a unidade de decisão: classificar o texto inteiro pegava palavra de uma
 * explicação anterior ("Vou te explicar como funciona a contemplação\nFaz sentido pra você?") e
 * oferecia toque de outro assunto. */
function ultimaFraseDe(texto: string): string {
	return (
		texto
			.split(/(?<=[?.!])\s+|\n+/)
			.map((f) => f.trim())
			.filter(Boolean)
			.pop() ?? texto
	);
}

/** Minúsculas, sem acento e sem pontuação — por esta forma duas falas são a MESMA fala. */
function normalizar(texto: string): string {
	return texto
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/** Palavra de CONTEÚDO: as curtas ("o", "a", "de", "ver") não distinguem uma opção de uma fala. */
const PALAVRA_DE_CONTEUDO = 4;

/**
 * A opção REPETE o que o cliente acabou de dizer?
 *
 * Duas formas, porque a repetição é a mesma coisa em duas grafias:
 *  · a opção inteira está na fala — `Como funciona o lance?` depois de o cliente dizer isso;
 *  · as palavras de conteúdo da opção estão TODAS na fala, ainda que com uma palavra no meio
 *    ("como funciona ESSE lance" × "como funciona O lance"). É esta segunda que impede o eco do
 *    print 05, onde a repetição não é literal.
 */
function repeteOFalado(opcao: string, fala: string, palavrasDaFala: ReadonlySet<string>): boolean {
	const daOpcao = normalizar(opcao);
	if (!daOpcao || !fala) return false;
	if (fala.includes(daOpcao)) return true;
	const conteudo = daOpcao.split(" ").filter((p) => p.length >= PALAVRA_DE_CONTEUDO);
	return conteudo.length > 0 && conteudo.every((p) => palavrasDaFala.has(p));
}

/**
 * (ANTI-ECO, ordem das 17:15) Nenhuma opção pode repetir a fala do cliente: pergunta que ELE
 * acabou de fazer não é resposta dele ao agente. Sobraram menos de duas opções? O fallback
 * completa — o turno nunca sai sem toque.
 */
function semEco(opcoes: readonly string[], falaDoCliente?: string): string[] {
	const fala = normalizar(falaDoCliente ?? "");
	const palavrasDaFala = new Set(fala.split(" ").filter(Boolean));
	const limpas = opcoes.filter((o) => !repeteOFalado(o, fala, palavrasDaFala));
	if (limpas.length >= 2) return limpas;
	for (const alternativa of GENERICO) {
		if (limpas.length >= 2) break;
		if (limpas.includes(alternativa)) continue;
		if (repeteOFalado(alternativa, fala, palavrasDaFala)) continue;
		limpas.push(alternativa);
	}
	return limpas;
}

/** (b) A resposta do sim/não casa com o VERBO do pedido: "quer ver os números?" não se responde
 * "Quero dar lance". */
function respostasDeSimNao(pedido: string): string[] {
	if (PEDIDO_DE_NUMEROS.test(pedido)) return ["Quero ver os números", "Agora não"];
	if (PEDIDO_DE_SEGUIR.test(pedido)) return ["Pode seguir", "Agora não"];
	if (PEDIDO_DE_WHATS.test(pedido)) return ["Sigo pelo WhatsApp", "Prefiro aqui"];
	return ["Sim, pode", "Agora não"];
}

/** (c) O dado concreto que a pergunta pede — a lista daquele dado. */
function dadoPedido(alvo: string, momento: MomentoDaConversa): SugestaoDoTurno | null {
	if (DADO_DE_CPF.test(alvo)) return { opcoes: RESPOSTAS_DO_CPF, tipoDoCard: "quick_reply" };
	if (DADO_DE_PARCELA.test(alvo)) return { opcoes: FAIXAS_DE_PARCELA, tipoDoCard: "quick_reply" };
	if (DADO_DE_VALOR.test(alvo)) {
		return {
			opcoes: FAIXAS_DE_VALOR,
			// O valor do bem tem card próprio: o slider da faixa real da categoria. Sem a
			// categoria no contexto, o card não sai e as faixas viram botão. No WhatsApp o
			// card não sai NUNCA (FIX-109, decisão do Kairo 28/06/2026: lá o valor do bem é
			// conversa e o `valuePickerToWhatsApp` degrada o card) — lá, botão de faixa.
			tipoDoCard:
				momento.categoriaDoBem && momento.canal !== "whatsapp" ? "value_picker" : "quick_reply",
		};
	}
	if (DADO_DE_BEM.test(alvo)) return { opcoes: TIPOS_DE_BEM, tipoDoCard: "quick_reply" };
	return null;
}

/**
 * A tabela (a)→(f) — qual é o pedido DESTE turno e o que o cliente responderia a ele.
 *
 * `null` não existe mais: todo turno do agente tem um próximo passo do cliente (ordem das 17:16).
 */
function decidir(texto: string, momento: MomentoDaConversa): SugestaoDoTurno {
	const ultimaFrase = ultimaFraseDe(texto);
	const alvo = ultimaFrase.includes("?") ? ultimaFrase : texto;
	const ehPergunta = texto.includes("?");

	// (e) TURNO SEM PERGUNTA — os próximos passos do momento, não uma resposta inventada.
	if (!ehPergunta) {
		return {
			opcoes: momento.temCartaNaTela ? PROXIMOS_COM_CARTA : PROXIMOS_SEM_CARTA,
			tipoDoCard: "quick_reply",
		};
	}

	// (b) PERGUNTA DE SIM/NÃO — a resposta é sim/não, casada com o verbo do pedido.
	const limpa = alvo.replace(/^[^A-Za-zÀ-ÿ]+/, "");
	if (ultimaFrase.includes("?") && (SIM_NAO.test(limpa) || CONFIRMA_NO_FIM.test(alvo))) {
		return { opcoes: respostasDeSimNao(alvo), tipoDoCard: "quick_reply" };
	}

	// (c) PEDIDO DE DADO — pergunta ou imperativo ("me diz quanto…").
	const pedeODado = ultimaFrase.includes("?") || PEDIDO_DIRETO.test(limpa);
	const dado = pedeODado ? dadoPedido(alvo, momento) : null;
	if (dado) return dado;

	// (d) PERGUNTA ABERTA COM CARTA NA TELA — a decisão é sobre o que ele está vendo.
	if (ultimaFrase.includes("?") && momento.temCartaNaTela) {
		return { opcoes: DEPOIS_DA_OFERTA, tipoDoCard: "quick_reply" };
	}

	// (f) FALLBACK.
	return { opcoes: GENERICO, tipoDoCard: "quick_reply" };
}

/**
 * A sugestão do turno: as opções que o cliente toca e o card em que elas saem.
 *
 * Nunca vazio. A única forma de resposta que é o PRÓPRIO dado é a pergunta de nome, que tem duas
 * saídas próprias (`SAIDAS_DO_NOME`) — nenhuma delas recusa o dado, e nenhuma delas é eco: a
 * fala do cliente ali é o nome, não uma pergunta parecida com esses botões.
 */
export function sugestaoDoTurno(
	pergunta: string,
	momento: MomentoDaConversa = {},
): SugestaoDoTurno {
	const texto = (pergunta ?? "").trim();
	if (RESPOSTA_LIVRE.test(texto)) return { opcoes: SAIDAS_DO_NOME, tipoDoCard: "quick_reply" };
	const escolhida = decidir(texto, momento);
	return { ...escolhida, opcoes: semEco(escolhida.opcoes, momento.falaDoCliente) };
}

/** Só os rótulos — o que a maioria dos chamadores quer. */
export function sugestoesDaPergunta(pergunta: string, momento: MomentoDaConversa = {}): string[] {
	return sugestaoDoTurno(pergunta, momento).opcoes;
}
