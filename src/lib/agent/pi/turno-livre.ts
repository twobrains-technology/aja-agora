// O TURNO DO VENDEDOR LIVRE — o motor que substitui o funil.
//
//   captura de identidade (servidor) → caixa + skills → beat do pi → cards por
//   resultado → persistência
//
// Não existe `route`, `advance`, `capture`, `emit-card` nem gate: quem decide o
// que dizer, quando buscar e quando fechar é o MODELO, a partir do prompt do
// vendedor e das duas skills. O código só garante FATO — identidade cifrada,
// carta real, proposta real, persistência — e protege o que não pode vazar.
//
// É o único motor: `runTurn` chama daqui direto, sem flag.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { listShownOffersForConversation } from "@/lib/agent/orchestrator/choose-offer";
import { maskCpfForDisplay } from "@/lib/agent/orchestrator/contract-form-prefill";
import type { TurnEvent, TurnInput } from "@/lib/agent/orchestrator/types";
import { passaFinal } from "@/lib/agent/orchestrator/vazamento";
import { parseAssetValue } from "@/lib/agent/parse-asset-value";
import type { Category } from "@/lib/agent/personas";
import { picarEmBaloes } from "@/lib/agent/pi/baloes";
import { type MetaDaEmissao, TIPOS_DE_ESCOLHA } from "@/lib/agent/pi/cards-livres";
import { chipDoUltimoBalao, garantirChip } from "@/lib/agent/pi/chips";
import { executarBeat } from "@/lib/agent/pi/converse";
import { linhaFinalDoHandoff, RE_DE_PROMESSA } from "@/lib/agent/pi/handoff";
import { criarNarracaoDoTurno } from "@/lib/agent/pi/narracao";
import { persistirTurnoLivre } from "@/lib/agent/pi/persist-livre";
import { custoDoTurnoCentsExatos } from "@/lib/agent/pi/precos";
import { modeloDoAgente } from "@/lib/agent/pi/sessao";
import { montarSystemDoVendedor } from "@/lib/agent/pi/system-do-vendedor";
import { type PiToolDefinition, toPiTools } from "@/lib/agent/pi/tools";
import {
	buildToolsLivres,
	type ContextoDasTools,
	type DepsDasToolsLivres,
	NOMES_DAS_TOOLS_LIVRES,
} from "@/lib/agent/pi/tools-livres";
import { manterUmaPergunta } from "@/lib/agent/pi/uma-pergunta";
import { type EstadoDoTurno, estadoInicialDoTurno } from "@/lib/agent/turn/estado";
import { projectToMeta } from "@/lib/agent/turn/projecao";
import {
	isValidCpf,
	loadIdentity,
	maskPhoneForDisplay,
	type StoredIdentity,
	storeIdentity,
} from "@/lib/conversation/identity";
import { loadConversationHistory } from "@/lib/conversation/messages";
import { metaOf } from "@/lib/conversation/meta";
import {
	celularEhTelefone,
	dddValido,
	ehCelularBR,
	pedidoDeCpfNoUltimoBalao,
} from "@/lib/conversation/telefone-ou-cpf";
import { saveContactWhatsapp } from "@/lib/leads/contact-capture";
import { marcarPrimeiraCarta } from "@/lib/observability/sinais/marcar-primeira-carta";
import { registrarUsoDeIa } from "@/lib/observability/sinais/publicar";
import {
	type ArtefatoDaConversa,
	lerCartasDaConversa,
	restaurarCartasDaConversa,
} from "./cartas-da-conversa";

/** Troca TODAS as ocorrências do número — `String.replace` com string troca só a
 * primeira, e quem repete o CPF na mesma mensagem deixava o número em claro no
 * log, no histórico e no prompt. */
function mascararTodas(texto: string, alvo: string, marcador: string): string {
	return alvo ? texto.split(alvo).join(marcador) : texto;
}

/** Identidade para o PROMPT: sem CPF não há identidade, ainda que o celular já
 * tenha chegado. Os dígitos nunca vão ao modelo — só o marcador. */
function identidadeDeCpf(identidade: StoredIdentity | null): StoredIdentity | null {
	return identidade?.cpf ? identidade : null;
}

/** Identidade que o cliente digitou nesta fala — capturada no SERVIDOR, nunca
 * pelo modelo. Devolve o texto sem os números, que é o que vai para o banco, para
 * o provedor do modelo e para o admin. */
export function capturarIdentidadeDoTexto(
	texto: string,
	atual: StoredIdentity | null,
	contexto: { pedidoDeCpf: boolean } = { pedidoDeCpf: false },
): {
	identidade: StoredIdentity | null;
	textoLimpo: string;
	recebeuCpf: boolean;
	recebeuCelular: boolean;
} {
	let recebeuCpf = false;
	let recebeuCelular = false;
	let cpf = atual?.cpf ?? null;
	let celular = atual?.celular ?? null;
	let textoLimpo = texto;

	// ── Quem é quem: TELEFONE × CPF ────────────────────────────────────────
	// `11900000083` é celular de São Paulo (DDD 11 + 9º dígito) E passa no DV do
	// CPF por coincidência — como ~1% dos celulares. O Pi levava o número como
	// CPF (este passo roda antes do telefone), e o cliente ficava sem o telefone
	// que acabou de ditar e com um CPF que não é dele (L11/P188/P263).
	//
	// O desempate é a regra ÚNICA do projeto
	// (`@/lib/conversation/telefone-ou-cpf`), a mesma que o capturador do
	// WhatsApp usa: número com cara de celular só é CPF quando o cliente DECLARA
	// o dado (a palavra "cpf" no texto, ou o CPF formatado) ou quando o agente
	// acabou de pedir o CPF — `contexto.pedidoDeCpf`, que é fato do histórico.
	const ehTelefone = (digitos: string) =>
		celularEhTelefone({ digitos, texto, pedidoDeCpf: contexto.pedidoDeCpf });

	// ── CPF ────────────────────────────────────────────────────────────────
	// Só entra CPF FORMATADO (`111.444.777-35`) ou 11 dígitos que PASSAM no
	// dígito verificador. Um número solto de 11 dígitos é, na maioria das vezes,
	// celular — tratá-lo como CPF apagava o telefone que o cliente acabou de
	// digitar (o regex antigo levava "11987654321" embora como CPF inválido).
	const formatado = textoLimpo.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/)?.[0] ?? null;
	const candidatos = [...textoLimpo.matchAll(/\b\d{11}\b/g)].map((m) => m[0]);
	const cpfSolto = candidatos.find((c) => isValidCpf(c) && !ehTelefone(c)) ?? null;
	const cpfCandidato = formatado ?? cpfSolto;

	if (cpfCandidato) {
		const digitos = cpfCandidato.replace(/\D/g, "");
		if (isValidCpf(digitos)) {
			cpf = digitos;
			recebeuCpf = true;
			textoLimpo = mascararTodas(textoLimpo, cpfCandidato, "[CPF recebido e guardado]");
		} else if (formatado) {
			textoLimpo = mascararTodas(textoLimpo, cpfCandidato, "[CPF não reconhecido]");
		}
	}

	// ── CELULAR ────────────────────────────────────────────────────────────
	// Procurado DEPOIS de o CPF sair do texto (senão casa com os dígitos dele).
	const formatadoTel =
		textoLimpo.match(/(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-.\s]?\d{4}\b/)?.[0] ?? null;
	const soltos = [...textoLimpo.matchAll(/\b\d{10,11}\b/g)].map((m) => m[0]);
	// O celular vale mesmo quando passaria no DV do CPF: se o passo anterior não o
	// tomou como CPF (só o faz quando o cliente DECLAROU o dado ou o CPF foi
	// pedido), este é o número que ele ditou.
	const telSolto =
		soltos.find((t) => ehCelularBR(t)) ??
		soltos.find((t) => t.length === 10 && dddValido(t.slice(0, 2))) ??
		null;
	const teleCandidato = formatadoTel ?? telSolto;

	if (teleCandidato) {
		const digitos = teleCandidato.replace(/\D/g, "");
		const semDdi = digitos.length === 13 && digitos.startsWith("55") ? digitos.slice(2) : digitos;
		if ((semDdi.length === 10 || semDdi.length === 11) && dddValido(semDdi.slice(0, 2))) {
			celular = semDdi;
			recebeuCelular = true;
			textoLimpo = mascararTodas(textoLimpo, teleCandidato, "[telefone recebido e guardado]");
		}
	}

	// CPF parcial VALE: o celular pode chegar na mensagem seguinte, e o servidor
	// precisa lembrar do CPF entre turnos (antes, CPF sozinho era descartado e a
	// mensagem dizia "guardado" sem ter guardado nada).
	//
	// Celular SEM CPF também VALE: ele é dito antes do CPF com frequência ("meu
	// número é (21) 9…, depois eu passo o CPF"). Devolver `null` aqui jogava o
	// número fora no mesmo turno em que ele chegou — o cliente via "guardado" e o
	// número não existia em lugar nenhum. O `cpf` fica vazio até ele chegar.
	const identidade = cpf || celular ? { cpf: cpf ?? "", celular: celular ?? "" } : null;

	// Varredura final: TODO CPF válido sai do texto, inclusive um SEGUNDO CPF
	// diferente no mesmo recado ("o meu é X, o da minha esposa é Y"). O formatado
	// é inequívoco; a sequência solta de 11 dígitos só conta se não for o celular
	// recém-guardado (celular é DDD válido + 9, e ~1% passa no DV do CPF).
	textoLimpo = textoLimpo
		.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, (m) =>
			isValidCpf(m) ? "[CPF recebido e guardado]" : m,
		)
		.replace(/\b\d{11}\b/g, (m) =>
			isValidCpf(m) && m !== celular ? "[CPF recebido e guardado]" : m,
		);

	return { identidade, textoLimpo, recebeuCpf, recebeuCelular };
}

/** O texto que sai no balão: CPF mascarado e uma pergunta por trecho.
 * A fala NÃO é reescrita por trava de LGPD (decisão do dono, 27/10/2026) — o que
 * protege é o encanamento: máscara, cifra e o aceite conferido antes do bureau.
 *
 * O CHIP NÃO SAI DAQUI. Um card por turno, decidido no ÚLTIMO balão
 * (`chipDoUltimoBalao`, ordem do líder de 27/10 18:08): decidir por trecho dava o
 * toque do primeiro balão embaixo do segundo (prints 07/08). O que continua sendo
 * deste trecho é a FORMA do balão — a lista marcada que virou botão sai do texto
 * (N05), mesmo que os botões só sejam emitidos no fim do turno.
 * Exportado para ser testado sem banco. */
export function montarTrechoDeSaida(args: {
	texto: string;
	cardsDoTurno?: readonly { type: string }[];
	handoff?: { nome: string | null; clientePediu: boolean; casoAberto: boolean };
	/** A conversa já tem carta na tela — muda a resposta rápida de pergunta aberta. */
	temCartaNaTela?: boolean;
	canal?: "web" | "whatsapp";
	/** A última fala do cliente, a que este turno responde: o toque não repete o que ele disse
	 * (ordem do dono, 27/10 17:15). */
	falaDoCliente?: string;
	/** Categoria do bem já declarada — autoriza o slider do valor (`value_picker`). */
	categoriaDoBem?: Category;
}): { texto: string } {
	// O ÚLTIMO PASSE roda AQUI, no texto que vai AO VIVO para o canal — não só na
	// persistência: máscara de CPF e o corte de vazamento de máquina (JSON de
	// argumento, nome de tool) têm de valer para o cliente, não só para o banco.
	const bruto = passaFinal(args.texto);
	const texto = bruto;
	if (args.handoff) {
		// O balão do handoff é UMA linha sem promessa. O modelo acrescentava uma confirmação
		// com prazo ("um especialista vai entrar em contato em breve") — duas vozes, uma delas
		// prometendo o que nada sustenta.
		const linha = linhaFinalDoHandoff({
			texto: bruto,
			nome: args.handoff.nome,
			clientePediu: args.handoff.clientePediu,
			casoAberto: args.handoff.casoAberto,
		});
		return { texto: linha };
	}

	// Uma pergunta por mensagem: o verificador roda sobre o texto do modelo.
	const final = manterUmaPergunta(texto);
	// A forma do balão (a lista marcada vira botão e sai do texto, N05) é decidida
	// aqui; o CHIP é derivado uma vez no fim do turno.
	return {
		texto: garantirChip({
			texto: final,
			cardsDoTurno: args.cardsDoTurno ?? [],
			...(args.temCartaNaTela ? { temCartaNaTela: true } : {}),
			...(args.canal ? { canal: args.canal } : {}),
			...(args.falaDoCliente ? { falaDoCliente: args.falaDoCliente } : {}),
			...(args.categoriaDoBem ? { categoriaDoBem: args.categoriaDoBem } : {}),
		}).texto,
	};
}

/** Texto antes e depois de uma tool é fala DIFERENTE: sem separador o stream
 * cola "…você, Marcos!Então…". A primeira fala depois de uma tool abre um
 * `text-boundary` (web: balão novo; WhatsApp: mensagem nova; persistência: um
 * balão por boundary). */
export function criarSeparadorDeTrechos() {
	let falou = false;
	let toolDesdeAFala = false;
	// A fala anterior já fechou porque era OUTRA bolha do mesmo trecho (conversa picada):
	// o próximo delta abre balão novo, como se uma tool tivesse entrado no meio.
	let balaoNovo = false;
	const jáSoltos = new Set<string>();
	const normalizar = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
	return {
		aoToolCall() {
			if (falou) toolDesdeAFala = true;
		},
		/** O balão anterior é outro balão: o próximo delta abre um `text-boundary` (web: balão
		 * novo; WhatsApp: mensagem nova; persistência: uma linha por boundary). */
		aoNovoBalao() {
			balaoNovo = true;
		},
		/** Eventos a emitir para este delta, na ordem. Um trecho IDÊNTICO a um já solto
		 * neste turno não sai: foi assim que "Ótimo! Vou gerar sua proposta agora na
		 * Canopus." apareceu duas vezes na tela, depois de a tool recusar o aceite. */
		aoDelta(texto: string): TurnEvent[] {
			const eventos: TurnEvent[] = [];
			if ((toolDesdeAFala || balaoNovo) && texto.trim().length > 0) {
				eventos.push({ type: "text-boundary" });
				toolDesdeAFala = false;
				balaoNovo = false;
			}
			if (texto.trim().length > 0) {
				const chave = normalizar(texto);
				if (jáSoltos.has(chave)) return eventos;
				jáSoltos.add(chave);
				falou = true;
			}
			eventos.push({ type: "text-delta", text: texto });
			return eventos;
		},
	};
}

/** As falas do fecho (avisos de divergência da proposta gerados pela tool) são
 * fala NOVA do turno: um balão por fala, com o último passe anti-vazamento já
 * aplicado — o mesmo texto que vai para o banco vai para o canal. Exportada para
 * ser testada sem Bevi e sem banco. */
export function eventosDasFalasDoFecho(falas: readonly string[]): TurnEvent[] {
	const eventos: TurnEvent[] = [];
	for (const fala of falas) {
		const limpo = passaFinal(fala);
		if (!limpo.trim()) continue;
		eventos.push({ type: "text-boundary" }, { type: "text-delta", text: limpo });
	}
	return eventos;
}

/** A MESMA chamada de tool — mesmo `toolCallId` — não pode gerar EFEITO duas
 * vezes no turno (L41/P301).
 *
 * Na `main` o card de cada tool nascia com o `toolCallId` da chamada
 * (`converse.ts:1699`), e era o `ToolNode` quem garantia uma execução por id. No
 * pi quem executa é o harness: um replay do mesmo `toolCallId` (retry do
 * provedor, chamada repetida na mesma rodada do modelo) chamava o `execute` de
 * novo — busca na Bevi de novo, card repetido na tela, evento duplicado. Aqui a
 * PRIMEIRA execução é memoizada; as seguintes leem o mesmo resultado, sem tocar
 * a fronteira de novo. Guarda a promessa, não o valor: duas chamadas do mesmo id
 * em paralelo também executam uma vez só. */
export function semRepetirChamada(tools: readonly PiToolDefinition[]): PiToolDefinition[] {
	const feitas = new Map<string, ReturnType<PiToolDefinition["execute"]>>();
	return tools.map((tool) => ({
		...tool,
		execute: (toolCallId, params) => {
			const chave = `${tool.name}:${toolCallId}`;
			const jaFeita = feitas.get(chave);
			if (jaFeita) return jaFeita;
			const executando = tool.execute(toolCallId, params);
			feitas.set(chave, executando);
			return executando;
		},
	}));
}

/** Palavras que DECLARAM o bem — lista fechada, como a das muletas de preço de
 * `parse-asset-value.ts`. É o que o cliente nomeia, não o que ele compara. */
const PALAVRAS_DE_CATEGORIA: ReadonlyArray<{ categoria: Category; re: RegExp }> = [
	{
		categoria: "auto",
		re: /\b(carro|carros|autom[óo]vel|suv|caminhonete|picape|van|ve[íi]culo)\b/gi,
	},
	{ categoria: "moto", re: /\b(moto|motos|motocicleta|motoneta|scooter)\b/gi },
	{
		categoria: "imovel",
		re: /\b(im[óo]vel|im[óo]veis|apartamento|casa|terreno|ch[áa]cara|s[íi]tio|reforma)\b/gi,
	},
];

/** As palavras que põem o dinheiro ao lado no contexto de LANCE — o que o
 * cliente vai OFERECER, não o preço do bem nem a parcela. É a versão na fala dos
 * cards `lance-value`/`lance-embutido` da `main`. Lista fechada, como a das
 * categorias: palavra desconhecida ao lado do número é ambígua e não vira lance.
 *
 * O marcador sozinho NÃO basta para gravar lance (P139) — ele diz de QUEM é o
 * dinheiro, não que o cliente o tenha. Na onda 17 a permissão é o molde
 * (`MOLDES_DO_LANCE`); esta lista serve só a MÁSCARA DO BEM, e o `ágio` da onda 15
 * saiu dela: os moldes do chefe falam de `lance` e `entrada`. */
const PALAVRAS_DE_LANCE = "lance|entrada";
const MARCADORES_DE_LANCE = new RegExp(`\\b(${PALAVRAS_DE_LANCE})\\b`, "gi");

/** O que pode ficar ENTRE o dinheiro e a palavra do lance sem desfazer o par:
 * preposições, artigos e possessivos. É o que separa "tenho 30 mil pro lance"
 * (declaração) de "quero um de 80 mil, qual o lance?" (pergunta sobre o lance,
 * onde o número ao lado é o valor do bem). */
const LIGACOES_DO_LANCE = new Set([
	"",
	"a",
	"o",
	"as",
	"os",
	"de",
	"do",
	"da",
	"dos",
	"das",
	"em",
	"no",
	"na",
	"nos",
	"nas",
	"com",
	"como",
	// `não` liga rótulo e valor NEGADOS: "meu lance não é de 30 mil" nomeia o
	// valor do LANCE e negado — sem esta ligação o 30 mil ficava órfão na oração
	// e o `parseAssetValue` o lia como valor do BEM (P212). Um `sem` NÃO entra
	// aqui: "quero um carro de 80 mil sem entrada" é o preço do bem, e o `sem`
	// fala da entrada.
	"nao",
	"pra",
	"para",
	"pro",
	"pelo",
	"pela",
	"um",
	"uma",
	"uns",
	"umas",
	"meu",
	"minha",
	"seria",
	"ser",
	"ate",
	"cerca",
	"torno",
	"volta",
	"reais",
	"real",
]);

/** As marcas de NEGAÇÃO que desmentem a categoria logo depois delas. A janela é
 * de 15 caracteres e NÃO cruza `.`, `,` nem `?`: a negação vale dentro da
 * MESMA oração. Em "não quero carro, quero imóvel" o `,` fecha a primeira e o
 * `não` não alcança o imóvel. */
const NEGACAO_DA_CATEGORIA =
	/(?:\bn[aã]o\b|\bnem\b|\bem\s+vez\s+de\b|\besquec\w*\b|\bdeix\w*\b)[^.,?]{0,15}$/i;

/** O cue explícito de TROCA (`na verdade`, `pensando melhor`, `mudei de ideia`,
 * `trocar`). Duas categorias com cue de troca é troca declarada, não
 * comparação — e a categoria que veio ANTES do cue é a que ficou para trás:
 * "eu queria imóvel, mas pensando melhor quero uma moto". */
const CUE_DE_TROCA = /\b(?:na\s+verdade|pensando\s+melhor|mudei\s+de\s+ideia|troc\w*)\b/i;

/** Em que posições (início da palavra) a categoria aparece no texto. As regexes
 * de `PALAVRAS_DE_CATEGORIA` são `g`: a cópia com o mesmo `source` evita depender
 * do `lastIndex` delas. */
function ocorrenciasDaCategoria(re: RegExp, texto: string): number[] {
	return [...texto.matchAll(new RegExp(re.source, "gi"))].map((m) => m.index ?? 0);
}

/** A categoria AFIRMADA numa fala que nomeia DUAS ou mais.
 *
 * "carro ou moto" continua FORA: é comparação, nenhuma das duas está negada,
 * sobra mais de uma e o resultado é `undefined` — escolher uma envenenaria o
 * filtro do painel e o estágio do lead. TROCA é outra coisa: "quero uma moto,
 * não imóvel" e "deixa o carro, quero uma moto" negam uma categoria e afirmam
 * a outra. Até aqui o código jogava as duas fora — o modelo dizia que trocou e o
 * `currentCategory` do banco continuava o antigo.
 *
 * A categoria é negada quando aparece precedida, na mesma oração, por alguma
 * marca de `NEGACAO_DA_CATEGORIA`, ou quando vem antes do `CUE_DE_TROCA`. */
function categoriaDaTroca(texto: string): Category | undefined {
	const cue = CUE_DE_TROCA.exec(texto);
	const afirmadas = PALAVRAS_DE_CATEGORIA.filter((p) =>
		ocorrenciasDaCategoria(p.re, texto).some((inicio) => {
			const antes = texto.slice(Math.max(0, inicio - 24), inicio);
			if (NEGACAO_DA_CATEGORIA.test(antes)) return false;
			return !(cue && inicio < (cue.index ?? 0));
		}),
	);
	return afirmadas.length === 1 ? afirmadas[0]?.categoria : undefined;
}

/** O que o cliente DECLAROU neste turno — categoria e valor do bem —, sem
 * esperar a busca (L44/P212).
 *
 * Até aqui só `buscar_cartas` abastecia `currentCategory` e
 * `qualifyAnswers.creditMax`/`valorDoBemAlvo`. A conversa em que o cliente diz
 * "quero um de 80 mil" e o modelo NUNCA busca ficava sem nenhuma das três
 * chaves, e o painel (Performance · quem chegou) a contava como "valor não
 * informado" e sem bem.
 *
 * A extração é a que já existe e está testada: `parseAssetValue` (FIX-115) lê
 * "80 mil", "R$ 80.000", "1,5 milhão" e recusa o que ambiguaria — número nu
 * fora do gate ("CG 160"), orçamento mensal ("850 por mês") e CPF. Lance não é
 * preço do bem e `parseAssetValue` não conhece a distinção: o número que a fala
 * liga ao LANCE sai da frase antes do parser, e o resto continua valendo (P212)
 * — o lance tem produtor próprio (`lanceEPrazoDoTurno`, abaixo).
 *
 * Categoria: só quando o recado nomeia UMA. "carro ou moto" é comparação, não
 * declaração, e escolher uma das duas por conta própria envenenaria o filtro do
 * painel e o estágio do lead. Com DUAS ou mais nomeadas, vale a TROCA: negada
 * uma, a outra é a declarada (`categoriaDaTroca`). */
export function declaracaoDoTurno(texto: string | null | undefined): {
	categoria?: Category;
	valorDoBem?: number;
} {
	if (!texto) return {};
	const nomeadas = PALAVRAS_DE_CATEGORIA.filter((p) => (texto.match(p.re) ?? []).length > 0);
	const categoria =
		nomeadas.length === 1
			? nomeadas[0]?.categoria
			: nomeadas.length > 1
				? categoriaDaTroca(texto)
				: undefined;
	// O DINHEIRO DO LANCE SAI DA ORAÇÃO, O RESTO FICA (P212): "quero um carro de 80
	// mil, sem entrada" declara o bem de 80 mil — a palavra "entrada" não apaga a
	// frase inteira. Só o número PAR que o cliente ligou ao lance é mascarado; o
	// resto da fala — inclusive as perguntas — vai INTEIRO ao mesmo
	// `parseAssetValue` de sempre, que é o que a `main` faz com o texto original.
	const valorDoBem = parseAssetValue(semODinheiroDoLance(texto)) ?? undefined;
	return {
		...(categoria ? { categoria } : {}),
		...(valorDoBem ? { valorDoBem } : {}),
	};
}

/** Um TOKEN de dinheiro: o número com a magnitude que o acompanha ("30 mil",
 * "R$ 20.000", "1,5 milhão", "20k"). O VALOR sai de `parseAssetValue` sobre o
 * token — mesmo parser do valor do bem. A frase inteira não serve: o parser
 * aplica as regras por PRIORIDADE, não por posição, e em "80 mil no lance de 30
 * mil" ele devolveria 80 mil.
 *
 * Conservador de propósito: número nu sem marcador ("tenho 30 pro lance") não
 * tem como ser lido sem o contexto do funil, e segue de fora — como no valor do
 * bem.
 *
 * RODADA 9 (P212): a adjacência dentro do token é só ESPAÇO HORIZONTAL. É a MESMA fonte
 * que entra nos moldes — um molde não pode emendar o "mil" de uma linha com o número de
 * outra, e "80 mil\n" não é mais um dinheiro só.
 *
 * D — o token em fonte, para entrar dentro dos moldes. O VALOR sai de `parseAssetValue`
 * sobre o token, como sempre: em "R$ 20.000" o `.` é milhar e em "1,5 milhão" a `,` é
 * decimal. */
const FONTE_DO_D = "(?:\\br\\$[ \\t]*)?\\d[\\d.,]*(?:[ \\t]*(?:mil(?:h[ãa]o|h[õo]es)?|mi|k)\\b)?";
const TOKEN_DE_DINHEIRO = new RegExp(FONTE_DO_D, "gi");

/** O prazo que o cliente declarou, em MESES (a unidade da qualificação). Precisa
 * de uma PISTA de tempo junto do número ("em 60 meses", "prazo de 120 meses",
 * "daqui a 2 anos", "60x"): "meu filho tem 12 anos" não é prazo desejado.
 *
 * Cadência de PAGAMENTO também não é prazo: em "800 por mês" o número vem antes
 * do "por", e a unidade colada ao número é o que este parser exige (a mesma
 * separação que `parseAssetValue` faz com `MONTHLY_MARKER`). */
const PRAZO_COM_PISTA =
	/(?:\bem|\bdaqui\s+a|\bprazo\s+de|\bdurante|\bpara|\bpor|\bquero|\bprefiro|\bescolho)\s+(\d{1,3})\s*(meses\b|m[êe]s\b|anos?\b)|(\d{1,3})\s*x\b/i;

function semAcento(palavra: string): string {
	return palavra.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** O vão entre o dinheiro e o marcador é só de ligação? Fora da allowlist — ou
 * com mais de quatro palavras — o par não vale.
 *
 * `e`/`ou` NÃO ligam rótulo e valor, ligam FRASES: em "30 mil pro lance e 20 mil
 * de entrada" o primeiro dinheiro pertence a "lance" e o segundo a "entrada" —
 * deixar o conectivo valer fazia um marcador roubar o dinheiro do outro e o
 * dinheiro roubado sobrar para o `parseAssetValue` ler como valor do BEM. A
 * forma ACENTUADA "é" é cópula, não conjunção, e continua valendo ("o lance é 30
 * mil"). */
function somenteLigacoes(vao: string): boolean {
	const palavras = vao.trim().split(/\s+/).filter(Boolean);
	if (palavras.length > 4) return false;
	return palavras.every((p) => {
		const cru = p.replace(/[^\p{L}]/gu, "").toLowerCase();
		if (cru === "é") return true;
		return LIGACOES_DO_LANCE.has(semAcento(cru));
	});
}

/** O verbo de OBRIGAÇÃO/FALTA entre a palavra e o número amarra um ao outro: "a
 * entrada exige 30 mil" fala do valor da entrada, não do preço do bem. Sem isso o
 * número ficava órfão na oração e o `parseAssetValue` o lia como valor do BEM. */
const GOVERNO_DO_LANCE = /\b(exig\w*|precis\w*|falt\w*|obrigat\w*)\b/i;

/** Um TRECHO da fala: onde começa e onde termina. Os dois trechos que este arquivo usa são a
 * ORAÇÃO (o par dinheiro↔marcador da máscara) e a FRASE (o molde) — ver `trechosDe`. */
type TrechoDoTurno = { inicio: number; fim: number };

/** O que separa ORAÇÕES — a unidade do PAR dinheiro↔marcador. A vírgula entra
 * aqui de propósito: "quero um carro de 80 mil, lance de 30 mil" tem dois
 * dinheiros de frases de valor diferentes, e deixar o par atravessar a vírgula
 * fazia o 80 mil (o preço do BEM) virar o dinheiro do LANCE — o lado perigoso.
 *
 * O `:` NÃO separa: em português de chat ele liga RÓTULO a VALOR ("meu lance:
 * R$ 30.000", "carro: 80 mil"). Cortar ali deixava o dinheiro órfão do rótulo e
 * o `parseAssetValue` o lia como valor do BEM (P212). */
const SEPARADORES_DE_ORACAO = ",.;!?\n";

/** O que separa FRASES — a unidade dos MOLDES (rodada 9, P212). A vírgula NÃO entra aqui:
 * o molde aceita vírgula dentro da frase ("meu lance: 30mil, entrada: 10mil" continua uma
 * frase só), mas não pode emendar o que está em frases separadas por ponto, interrogação,
 * ponto e vírgula ou QUEBRA DE LINHA — "Quero um carro de 80 mil\nDe lance, não tenho nada."
 * é duas frases, e o 80 mil é o preço do BEM. */
const SEPARADORES_DE_FRASE = ".!?;\n";

/** Quebra a fala em trechos com a PONTUAÇÃO ORIGINAL preservada: cada trecho é
 * uma fatia do próprio texto, e o separador não pertence a nenhum deles. Nada é
 * juntado, nada é reescrito — é o que impede que duas afirmações separadas virem
 * uma associação monetária que o cliente não fez (P212).
 *
 * A pontuação só separa quando NÃO está dentro de um número: em "R$ 20.000" o
 * ponto é separador de milhar, e em "1,5 milhão" a vírgula é decimal — cortar
 * ali partiria o dinheiro no meio. */
function trechosDe(texto: string, separadores: string): TrechoDoTurno[] {
	const trechos: TrechoDoTurno[] = [];
	let inicio = 0;
	for (let i = 0; i < texto.length; i++) {
		const caractere = texto[i] ?? "";
		if (!separadores.includes(caractere)) continue;
		const anterior = texto[i - 1] ?? "";
		const seguinte = texto[i + 1] ?? "";
		// Separador DENTRO de um número (milhar/decimal) não fecha trecho.
		if (/\d/.test(anterior) && /\d/.test(seguinte)) continue;
		trechos.push({ inicio, fim: i });
		inicio = i + 1;
	}
	trechos.push({ inicio, fim: texto.length });
	return trechos;
}

function oracoesDe(texto: string): TrechoDoTurno[] {
	return trechosDe(texto, SEPARADORES_DE_ORACAO);
}

/** As FRASES onde os moldes valem (rodada 9, P212): cada uma é uma fatia do próprio texto,
 * com a pontuação preservada, e o molde não atravessa a fronteira entre elas. */
function frasesDe(texto: string): TrechoDoTurno[] {
	return trechosDe(texto, SEPARADORES_DE_FRASE);
}

/** O dinheiro que a fala liga ao LANCE, com a posição: o token de dentro da oração que
 * nomeia `lance`/`entrada`, o mais colado ao marcador.
 *
 * É o caminho da MÁSCARA DO BEM: o número ligado à palavra não é o preço do bem, e
 * `semODinheiroDoLance` o tira da fala antes do `parseAssetValue` (P212). Não é caminho
 * de captura de LANCE — na onda 17 a captura é só `MOLDES_DO_LANCE`. */
type DinheiroDoLance = {
	valor: number;
	inicio: number;
	fim: number;
	oracao: TrechoDoTurno;
	/** O número está LIGADO ao marcador? Vão só de ligação (`de`, `pro`, `:`,
	 * `não é`) ou verbo de obrigação/falta no meio ("a entrada exige 30 mil")
	 * dizem que o dinheiro é do lance mesmo quando o cliente não afirmou tê-lo.
	 * Vão largo ("80 mil sem entrada", "quanto de entrada pra um carro de 80
	 * mil") é o preço do BEM falado perto da palavra, e não se mascara. */
	ligadoAoMarcador: boolean;
};

function dinheirosDoLance(texto: string): DinheiroDoLance[] {
	const oracoes = oracoesDe(texto);
	const tokens = [...texto.matchAll(TOKEN_DE_DINHEIRO)].map((token) => ({
		inicio: token.index ?? 0,
		fim: (token.index ?? 0) + token[0].length,
		valor: parseAssetValue(token[0]),
	}));
	// Um par por MARCADOR, não um por oração: "lance de 30 mil e entrada de 10
	// mil" tem dois dinheiros de lance, e o segundo não pode sobrar para o
	// `parseAssetValue` ler como valor do bem (P212).
	const dinheiros: DinheiroDoLance[] = [];
	const jaAproveitados = new Set<number>();
	for (const marcador of texto.matchAll(MARCADORES_DE_LANCE)) {
		const inicioDoMarcador = marcador.index ?? 0;
		const fimDoMarcador = inicioDoMarcador + marcador[0].length;
		const oracao = oracoes.find((o) => inicioDoMarcador >= o.inicio && fimDoMarcador <= o.fim);
		if (!oracao) continue;
		let melhor: {
			token: (typeof tokens)[number];
			valor: number;
			distancia: number;
			ligadoAoMarcador: boolean;
		} | null = null;
		for (const token of tokens) {
			if (token.valor === null) continue;
			// Cada dinheiro pertence a UM marcador: "lance de 30 mil e entrada de 10
			// mil" tem dois pares, e o segundo marcador fica com o dinheiro que sobrou.
			if (jaAproveitados.has(token.inicio)) continue;
			// O par vive na MESMA oração: "quero um de 80 mil, qual o lance?" não liga
			// o preço do bem à pergunta sobre o lance.
			if (token.inicio < oracao.inicio || token.fim > oracao.fim) continue;
			const vao =
				token.fim <= inicioDoMarcador
					? texto.slice(token.fim, inicioDoMarcador)
					: token.inicio >= fimDoMarcador
						? texto.slice(fimDoMarcador, token.inicio)
						: null;
			if (vao === null) continue;
			// Entre os candidatos da oração vale o MAIS COLADO ao marcador — é ele que o
			// cliente ligou à palavra, e é isso que mantém "carro de 80 mil com lance de
			// 30 mil" com o bem nos dois lados.
			const distancia = vao.trim().length;
			if (melhor && distancia >= melhor.distancia) continue;
			melhor = {
				token,
				valor: token.valor,
				distancia,
				// Os dois moldes literais da máscara (onda 17) são os casos estreitos deste
				// vão: `D <gancho> <palavra>` e `<palavra> <cópula> D`. O vão largo só vale
				// com conectivo desta tabela ou verbo de obrigação/falta — é o que preserva o
				// preço do bem em "quanto de entrada pra um carro de 80 mil?" e o que não
				// deixa "a entrada exige 30 mil" virar valor do bem.
				ligadoAoMarcador: somenteLigacoes(vao) || GOVERNO_DO_LANCE.test(vao),
			};
		}
		if (!melhor) continue;
		jaAproveitados.add(melhor.token.inicio);
		dinheiros.push({
			valor: melhor.valor,
			inicio: melhor.token.inicio,
			fim: melhor.token.fim,
			oracao,
			ligadoAoMarcador: melhor.ligadoAoMarcador,
		});
	}
	// Na ordem da FALA: o primeiro dinheiro citado é o que o cliente declarou.
	return dinheiros.sort((a, b) => a.inicio - b.inicio);
}

// ── LANCE: OS MOLDES EXATOS, COM ADJACÊNCIA FIXA (P139, rodada 7) ──────────────
//
// O lado perigoso é gravar como LANCE um dinheiro que o cliente NÃO afirmou ter: os três
// cenários de `cards-livres.ts` passam a usar recurso dele que não existe, e a proposta
// sai com um valor que ele não tem. Uma lista de BLOQUEIO não fecha — a cada rodada o
// auditor achou uma forma nova. A onda 16 inverteu para a forma POSITIVA estreita e
// alargou a permissão; na onda 17 os moldes vêm escritos pelo chefe e são implementados
// LITERALMENTE, com adjacência fixa: verbo colado no dinheiro, dinheiro colado em "de
// lance". A busca de verbo de posse na frase inteira foi apagada — nada fora dos moldes
// grava lance, e o que não fecha molde cai no lado seguro (o modelo pergunta de novo e o
// fato continua pendente). `entrada` NÃO é molde de lance: quem diz "dou 20 mil de
// entrada" nomeia o dinheiro da entrada, não uma reserva sua.
//
// A TRAVA da onda 16 continua com as mesmas formas e continua valendo na MENSAGEM inteira:
// negação, pergunta, obrigação/falta ou hipótese em QUALQUER ponto derrubam o lance,
// inclusive um molde que fecha em outra frase — "não tenho 30 mil de lance. Meu lance é de
// 10 mil" fica pendente.
//
// RODADA 9: duas coisas mudaram aqui. (1) A adjacência entre tokens dos moldes é só horizontal
// (`[ \t]`) e o molde roda FRASE A FRASE — ele não atravessa quebra de linha (P212). (2) As duas
// travas que falam do DINHEIRO DO CLIENTE (negação e embutido) não só derrubam a captura: sobre
// uma reserva já gravada, elas ZERAM o que o cliente corrigiu ou retirou (P139).

/** O ÚNICO qualificador aceito entre o dinheiro e o gancho na MÁSCARA (roda 8, P212): uma palavra
 * de uma lista FECHADA, nunca gordura qualquer. Sem ela, "tenho 30 mil guardados pro lance"
 * perdia o vínculo com a palavra `lance` e o dinheiro do lance virava preço do BEM. O verbo dos
 * moldes de captura não entra aqui. */
const QUALIFICADOR_DA_MASCARA =
	"guardad[oa]s?|reservad[oa]s?|separad[oa]s?|dispon[ií]ve(?:l|is)|em[ \\t]+m[ãa]os|na[ \\t]+m[ãa]o";

/** As formas fixas dos moldes, na ordem em que o chefe as escreveu, com adjacência só de
 * espaço horizontal (rodada 9, P212). */
const MOLDE_VERBO =
	"tenho|juntei|guardei|disponho[ \\t]de|consigo[ \\t]dar|posso[ \\t]dar|vou[ \\t]dar|dou";
const MOLDE_VERBO_SEM_FOLGA = "tenho|consigo[ \\t]dar|posso[ \\t]dar|dou";
const MOLDE_FOLGA = "uns[ \\t]+|cerca[ \\t]de[ \\t]+|até[ \\t]+";
const MOLDE_GANCHO = "de|para[ \\t]o|pro|pra|como";
const MOLDE_COPULA = "é|e|seria|fica";

/** Os três moldes do LANCE. O último grupo de cada um é o dinheiro. O molde 3 é o do chefe
 * corrigido: `[:=\-]` aceita o traço ("meu lance - 30 mil") e o `[ \t]*` aceita o sinal colado
 * em "lance" ("Meu lance: R$ 30.000").
 *
 * RODADA 9 (P212): toda adjacência entre tokens é `[ \t]` e o molde é aplicado FRASE A FRASE
 * (ver `dinheirosPelosMoldes`) — ele não atravessa quebra de linha nem fim de frase. */
const MOLDES_DO_LANCE: readonly RegExp[] = [
	new RegExp(
		`\\b(?:${MOLDE_VERBO})[ \\t]+(?:${MOLDE_FOLGA})?(${FONTE_DO_D})[ \\t]+(?:${MOLDE_GANCHO})[ \\t]+lance\\b`,
		"gi",
	),
	new RegExp(
		`\\b(?:${MOLDE_GANCHO})[ \\t]+lance[ \\t]+(?:eu[ \\t]+)?(?:${MOLDE_VERBO_SEM_FOLGA})[ \\t]+(?:${MOLDE_FOLGA})?(${FONTE_DO_D})`,
		"gi",
	),
	new RegExp(
		`\\bmeu lance[ \\t]*(?:(?:${MOLDE_COPULA})[ \\t]*)?(?:de[ \\t]+)?[:=\\-]?[ \\t]*(${FONTE_DO_D})`,
		"gi",
	),
];

/** Os moldes da MÁSCARA DO BEM: o bem continua sendo `parseAssetValue` sobre o texto
 * ORIGINAL com essa máscara (P212), como na `main`
 * (`a2bc3024:src/lib/agent/orchestrator/analyze.ts:230`). O `ágio` da onda 15 sai da
 * máscara: os moldes do chefe falam de `lance` e `entrada`. Mascarar é diferente de gravar
 * lance: a captura é só `MOLDES_DO_LANCE`.
 *
 * RODADA 8 (P212): são DOIS moldes e ambos exigem a palavra `lance`/`entrada`. O verbo dos moldes
 * de captura não reaproveita aqui — em "Tenho 80 mil de orçamento para um carro" nada nomeia
 * lance, e o número continua sendo o preço do bem. */
const MOLDES_DA_MASCARA_DO_BEM: readonly RegExp[] = [
	new RegExp(
		`(${FONTE_DO_D})[ \\t]+(?:(?:${QUALIFICADOR_DA_MASCARA})[ \\t]+)?(?:${MOLDE_GANCHO})[ \\t]+(?:lance|entrada)\\b`,
		"gi",
	),
	new RegExp(`\\b(?:lance|entrada)[ \\t]*(?:de|:|=|${MOLDE_COPULA})[ \\t]*(${FONTE_DO_D})`, "gi"),
];

const TRAVA_DA_NEGACAO = /\b(n[ãa]o|nem|nunca|jamais|sem|zero|nada)\b/i;
const TRAVA_DO_EMBUTIDO = /\bembutid\w*/i;

/** As três formas que NÃO são dinheiro do cliente: PERGUNTA, HIPÓTESE e OBRIGAÇÃO/FALTA. Elas
 * derrubam a CAPTURA (P139) e, desde a rodada 10, também a decisão de ZERAR a reserva — o número
 * pode estar ao lado da palavra "lance" sem que o cliente tenha dito que TEM o dinheiro.
 *
 * Na mensagem inteira, e não na frase, de propósito: é o lado reversível. "Ainda faltam 30
 * mil para o lance" fica pendente em vez de virar recurso próprio. `como` NÃO entra na
 * lista de interrogativas porque é ligação de valor ("tenho 30 mil como entrada"); pergunta
 * com "como" vem com `?`, que já trava.
 *
 * RODADA 10 (P139): `seria` e `e se` entram na hipótese. "Se eu não tivesse lance, quanto ficaria
 * a parcela?" tinha `não` + `lance` e zerava a reserva confirmada: é uma hipótese sobre um cenário,
 * não uma retratação do que ele já declarou. */
const TRAVA_DA_PERGUNTA =
	/\?|\b(quanto|quantos|quantas|qual|quais|quando|onde|quem|cad[êe]|ser[áa])\b/i;
const TRAVA_DA_HIPOTESE = /\b(se\s+eu|caso|tivesse|teria|seria|e\s+se)\b/i;
const TRAVA_DA_OBRIGACAO =
	/\b(tenho\s+que|tem\s+que|teria\s+que|precis\w*|falt\w*|exig\w*|obrigat\w*)\b/i;

/** As três travas juntas, para decidir sobre a MENSAGEM inteira. */
const TRAVA_DA_CLAREZA = new RegExp(
	`(?:${TRAVA_DA_PERGUNTA.source})|(?:${TRAVA_DA_HIPOTESE.source})|(?:${TRAVA_DA_OBRIGACAO.source})`,
	"i",
);

/** A trava geral da MENSAGEM: com qualquer uma destas formas em QUALQUER lugar da fala, nada nela
 * vira lance. São as três travas acima mais a NEGAÇÃO e o EMBUTIDO.
 *
 * RODADA 8 (P139): `embutido` entra na trava. Quem diz "meu lance é 30 mil, tudo embutido" está
 * nomeando o dinheiro da CARTA, não uma reserva dele — `cenarios.ts` transformaria o campo em
 * `ownCashAvailable` e a proposta sairia com dinheiro que o cliente não tem. */
const TRAVA_DA_MENSAGEM = new RegExp(
	`(?:${TRAVA_DA_CLAREZA.source})|(?:${TRAVA_DA_NEGACAO.source})|(?:${TRAVA_DO_EMBUTIDO.source})`,
	"i",
);

/** As DUAS travas que ZERAM a reserva (rodada 9, P139): NEGAÇÃO e EMBUTIDO. A negação e o
 * embutido falam do DINHEIRO DO CLIENTE, e por isso sobrescrevem o que ele já tinha declarado.
 *
 * Elas só valem sobre uma mensagem que nomeia `lance`/`entrada`, só zeram quando JÁ EXISTE reserva
 * persistida, e — rodada 10 (P139) — só quando a fala é uma DECLARAÇÃO: com pergunta, hipótese ou
 * obrigação, a retratação não aconteceu e a reserva fica como está. Sem reserva anterior não há o
 * que sobrescrever, e a fala isolada continua sem gravar lance. É como a tabela de P139 a lê —
 * "quero um carro de 80 mil, sem entrada" é o preço do BEM perto da palavra, não uma retirada. */
function negouOuEmbutiuOLance(texto: string | null | undefined): boolean {
	if (!texto) return false;
	if ((texto.match(MARCADORES_DE_LANCE) ?? []).length === 0) return false;
	// RODADA 10 (P139): as MESMAS travas que já impedem a captura impedem o ZERO. Pergunta,
	// hipótese e obrigação/falta não mexem na reserva; só a declaração afirmativa retrata.
	if (TRAVA_DA_CLAREZA.test(texto)) return false;
	return TRAVA_DA_NEGACAO.test(texto) || TRAVA_DO_EMBUTIDO.test(texto);
}

/** O dinheiro que um molde casou: valor e posição na fala. */
type DinheiroDoMolde = { valor: number; inicio: number; fim: number };

/** Os dinheiros que os moldes casam, na ordem da fala. Na captura de LANCE o próprio molde
 * é a permissão: não há tabela de ligação nem verbo de posse na frase inteira.
 *
 * RODADA 9 (P212): o molde roda FRASE A FRASE, não na mensagem inteira. É o que impede a
 * máscara de atravessar a quebra de linha e apagar o preço do BEM: em "Quero um carro de 80
 * mil\nDe lance, não tenho nada." o 80 mil está numa frase e o marcador em outra, e o bem
 * continua nos números da qualificação. As posições continuam sendo as do TEXTO ORIGINAL,
 * porque é sobre ele que `semODinheiroDoLance` corta. */
function dinheirosPelosMoldes(texto: string, moldes: readonly RegExp[]): DinheiroDoMolde[] {
	const dinheiros: DinheiroDoMolde[] = [];
	for (const frase of frasesDe(texto)) {
		const fatia = texto.slice(frase.inicio, frase.fim);
		for (const molde of moldes) {
			for (const achado of fatia.matchAll(molde)) {
				const dinheiro = achado[achado.length - 1] ?? "";
				const valor = parseAssetValue(dinheiro);
				if (valor === null) continue;
				const inicio = frase.inicio + (achado.index ?? 0) + achado[0].indexOf(dinheiro);
				dinheiros.push({ valor, inicio, fim: inicio + dinheiro.length });
			}
		}
	}
	// Na ordem da FALA: o primeiro dinheiro citado é o que o cliente declarou.
	return dinheiros.sort((a, b) => a.inicio - b.inicio);
}

/** A fala SEM o dinheiro que pertence ao lance — é sobre ela que o `parseAssetValue` decide
 * o valor do BEM (P212), como na `main`, que lê o texto ORIGINAL.
 *
 * A ÚNICA alteração é mascarar, no lugar: a frase, a pergunta e o preço do bem ficam como
 * o cliente escreveu. Assim "quero um carro de 80 mil, quanto de lance?" declara 80 mil,
 * "quero um carro de 80 mil, sem entrada" também, e "quero um de 80 mil e dou 20 mil de
 * entrada" separa os dois números: bem 80 mil, lance nada — o dinheiro da entrada é
 * mascarado do bem, mas não é reserva do cliente. */
function semODinheiroDoLance(texto: string): string {
	const dinheiros = [
		...dinheirosPelosMoldes(texto, MOLDES_DA_MASCARA_DO_BEM),
		...dinheirosDoLance(texto).filter((dinheiro) => dinheiro.ligadoAoMarcador),
	];
	if (dinheiros.length === 0) return texto;
	// RODADA 8 (P212): o MESMO intervalo pode ser casado pelos moldes e pelo associador. Sem
	// deduplicar, a segunda remoção aplicava a posição original sobre o texto já encurtado e
	// apagava o número seguinte ("Meu lance: R$ 30.000; 80 mil para o carro").
	const vistos = new Set<string>();
	const unicos = dinheiros.filter((dinheiro) => {
		const chave = `${dinheiro.inicio}:${dinheiro.fim}`;
		if (vistos.has(chave)) return false;
		vistos.add(chave);
		return true;
	});
	let limpo = texto;
	for (const dinheiro of [...unicos].sort((a, b) => b.inicio - a.inicio)) {
		limpo = `${limpo.slice(0, dinheiro.inicio)} ${limpo.slice(dinheiro.fim)}`;
	}
	return limpo;
}

/** O valor de LANCE que um molde casou, ou `undefined` — o primeiro da fala. Só com o molde
 * fechado e sem TRAVA na MENSAGEM inteira (P139). */
function lanceDaFala(texto: string): number | undefined {
	if (TRAVA_DA_MENSAGEM.test(texto)) return undefined;
	for (const dinheiro of dinheirosPelosMoldes(texto, MOLDES_DO_LANCE)) return dinheiro.valor;
	return undefined;
}

function prazoDaFala(texto: string): number | undefined {
	const m = texto.match(PRAZO_COM_PISTA);
	if (!m) return undefined;
	const numero = Number.parseInt(m[1] ?? m[3] ?? "", 10);
	if (!Number.isFinite(numero) || numero <= 0) return undefined;
	const unidade = semAcento((m[2] ?? "x").toLowerCase());
	const meses = unidade.startsWith("ano") ? numero * 12 : numero;
	// Fora da faixa de consórcio é conversa, não prazo desejado.
	return meses >= 1 && meses <= 480 ? meses : undefined;
}

/** O DINHEIRO DO LANCE e o PRAZO DESEJADO que o cliente disse na fala (P139).
 *
 * Na `main` esses dois fatos vinham dos cards `lance-value` e `prazo`
 * (`interactive-handlers.ts`): o cliente respondia e a chave entrava em
 * `qualifyAnswers`. No vendedor livre não há card de qualificação — quem conta é
 * a conversa —, e sem eles `cards-livres.ts` calculava os três cenários como se
 * o lance embutido cobrisse TODO o lance, e o `contemplation_dial` caía no mês 6.
 *
 * O que se grava é só o que o cliente DECLAROU: nenhum número deduzido do bem,
 * da parcela ou da carta. O valor do bem continua sendo do `declaracaoDoTurno`. */
export function lanceEPrazoDoTurno(texto: string | null | undefined): {
	lanceValue?: number;
	prazoMeses?: number;
} {
	if (!texto) return {};
	// CPF NÃO É DINHEIRO — mesma limpeza do `parseAssetValue`: no padrão brasileiro
	// "529.982.247-25" passa pelo formato de milhar e viraria lance de milhões.
	const limpo = texto.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, " ");
	const lanceValue = lanceDaFala(limpo);
	const prazoMeses = prazoDaFala(limpo);
	return {
		...(lanceValue !== undefined ? { lanceValue } : {}),
		...(prazoMeses !== undefined ? { prazoMeses } : {}),
	};
}

/** Um beat do turno, já com o preço do modelo resolvido. `cacheRead`/`cacheWrite`
 * são o recorte de CACHE do prompt.
 *
 * AUSENTE é "não medido" — o provedor não reportou essa parcela; ZERO é medição
 * (o provedor reportou que nenhum token veio do cache). São coisas diferentes e
 * a coluna de `uso_de_ia` as guarda assim (`null` × `0`): quem lê o custo não
 * pode precificar integralmente um turno cujo cache ninguém mediu (P273). */
export type UsoDoBeat = {
	modelo: string;
	tokensInput: number;
	tokensOutput: number;
	cacheRead?: number;
	cacheWrite?: number;
};

/** O custo do TURNO — a soma EXATA dos beats, arredondada UMA vez (N09/P217).
 *
 * `uso_de_ia.custo_usd_cents` é inteiro em centavos, e o turno arredondava ANTES
 * de gravar cada beat: com o modelo default do vendedor (`qwen3.6-flash`, US$
 * 0,05 por milhão de entrada) um beat de 80 mil tokens custa 0,4 centavo, e três
 * beats desses somam 1,2 centavo — gravado como `0 + 0 + 0`. A fração sobrevive
 * até a borda de gravação, que é o único lugar onde `Math.round` roda.
 *
 * Preço desconhecido continua sendo `null`, nunca zero: um beat sem preço no
 * meio do turno torna o total do turno desconhecido (somar só o que se sabe
 * seria um número inventado, com cara de medição).
 *
 * O CACHE segue a mesma disciplina (P273): a soma só existe se ALGUM beat mediu
 * aquela parcela. Nenhum beat medindo dá `null` (não medido), e não `0` — zero
 * é medição de que nada veio do cache. */
export function somarUsoDosBeats(beats: readonly UsoDoBeat[]): {
	tokensInput: number;
	tokensOutput: number;
	cacheRead: number | null;
	cacheWrite: number | null;
	custoUsdCents: number | null;
} {
	let tokensInput = 0;
	let tokensOutput = 0;
	let cacheRead: number | null = null;
	let cacheWrite: number | null = null;
	let centavosExatos = 0;
	let semPreco = false;
	for (const beat of beats) {
		tokensInput += beat.tokensInput;
		tokensOutput += beat.tokensOutput;
		if (beat.cacheRead !== undefined) cacheRead = (cacheRead ?? 0) + beat.cacheRead;
		if (beat.cacheWrite !== undefined) cacheWrite = (cacheWrite ?? 0) + beat.cacheWrite;
		const centavos = custoDoTurnoCentsExatos(beat);
		if (centavos === null) semPreco = true;
		else centavosExatos += centavos;
	}
	return {
		tokensInput,
		tokensOutput,
		cacheRead,
		cacheWrite,
		custoUsdCents: semPreco ? null : Math.round(centavosExatos),
	};
}

/** O que a EMISSÃO de um card prova sobre o estado do turno — aplicado na meta
 * (L02/P259). Hoje só uma coisa: `contract_form` na tela autoriza o
 * `contract-submit` a criar proposta real.
 *
 * Só o DIFF entra, e só na direção `true`: `metaDoTurnoSemApagar` grava por cima
 * da meta FRESCA do banco apenas o que o turno mudou, então devolver o estado
 * intacto quando não há marca é o que preserva o que `storeIdentity` escreveu no
 * meio do turno.
 */
export function aplicarMetaDaEmissao(
	estado: EstadoDoTurno,
	metaDaEmissao: MetaDaEmissao | undefined,
): EstadoDoTurno {
	if (!metaDaEmissao?.contractFormDispatched) return estado;
	if (estado.funnel.contractFormDispatched === true) return estado;
	return { ...estado, funnel: { ...estado.funnel, contractFormDispatched: true } };
}

export function createRunTurnLivre(deps?: {
	provider?: { id: string; baseUrl: string; apiKey: string; model: string };
	/** Fronteira da busca — roteiro nos testes, Bevi real em produção. */
	busca?: DepsDasToolsLivres["buscarGrupos"];
	/** Os cards já mostrados na conversa — teste injeta, produção lê do banco. */
	lerCartas?: (conversationId: string) => Promise<ArtefatoDaConversa[]>;
}): (input: TurnInput) => AsyncGenerator<TurnEvent> {
	return async function* runTurnLivreImpl(input: TurnInput): AsyncGenerator<TurnEvent> {
		const { conversationId, channel, userText, isUserTurn, contactName } = input;
		if (!conversationId) throw new Error("[pi-livre] conversationId is required");

		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, conversationId),
		});
		const baseMeta = metaOf(conv);
		const historico = (await loadConversationHistory(conversationId)).map((m) => ({
			role: m.role,
			content: m.content,
		}));

		// 1. IDENTIDADE — capturada aqui, antes do modelo ver qualquer coisa, e antes
		// de qualquer log: o texto que chega bruto tem CPF e celular, e o rastro de
		// entrada já escreveu isso no log do servidor (N07).
		//
		// O CONTEXTO vem do histórico: se o último balão do agente pediu o CPF, o
		// número com cara de celular que chega agora é resposta a esse pedido e vale
		// como CPF — mesma regra do capturador do WhatsApp. Sem o pedido, é telefone.
		const identidadeAtual = await loadIdentity(conversationId).catch(() => null);
		const captura = capturarIdentidadeDoTexto(userText ?? "", identidadeAtual, {
			pedidoDeCpf: pedidoDeCpfNoUltimoBalao(historico.at(-1)),
		});
		if (captura.identidade && (captura.recebeuCpf || captura.recebeuCelular)) {
			await storeIdentity(conversationId, captura.identidade).catch((erro: unknown) => {
				console.error("[pi-livre] identidade não gravada (ignorado):", erro);
			});
		}
		// O CONTATO VIROU LEAD NA HORA EM QUE ELE DEU O NÚMERO (P6 — o contato é o ativo).
		// Antes, o telefone só chegava a `leads.phone` no fechamento (`garantirLeadDoFecho`,
		// dentro do `fazer_proposta`): quem dava o WhatsApp na web e fechava a tela antes da
		// proposta não deixava contato nenhum para a régua. O dado vem da fala do cliente
		// (qualquer turno, qualquer ordem) e gravar é encanamento — não custa turno de venda.
		if (captura.recebeuCelular && captura.identidade?.celular) {
			await saveContactWhatsapp(conversationId, captura.identidade.celular).catch(
				(erro: unknown) => {
					console.error("[pi-livre] contato do WhatsApp não gravado (ignorado):", erro);
				},
			);
		}

		// Rastro de entrada: sem isto, um turno que "fala mas não busca" não tem
		// como ser diagnosticado do lado do servidor (foi o caso do e2e de 20/10).
		// Sai o texto JÁ mascarado — `textoLimpo`, nunca o do cliente.
		console.log(
			`[pi-livre] entrada conv=${conversationId} canal=${channel} isUserTurn=${isUserTurn} texto="${captura.textoLimpo.slice(0, 60)}"`,
		);

		// O ÍNDICE DE CARTAS DO TURNO nasce do que a conversa já mostrou. Antes ele
		// era vazio fora do turno da busca: o cliente dizia "quero a da Canopus" no
		// turno 4 e `mostrar_card` recusava ("preciso de uma carta já buscada nesta
		// conversa"), obrigando o agente a rebuscar — o cliente via a mesma tabela de
		// novo, e a proposta ficava ancorada numa busca refeita. Medido em 25/10/2026
		// no dev, com navegador real (conversas 4a1af177 e 361be4f5).
		const lerCartas = deps?.lerCartas ?? lerCartasDaConversa;
		const cartasRestauradas = await restaurarCartasDaConversa(await lerCartas(conversationId));

		let estado = estadoInicialDoTurno({
			conversationId,
			channel,
			contactName: contactName ?? conv?.contactName ?? null,
			isUserTurn,
			userText: captura.textoLimpo,
			isResumeGreeting: input.isResumeGreeting,
			baseMeta,
			historico,
		});

		// QUAL TURNO É ESTE — a posição, não o conteúdo (L29/P281).
		//
		// O score `primeira_resposta_com_numero` (e o `turnoDoCliente` do trace) só
		// existe se o turno souber seu ÍNDICE: na `main` isso saía do nó de
		// persistência como evento `turno-do-cliente` + `turnosDoCliente` na meta.
		// Com o Pi os dois produtores sumiram, e o adapter — que lê o evento nos dois
		// canais — ficou sem insumo: o score nunca era emitido, e `turnosDoCliente`
		// nunca era escrito.
		//
		// A semente é o próprio contador gravado; quando ele não existe (conversa
		// anterior ao campo, ou retomada de thread antiga), é o número de falas do
		// CLIENTE no histórico. `historico` é lido ANTES de a fala corrente ser
		// gravada (`persistirTurnoLivre`), então o tamanho dele JÁ É o índice do
		// turno — diferente da `main`, que subtraía 1 porque lá a fala corrente já
		// estava na lista. Só turno de cliente conta: directive e retomada não são
		// fala dele e gastariam o índice 0.
		const turnosPersistidos =
			estado.funnel.turnosDoCliente ?? historico.filter((m) => m.role === "user").length;
		if (isUserTurn) {
			estado = {
				...estado,
				funnel: { ...estado.funnel, turnosDoCliente: turnosPersistidos + 1 },
				events: [...estado.events, { type: "turno-do-cliente", indice: turnosPersistidos }],
			};
		}

		// O QUE O CLIENTE DECLAROU, SEM ESPERAR A BUSCA (L44/P212). Roda antes do beat
		// de propósito: a conversa em que o modelo nunca busca ("quero um de 80 mil"
		// e o cliente para) não teria nenhuma dessas chaves no metadata, e o painel a
		// contaria como "valor não informado". O que a busca gravar depois (passo 4)
		// sobrescreve — ela é a verdade de fato —, mas não o lance nem o prazo: eles
		// só existem na fala (P139).
		if (isUserTurn) {
			const declaracao = declaracaoDoTurno(captura.textoLimpo);
			const dinheiro = lanceEPrazoDoTurno(captura.textoLimpo);
			// O LANCE DO TURNO (P139, rodada 9) tem três casos, e a palavra que separa os dois
			// primeiros é PRESENÇA, não veracidade: "Meu lance: R$ 0" é o valor do cliente e entra
			// como zero, como `qualify-state.ts:225` da `main` preserva.
			//   1) capturou um valor (inclusive zero) → escreve e sobrescreve o anterior;
			//   2) negou ou embutiu o lance e JÁ HÁ reserva persistida → zera o anterior;
			//   3) as outras travas (pergunta, obrigação/falta, hipótese), ou fala isolada sem
			//      reserva anterior → não mexe na reserva.
			const reservaAnterior = estado.funnel.qualifyAnswers.lanceValue;
			const lanceDoTurno =
				dinheiro.lanceValue !== undefined
					? dinheiro.lanceValue
					: reservaAnterior !== undefined && negouOuEmbutiuOLance(captura.textoLimpo)
						? 0
						: undefined;
			if (
				declaracao.categoria ||
				declaracao.valorDoBem ||
				lanceDoTurno !== undefined ||
				dinheiro.prazoMeses
			) {
				estado = {
					...estado,
					funnel: {
						...estado.funnel,
						...(declaracao.categoria ? { currentCategory: declaracao.categoria } : {}),
						qualifyAnswers: {
							...estado.funnel.qualifyAnswers,
							...(declaracao.valorDoBem
								? {
										creditMax: declaracao.valorDoBem,
										valorDoBemAlvo: declaracao.valorDoBem,
									}
								: {}),
							// O dinheiro e o prazo que `perfilDeclarado` lê (cenários e dial). A escrita
							// é por PRESENÇA: o zero capturado é o valor do cliente e não pode ser
							// descartado, e o zero da retratação é o que limpa `ownCashAvailable`.
							...(lanceDoTurno !== undefined ? { lanceValue: lanceDoTurno } : {}),
							...(dinheiro.prazoMeses ? { prazoMeses: dinheiro.prazoMeses } : {}),
						},
					},
				};
			}
		}

		// 2. O SYSTEM — conduta (caixa) + skills + linha de fato, num lugar só.
		// O prompt só vê identidade quando existe CPF: celular sem CPF é CONTATO, não
		// identidade — anunciar "CPF: recebido e guardado" sem CPF faria o vendedor
		// parar de pedir o dado que a administradora exige.
		const identidadeDoPrompt = identidadeDeCpf(captura.identidade ?? identidadeAtual);
		const { system } = await montarSystemDoVendedor({
			channel,
			contactName: estado.contactName,
			identidade: identidadeDoPrompt,
		});

		// 3. As tools e o beat.
		const identidadeVisivel = captura.identidade ?? identidadeAtual;
		const ctx: ContextoDasTools = {
			conversationId,
			channel,
			userText: isUserTurn ? captura.textoLimpo : null,
			nomeDoCliente: estado.contactName ?? null,
			// Só MÁSCARA: o número em claro não passa pelos cards nem pelo modelo.
			telefoneMascarado: identidadeVisivel?.celular
				? maskPhoneForDisplay(identidadeVisivel.celular) || null
				: null,
			cpfMascarado: identidadeVisivel?.cpf ? maskCpfForDisplay(identidadeVisivel.cpf) : null,
			// O perfil DECLARADO na qualificação (prazo e lance) é o default do dial
			// (FIX-C5): vem do estado do turno, nunca do que o modelo disse agora.
			perfilDeclarado: {
				prazoMeses: estado.funnel.qualifyAnswers.prazoMeses,
				lanceValue: estado.funnel.qualifyAnswers.lanceValue,
			},
			waId: conv?.waId ?? null,
			cards: [],
			textoDoTurno: "",
			cartasNaTela: cartasRestauradas.cartas,
			gruposRevelados: cartasRestauradas.grupos,
			falasDoFecho: [],
			pediuHumano: false,
			casoAbertoNesteTurno: () => {
				casoAberto = true;
			},
			estadoDepoisDaBusca: null,
		};

		// "O que está na tela" — o modelo precisa dos ids para fechar a proposta.
		//
		// O bloco é CONTEXTO, e contexto mal rotulado vira fala repetida: medido em
		// 27/10/2026 (rodada R6, 147 dos 167 achados do medidor de conteúdo são repetição;
		// o pior caso repete o mesmo parágrafo de carta/parcela em quatro turnos seguidos),
		// o modelo recebia esta lista de novo a cada turno sem saber que ela já tinha sido
		// dita e recitava os mesmos números. O rótulo abaixo diz o que a lista É — fato já
		// apresentado — para o número não virar eco. Não é guarda de fala: nada é cortado.
		const exibidas = await listShownOffersForConversation(conversationId).catch(() => []);
		const naTela = exibidas.length
			? `\n\nCartas que JÁ estão na tela desta conversa (o cliente já viu estes valores; use os ids para fechar a proposta e não recite os números de novo a menos que ele pergunte):\n${exibidas
					.map(
						(o) =>
							`- [na tela: ${o.administradora ?? "administradora"} · carta R$ ${o.creditValue?.toLocaleString("pt-BR") ?? "?"} · id ${o.groupId}]`,
					)
					.join("\n")}`
			: "";

		// A ÚLTIMA FALA DO CLIENTE — a que este turno do agente responde. É o insumo do anti-eco
		// do toque (ordem do dono, 27/10 17:15): a resposta rápida não pode repetir a pergunta que
		// ele acabou de fazer. O texto corrente vem de `captura` (já mascarado); num turno que não
		// é fala dele (directive, retomada) vale a última fala de `user` do histórico.
		const falaDoClienteDoTurno =
			(isUserTurn ? captura.textoLimpo : "") ||
			[...historico].reverse().find((m) => m.role === "user")?.content ||
			undefined;

		// Fila de eventos: o beat empurra o texto AO VIVO, o generator drena.
		const fila: TurnEvent[] = [];
		let acordar: (() => void) | null = null;
		const emitir = (evento: TurnEvent) => {
			fila.push(evento);
			acordar?.();
			acordar = null;
		};

		const trechos = criarSeparadorDeTrechos();
		// A GUARDA DA NARRAÇÃO (R5.1): o balão que só anuncia a ferramenta fica
		// suspenso até o turno dizer se veio card — colado a um card ele cai, sem
		// card ele é a fala da vez. Ver `narracao.ts`.
		const narracaoDoTurno = criarNarracaoDoTurno();
		let pendente = "";
		// O caso aberto NESTE turno define o balão: uma linha, sem promessa.
		let casoAberto = false;
		// Uma linha por turno: se a linha da casa já saiu, o segundo trecho de prosa de handoff
		// não vira segunda mensagem.
		let linhaDeHandoffEmitida = false;
		// O texto do ÚLTIMO balão do turno, como o modelo escreveu: é dele que sai o
		// ÚNICO card de toque, no fim do turno (`chipDoUltimoBalao`).
		let ultimoBalaoDoTurno: string | null = null;
		// CPF mascarado JÁ na saída (o número digitado não volta por eco do modelo)
		// e uma pergunta por trecho de fala — tudo em `montarTrechoDeSaida`, testável sem banco.
		/** Os balões prontos no canal: cada um com a sua fronteira + delta. */
		const emitirFala = (texto: string) => {
			// CONVERSA PICADA (ordem do dono, 27/10/2026): o texto do beat chega inteiro e pode ter
			// quatro, cinco frases — no canal isso era UM bloco de 7 a 9 linhas (prints 07/08).
			// `picarEmBaloes` devolve o MESMO texto em até 3 bolhas curtas, e cada uma sai com a
			// fronteira dela: na web fecha o balão, no WhatsApp vira mensagem nova, no banco uma
			// linha por balão.
			for (const [indice, balao] of picarEmBaloes(texto).entries()) {
				if (indice > 0) trechos.aoNovoBalao();
				for (const ev of trechos.aoDelta(balao)) {
					estado = { ...estado, events: [...estado.events, ev] };
					emitir(ev);
				}
			}
		};
		const soltarTrecho = () => {
			if (!pendente) return;
			const ehHandoff = casoAberto || RE_DE_PROMESSA.test(pendente);
			if (ehHandoff && linhaDeHandoffEmitida) {
				pendente = "";
				return;
			}
			const saida = montarTrechoDeSaida({
				texto: pendente,
				cardsDoTurno: ctx.cards,
				// Fato do turno para a resposta rápida (ordem do dono, 27/10): com carta na tela a
				// pergunta aberta ("qual dessas fica melhor?") ganha as opções da oferta.
				temCartaNaTela: ctx.cartasNaTela.length > 0,
				canal: ctx.channel,
				// O toque é a resposta ao que ESTE turno disse (ordem das 17:15): a fala do cliente
				// entra como filtro anti-eco e a categoria do bem decide se a pergunta de valor sai
				// no slider (`value_picker`).
				...(falaDoClienteDoTurno ? { falaDoCliente: falaDoClienteDoTurno } : {}),
				...(estado.funnel.currentCategory ? { categoriaDoBem: estado.funnel.currentCategory } : {}),
				handoff:
					casoAberto || RE_DE_PROMESSA.test(pendente)
						? {
								// O FATO, não a suposição: `pediuHumano` é setado pela tool e só quando o
								// cliente pediu uma pessoa (`tools-livres.ts`, gate da mesa). O `true`
								// fixo dizia "abri o caso" até para quem nunca pediu.
								nome: ctx.nomeDoCliente,
								clientePediu: ctx.pediuHumano,
								casoAberto,
							}
						: undefined,
			});
			if (ehHandoff) linhaDeHandoffEmitida = true;
			// O ÚLTIMO balão do turno é a pergunta que o toque responde. A linha de
			// handoff fica FORA: ela fecha a conversa com o especialista e não ganha
			// próximo passo (era assim antes, quando o chip nascia por trecho).
			if (!ehHandoff) ultimoBalaoDoTurno = pendente;
			pendente = "";
			// O anúncio da ferramenta não vira balão quando o card fala por si: o
			// que estava suspenso sai antes deste balão, e este fica suspenso
			// (R5.1).
			for (const texto of narracaoDoTurno.aoTexto(saida.texto)) emitirFala(texto);
		};
		// O mesmo `toolCallId` duas vezes não vira dois eventos de tool.
		const chamadasEmitidas = new Set<string>();
		// O mesmo card não sai duas vezes: payload idêntico é a mesma carta na tela
		// (L41/P301) — repetir a busca não pode empilhar a tabela. O conjunto vale
		// para o turno inteiro porque o card pode sair no MEIO dele.
		const cardsJaEmitidos = new Set<string>();
		// As falas do fecho já entregues ao canal (a tool as empilha no resultado).
		let falasEmitidas = 0;

		// As falas do fecho são o aviso de divergência que a tool de proposta gera
		// (valor da administradora diferente do que foi falado). Saem AO VIVO, ANTES
		// do card que a mesma tool produziu — antes iam só para a persistência, e o
		// cliente só descobria a diferença recarregando a página.
		const emitirFalasNovas = () => {
			const novas = ctx.falasDoFecho.slice(falasEmitidas);
			falasEmitidas = ctx.falasDoFecho.length;
			for (const ev of eventosDasFalasDoFecho(novas)) {
				estado = { ...estado, events: [...estado.events, ev] };
				emitir(ev);
			}
		};

		// O CARD SAI NO RESULTADO DA FERRAMENTA, NA ORDEM DO STREAM (P157).
		//
		// Na `main` o card nascia no handler do resultado (`converse.ts:1693`:
		// `text-boundary` + `artifact` escritos ali), então a fala que vinha DEPOIS da
		// ferramenta chegava depois do card. Aqui ele era acrescentado só no fim do
		// beat, quando todas as falas já tinham ido ao ar — o cliente lia
		// texto → texto → card, e a tabela caía embaixo da pergunta que ela deveria
		// responder. Agora sai onde nasceu, uma vez (dedupe por payload).
		//
		// EXCEÇÃO: o card de ESCOLHA (P136). Ele é a RESPOSTA de uma pergunta e sai
		// DEPOIS da fala que a faz, como na `main` (o chip vinha no fim do balão). O
		// modelo pede o card antes de escrever a pergunta (é o que a skill ensina),
		// então emitir na ordem do stream entregava os botões antes do texto que lhes
		// dá sentido — na web a pergunta aparecia embaixo das opções e, no WhatsApp,
		// em mensagem separada e anterior. Por isso `quais`: o resultado da ferramenta
		// leva só os cards FACTUAIS, e os de escolha ficam para o fim do beat.
		const emitirCardsNovos = (quais: "fato" | "todos" = "fato") => {
			// A marca que a emissão PROVA (L02/P259) entra no estado ANTES do artifact:
			// é o que a persistência grava antes de registrar o card.
			estado = aplicarMetaDaEmissao(estado, ctx.metaDaEmissao);
			for (const card of ctx.cards) {
				if (quais === "fato" && TIPOS_DE_ESCOLHA.some((tipo) => tipo === card.type)) continue;
				const chave = `${card.type}:${JSON.stringify(card.payload)}`;
				if (cardsJaEmitidos.has(chave)) continue;
				cardsJaEmitidos.add(chave);
				// O card não GRUDA na fala que o anunciou (R5.1): cada artifact abre um
				// balão novo, como na `main` (`fechaBalao` antes do card). Sem o boundary,
				// "deixa eu te mostrar…" e o card chegavam no MESMO balão.
				const fronteira: TurnEvent = { type: "text-boundary" };
				const artifact: TurnEvent = {
					type: "artifact",
					artifactType: card.type,
					payload: card.payload as never,
					toolCallId: crypto.randomUUID(),
				};
				estado = { ...estado, events: [...estado.events, fronteira, artifact] };
				emitir(fronteira);
				emitir(artifact);
				// O card fala por si: o anúncio suspenso estava colado a ele e cai.
				// O TOQUE não é esse card: `quick_reply`/`value_picker`/`topic_picker` são
				// a resposta rápida, não o card que "diz tudo" — desde a ordem das 17:16 todo
				// turno termina com um deles, e tratar toque como card comeria a fala do turno.
				if (!TIPOS_DE_ESCOLHA.some((tipo) => tipo === card.type)) narracaoDoTurno.mostrouCard();
			}
		};

		// Os beats do turno — o custo é somado no fim, exato (N09/P217).
		const usosDoTurno: UsoDoBeat[] = [];
		const executar = async () => {
			const beat = await executarBeat({
				system,
				turnMessage: (captura.textoLimpo || "(sem fala)") + naTela,
				historico,
				tools: semRepetirChamada(
					toPiTools(buildToolsLivres(ctx, { buscarGrupos: deps?.busca }) as never, {
						conversationId,
						so: [...NOMES_DAS_TOOLS_LIVRES],
					}),
				),
				aoDelta: (delta) => {
					// O trecho é SEGURADO até acabar (tool ou fim do beat): o verificador
					// de "uma pergunta por mensagem" precisa do texto pronto.
					pendente += delta;
					// O que já foi dito neste turno — a tool de fechamento confere aqui o
					// aviso da LGPD dado na mesma fala.
					ctx.textoDoTurno += delta;
				},
				aoToolCall: (chamada) => {
					soltarTrecho();
					trechos.aoToolCall();
					// A fala antes da tool fecha o balão aqui; o EVENTO da mesma chamada
					// reentregue não sai duas vezes (L41/P301).
					if (chamada.toolCallId && chamadasEmitidas.has(chamada.toolCallId)) return;
					if (chamada.toolCallId) chamadasEmitidas.add(chamada.toolCallId);
					const evento = {
						type: "tool-call" as const,
						toolName: chamada.nome,
						input: (chamada.input ?? {}) as Record<string, unknown>,
						toolCallId: chamada.toolCallId,
					};
					estado = { ...estado, events: [...estado.events, evento] };
					emitir(evento);
				},
				// O RESULTADO da ferramenta é onde o card nasce: a tool já escreveu em
				// `ctx.cards` quando o harness entrega o evento, e daqui ele vai ao canal na
				// ordem do stream, antes da fala que o modelo fizer depois (P157). O card de
				// ESCOLHA é a exceção: ele espera o fim do beat, depois da pergunta (P136).
				aoResultado: () => {
					emitirFalasNovas();
					emitirCardsNovos();
				},
				provider: deps?.provider,
			});

			soltarTrecho();

			// 4. O que a busca gravou no estado.
			if (ctx.estadoDepoisDaBusca) {
				const b = ctx.estadoDepoisDaBusca;
				estado = {
					...estado,
					funnel: {
						...estado.funnel,
						currentCategory: b.categoria ?? estado.funnel.currentCategory,
						revealCompleted: true,
						qualifyAnswers: {
							...estado.funnel.qualifyAnswers,
							...(b.creditMax ? { creditMax: b.creditMax } : {}),
							...(b.creditMin ? { creditMin: b.creditMin } : {}),
							...(b.parcelaAlvo ? { parcelaAlvo: b.parcelaAlvo } : {}),
							...(b.valorDoBemAlvo ? { valorDoBemAlvo: b.valorDoBemAlvo } : {}),
							...(b.lanceEmbutido !== undefined ? { lanceEmbutido: b.lanceEmbutido } : {}),
						},
					},
				};
			}

			// 4b. O FATO QUE A EMISSÃO DO CARD PROVOU (L02/P259, contrato com o bloco
			// FECHO-B). `mostrar_card` de `contract_form` anota em `ctx.metaDaEmissao`
			// que o formulário apareceu na tela — é essa marca, e não a fala do modelo,
			// que autoriza o `contract-submit` a criar proposta real. Na web o adapter
			// marca por conta própria; no WhatsApp nenhuma flag era escrita e o
			// `contract_confirm` recusava.
			//
			// `emitirCardsNovos` já aplica a marca quando o card sai no meio do beat;
			// aqui ela é aplicada de novo para o caso de a tool escrevê-la sem card
			// (idempotente: só a direção `true` entra).
			estado = aplicarMetaDaEmissao(estado, ctx.metaDaEmissao);

			// 5. Cards por RESULTADO — o card de NÚMERO nunca é escolha do modelo;
			// o de ESCOLHA (pergunta + opções) é, e foi validado em `mostrar_card`.
			//
			// Aqui sai o que ficou para o fim do turno: os cards de ESCOLHA (esperam a
			// pergunta que os explica — P136) e o `quick_reply` derivado do ÚLTIMO balão do
			// turno. Os cards FACTUAIS já foram ao canal no resultado da ferramenta (P157) e
			// o dedupe impede que saiam de novo.
			emitirFalasNovas();
			// O card fala por si (R5.1): o anúncio suspenso estava colado a ele e cai
			// (quem o descarta é `emitirCardsNovos`). Sem card no turno, o anúncio é a
			// fala da vez e sai como qualquer outra — fala legítima não se perde. O balão
			// de TOQUE (`quick_reply`/`value_picker`/`topic_picker`) não conta como card:
			// desde a ordem das 17:16 ele acompanha todo turno, e contá-lo calaria toda
			// fala de anúncio de ferramenta.
			//
			// Antes dos cards de propósito: o anúncio liberado aqui é TEXTO, e o toque
			// tem de ficar no último balão do turno, nunca acima dele.
			if (!ctx.cards.some((c) => !TIPOS_DE_ESCOLHA.some((tipo) => tipo === c.type))) {
				for (const texto of narracaoDoTurno.fimDoTurno()) emitirFala(texto);
			}
			// O ÚNICO TOQUE DO TURNO — ordem do líder, 27/10/2026 18:08.
			//
			// Um card por turno, derivado da ÚLTIMA pergunta e emitido no ÚLTIMO balão
			// (`ctx.cards` é emitido agora, depois de toda a fala). Decidir por trecho dava
			// o toque do primeiro balão embaixo do segundo: o cliente lia a mesma pergunta
			// duas vezes (print 07) e a pergunta final chegava sem nada para tocar
			// (print 08). Sem balão de texto no turno não há toque: turno que só mostrou
			// card não ganha botão ao lado dele.
			if (ultimoBalaoDoTurno !== null) {
				const chipDoTurno = chipDoUltimoBalao({
					texto: ultimoBalaoDoTurno,
					cardsDoTurno: ctx.cards,
					temCartaNaTela: ctx.cartasNaTela.length > 0,
					canal: ctx.channel,
					...(falaDoClienteDoTurno ? { falaDoCliente: falaDoClienteDoTurno } : {}),
					...(estado.funnel.currentCategory
						? { categoriaDoBem: estado.funnel.currentCategory }
						: {}),
				});
				if (chipDoTurno) ctx.cards.push(chipDoTurno as never);
			}
			emitirCardsNovos("todos");
			// O MARCO DA PRIMEIRA CARTA (L29/P281) — sinal de SESSÃO, uma vez por
			// conversa. Na `main` quem chamava era o nó de descoberta; com o Pi ninguém
			// chamava, e o `carta_vista`/`turnos_ate_carta` (a métrica que disse se a
			// vitrine funcionou) ficou sem produtor. `revealCompleted` ainda é o de
			// ENTRADA aqui — re-descoberta por troca de faixa não reemite. Só o card de
			// oferta conta: é o momento em que a conversa deixa de ser promessa.
			if (!baseMeta.revealCompleted && ctx.cards.some((c) => c.type === "comparison_table")) {
				void marcarPrimeiraCarta(conversationId, !isUserTurn);
			}
			if (ctx.pediuHumano) {
				estado = {
					...estado,
					events: [...estado.events, { type: "handoff", reason: "pedido do cliente" } as never],
					funnel: { ...estado.funnel, handoffSuggested: true },
				};
			}

			console.log(
				`[pi-livre] saida conv=${conversationId} texto=${beat.texto.length} chamadas=${beat.chamadas.map((c) => c.nome).join(",") || "-"} cards=${ctx.cards.length} erro=${beat.uso.input === 0 && beat.texto.length === 0 ? "sem-tokens" : "ok"}`,
			);

			// 6. O LIVRO-CAIXA DO TURNO. Uma linha por turno, com as quatro parcelas
			// somadas dos beats — e o custo calculado UMA vez sobre essa soma, na borda
			// de gravação (N09/P217). Quem grava é o livro-caixa comum
			// (`registrarUsoDeIa`), o mesmo das chamadas fora do vendedor: a coluna de
			// custo, o preço desconhecido virando `null` (nunca zero) e o cache numa
			// tabela só.
			//
			// O cache entra porque o input do provedor chega LÍQUIDO dele: 12.000
			// tokens de prompt são 1.500 de entrada + 10.000 lidos do cache + 500
			// escritos (`converse.test.ts`). Gravar só entrada e saída subestimava o
			// gasto de IA — é a parcela que decide o custo real de um turno que repete
			// a mesma caixa a cada beat (P217/P273).
			// O modelo do livro-caixa é o MESMO que a sessão abriu (`modeloDoAgente`):
			// repetir a expressão aqui gravava custo com um nome que podia divergir da
			// seleção real no dia em que ela mudasse.
			const modelo = modeloDoAgente();
			usosDoTurno.push({
				modelo,
				tokensInput: beat.uso.input,
				tokensOutput: beat.uso.output,
				cacheRead: beat.uso.cacheRead,
				cacheWrite: beat.uso.cacheWrite,
			});

			// O USO DE CACHE DO PROVEDOR NO STREAM (L29/P281). O beat já recebe o
			// recorte de cache do bloco `usage` final, mas sem este evento ninguém o
			// via: `TurnTraceRecord.cacheRead`/`cacheWrite` ficavam `null` para sempre,
			// e é o cache do prompt que decide o custo real da IA (a caixa do vendedor
			// se repete a cada beat). Telemétrico como o `turno-do-cliente` acima: entra
			// no estado, é emitido UMA vez no fim do turno e os dois adapters o tratam
			// como no-op.
			//
			// Só sai quando o provedor de fato reportou cache: `null` no trace significa
			// "não medido", e um evento com 0/0 diria que foi medido e deu zero — a
			// mesma disciplina de preço desconhecido em `uso_de_ia`.
			if (beat.uso.cacheRead > 0 || beat.uso.cacheWrite > 0) {
				estado = {
					...estado,
					events: [
						...estado.events,
						{ type: "usage", cacheRead: beat.uso.cacheRead, cacheWrite: beat.uso.cacheWrite },
					],
				};
			}

			const usoDoTurno = somarUsoDosBeats(usosDoTurno);
			// O custo do turno no log é o MESMO número que o livro-caixa grava (a soma é
			// linear nos tokens e o preço é um só por turno): quem investiga um CPC que
			// não fecha vê entrada, saída, cache e custo sem consultar o banco.
			console.log(
				`[pi-livre] uso conv=${conversationId} modelo=${modelo} input=${usoDoTurno.tokensInput} output=${usoDoTurno.tokensOutput} cacheRead=${usoDoTurno.cacheRead} cacheWrite=${usoDoTurno.cacheWrite} custoUsdCents=${usoDoTurno.custoUsdCents}`,
			);
			// `cacheRead`/`cacheWrite` vão SEMPRE que o beat os mediu — inclusive zero, que
			// é medição de que nenhum token veio do cache (P273). `null` fica reservado ao
			// "não medido": o turno só o grava quando nenhum beat reportou a parcela, e é
			// isso que faz a linha antiga ou incompleta entrar na marca parcial em vez de
			// ser precificada integralmente.
			await registrarUsoDeIa({
				conversationId,
				modelo,
				tokensInput: usoDoTurno.tokensInput,
				tokensOutput: usoDoTurno.tokensOutput,
				cacheRead: usoDoTurno.cacheRead,
				cacheWrite: usoDoTurno.cacheWrite,
			});

			// 7. Persistência. A meta vai ao banco ANTES dos cards (o adapter relê a
			// meta fresca no handler do artifact), e as falas e os cards já foram ao
			// canal na ordem do stream. Esta entrega é só o que NUNCA passou por ele:
			// o `turno-do-cliente`, o `usage` e o `handoff` — reentregar a fala, a
			// fronteira ou o card que já saíram duplicaria o balão na tela.
			await persistirTurnoLivre({ estado });
			for (const ev of estado.events) {
				if (
					ev.type === "tool-call" ||
					ev.type === "text-delta" ||
					ev.type === "text-boundary" ||
					ev.type === "artifact"
				)
					continue;
				emitir(ev);
			}

			// Modelo sem nada a dizer não pode virar turno mudo no canal. Turno cujo
			// anúncio caiu não é mudo: o card é a fala dele (R5.1) — e uma linha de
			// preenchimento ali seria só outra narração.
			//
			// O TOQUE não é fala nem card que fale por si: desde a ordem das 17:16 o
			// `quick_reply`/`value_picker`/`topic_picker` acompanha TODO turno, e contá-lo
			// como fala calaria a linha de reserva de um turno em que o modelo não disse
			// nada (foi o que o caso do JSON vazado pegou).
			const temCardQueFala = estado.events.some(
				(ev) =>
					ev.type === "artifact" && !TIPOS_DE_ESCOLHA.some((tipo) => tipo === ev.artifactType),
			);
			const falou =
				temCardQueFala ||
				estado.events.some((ev) => ev.type === "text-delta" && ev.text.trim().length > 0);
			if (!falou) {
				emitir({
					type: "text-delta",
					text: temCardQueFala
						? "Achei essas opções pra você. Alguma te interessa?"
						: "Desculpa, me perdi aqui. Pode me contar de novo o que você quer?",
				});
			}

			void projectToMeta(estado);
		};

		let fechado = false;
		let erro: unknown = null;
		void executar()
			.catch((e) => {
				erro = e;
			})
			.finally(() => {
				fechado = true;
				acordar?.();
				acordar = null;
			});

		while (!fechado || fila.length > 0) {
			if (fila.length === 0) {
				await new Promise<void>((ok) => {
					acordar = ok;
				});
				continue;
			}
			yield fila.shift() as TurnEvent;
		}

		if (erro) throw erro;
		yield { type: "finish", reason: "complete" };
	};
}

export const runTurnLivre = createRunTurnLivre();
