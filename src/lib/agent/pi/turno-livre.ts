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
import { conversations, usoDeIa } from "@/db/schema";
import { listShownOffersForConversation } from "@/lib/agent/orchestrator/choose-offer";
import { maskCpfForDisplay } from "@/lib/agent/orchestrator/contract-form-prefill";
import type { TurnEvent, TurnInput } from "@/lib/agent/orchestrator/types";
import { passaFinal } from "@/lib/agent/orchestrator/vazamento";
import { parseAssetValue } from "@/lib/agent/parse-asset-value";
import type { Category } from "@/lib/agent/personas";
import type { MetaDaEmissao } from "@/lib/agent/pi/cards-livres";
import { type ChipGerado, garantirChip } from "@/lib/agent/pi/chips";
import { executarBeat } from "@/lib/agent/pi/converse";
import { linhaFinalDoHandoff, RE_DE_PROMESSA } from "@/lib/agent/pi/handoff";
import { AVISO_LGPD_RE, garanteAvisoLgpd, PEDE_DADO_RE } from "@/lib/agent/pi/lgpd";
import { persistirTurnoLivre } from "@/lib/agent/pi/persist-livre";
import { custoDoTurnoCentsExatos } from "@/lib/agent/pi/precos";
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
import { marcarPrimeiraCarta } from "@/lib/observability/sinais/marcar-primeira-carta";
import {
	type ArtefatoDaConversa,
	lerCartasDaConversa,
	restaurarCartasDaConversa,
} from "./cartas-da-conversa";

/** Identidade que o cliente digitou nesta fala — capturada no SERVIDOR, nunca
 * pelo modelo. Devolve o texto sem os números, que é o que vai para o banco, para
 * o provedor do modelo e para o admin. */
/** DDDs em uso no Brasil — LISTA FECHADA (ANATEL), não faixa. A faixa antiga
 * rejeitava 21/22/24/27/28 (RJ e ES, DDDs reais) e aceitava 26/30/36/39, que
 * não existem. */
const DDDS_VALIDOS = new Set([
	"11",
	"12",
	"13",
	"14",
	"15",
	"16",
	"17",
	"18",
	"19",
	"21",
	"22",
	"24",
	"27",
	"28",
	"31",
	"32",
	"33",
	"34",
	"35",
	"37",
	"38",
	"41",
	"42",
	"43",
	"44",
	"45",
	"46",
	"47",
	"48",
	"49",
	"51",
	"53",
	"54",
	"55",
	"61",
	"62",
	"63",
	"64",
	"65",
	"66",
	"67",
	"68",
	"69",
	"71",
	"73",
	"74",
	"75",
	"77",
	"79",
	"81",
	"82",
	"83",
	"84",
	"85",
	"86",
	"87",
	"88",
	"89",
	"91",
	"92",
	"93",
	"94",
	"95",
	"96",
	"97",
	"98",
	"99",
]);

function dddValido(ddd: string): boolean {
	return DDDS_VALIDOS.has(ddd);
}

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

export function capturarIdentidadeDoTexto(
	texto: string,
	atual: StoredIdentity | null,
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

	// ── CPF ────────────────────────────────────────────────────────────────
	// Só entra CPF FORMATADO (`111.444.777-35`) ou 11 dígitos que PASSAM no
	// dígito verificador. Um número solto de 11 dígitos é, na maioria das vezes,
	// celular — tratá-lo como CPF apagava o telefone que o cliente acabou de
	// digitar (o regex antigo levava "11987654321" embora como CPF inválido).
	const formatado = textoLimpo.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/)?.[0] ?? null;
	const candidatos = [...textoLimpo.matchAll(/\b\d{11}\b/g)].map((m) => m[0]);
	const cpfSolto = candidatos.find((c) => isValidCpf(c)) ?? null;
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
	const telSolto =
		soltos.find((t) => {
			const n = t.length === 11 ? t : null;
			return n !== null && n[2] === "9" && dddValido(n.slice(0, 2)) && !isValidCpf(n);
		}) ??
		soltos.find((t) => t.length === 10 && dddValido(t.slice(0, 2)) && !isValidCpf(t)) ??
		null;
	const teleCandidato = formatadoTel ?? telSolto;

	if (teleCandidato) {
		const digitos = teleCandidato.replace(/\D/g, "");
		const semDdi = digitos.length === 13 && digitos.startsWith("55") ? digitos.slice(2) : digitos;
		// Telefone com separador é telefone, mesmo que os dígitos passem no DV do
		// CPF por coincidência (~1% dos números). A rejeição por CPF só vale para
		// sequência SOLTA de dígitos, onde a ambiguidade é real.
		const ambiguoComCpf = !formatadoTel && isValidCpf(semDdi);
		if (
			(semDdi.length === 10 || semDdi.length === 11) &&
			dddValido(semDdi.slice(0, 2)) &&
			!ambiguoComCpf
		) {
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

/** O texto que sai no balão: CPF mascarado, aviso da LGPD antes do pedido de dado,
 * e uma pergunta por trecho. Exportado para ser testado sem banco. */
export function montarTrechoDeSaida(args: {
	texto: string;
	avisoDado: boolean;
	cardsDoTurno?: readonly { type: string }[];
	handoff?: { nome: string | null; clientePediu: boolean; casoAberto: boolean };
}): { texto: string; avisoAplicado: boolean; chip: ChipGerado | null } {
	// O ÚLTIMO PASSE roda AQUI, no texto que vai AO VIVO para o canal — não só na
	// persistência: máscara de CPF e o corte de vazamento de máquina (JSON de
	// argumento, nome de tool) têm de valer para o cliente, não só para o banco.
	const bruto = passaFinal(args.texto);
	let texto = bruto;
	let avisoAplicado = false;
	if (!args.avisoDado && PEDE_DADO_RE.test(bruto)) {
		// Mesmo quando o modelo escreveu o aviso na mesma mensagem, o aviso ocupa o primeiro
		// bloco e o pedido de dado fica para o turno seguinte — o aceite vem antes.
		texto = garanteAvisoLgpd({ texto: bruto, avisoJaDado: false }).texto;
		avisoAplicado = true;
	}
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
		return { texto: linha, avisoAplicado: false, chip: null };
	}

	// O aviso é a pergunta do turno: o verificador de "uma pergunta por mensagem" roda
	// DEPOIS dele, senão o aviso é cortado como pergunta extra.
	const final = manterUmaPergunta(texto);
	// Pergunta fechada sem card de escolha no turno ⇒ o chip sai do texto. O balão
	// guarda a pergunta; a opção vira botão — e a LISTA que virou botão sai do
	// balão (`.texto`), senão o cliente lê duas vezes a mesma escolha.
	const chipado = garantirChip({ texto: final, cardsDoTurno: args.cardsDoTurno ?? [] });
	return { texto: chipado.texto, avisoAplicado, chip: chipado.chip };
}

/** Texto antes e depois de uma tool é fala DIFERENTE: sem separador o stream
 * cola "…você, Marcos!Então…". A primeira fala depois de uma tool abre um
 * `text-boundary` (web: balão novo; WhatsApp: mensagem nova; persistência: um
 * balão por boundary). */
export function criarSeparadorDeTrechos() {
	let falou = false;
	let toolDesdeAFala = false;
	const jáSoltos = new Set<string>();
	const normalizar = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
	return {
		aoToolCall() {
			if (falou) toolDesdeAFala = true;
		},
		/** Eventos a emitir para este delta, na ordem. Um trecho IDÊNTICO a um já solto
		 * neste turno não sai: foi assim que "Ótimo! Vou gerar sua proposta agora na
		 * Canopus." apareceu duas vezes na tela, depois de a tool recusar o aceite. */
		aoDelta(texto: string): TurnEvent[] {
			const eventos: TurnEvent[] = [];
			if (toolDesdeAFala && texto.trim().length > 0) {
				eventos.push({ type: "text-boundary" });
				toolDesdeAFala = false;
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
 * preço do bem e `parseAssetValue` não conhece a distinção, então o recado que
 * fala de LANCE não vira valor (o lance tem campo próprio).
 *
 * Categoria: só quando o recado nomeia UMA. "carro ou moto" é comparação, não
 * declaração, e escolher uma das duas por conta própria envenenaria o filtro do
 * painel e o estágio do lead. */
export function declaracaoDoTurno(texto: string | null | undefined): {
	categoria?: Category;
	valorDoBem?: number;
} {
	if (!texto) return {};
	const nomeadas = PALAVRAS_DE_CATEGORIA.filter((p) => (texto.match(p.re) ?? []).length > 0);
	const categoria = nomeadas.length === 1 ? nomeadas[0]?.categoria : undefined;
	const valorDoBem = /\blance\b/i.test(texto) ? undefined : (parseAssetValue(texto) ?? undefined);
	return {
		...(categoria ? { categoria } : {}),
		...(valorDoBem ? { valorDoBem } : {}),
	};
}

/** Um beat do turno, já com o preço do modelo resolvido. */
export type UsoDoBeat = { modelo: string; tokensInput: number; tokensOutput: number };

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
 * seria um número inventado, com cara de medição). */
export function somarUsoDosBeats(beats: readonly UsoDoBeat[]): {
	tokensInput: number;
	tokensOutput: number;
	custoUsdCents: number | null;
} {
	let tokensInput = 0;
	let tokensOutput = 0;
	let centavosExatos = 0;
	let semPreco = false;
	for (const beat of beats) {
		tokensInput += beat.tokensInput;
		tokensOutput += beat.tokensOutput;
		const centavos = custoDoTurnoCentsExatos(beat);
		if (centavos === null) semPreco = true;
		else centavosExatos += centavos;
	}
	return {
		tokensInput,
		tokensOutput,
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
		const identidadeAtual = await loadIdentity(conversationId).catch(() => null);
		const captura = capturarIdentidadeDoTexto(userText ?? "", identidadeAtual);
		if (captura.identidade && (captura.recebeuCpf || captura.recebeuCelular)) {
			await storeIdentity(conversationId, captura.identidade).catch((erro: unknown) => {
				console.error("[pi-livre] identidade não gravada (ignorado):", erro);
			});
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
		// sobrescreve — ela é a verdade de fato.
		if (isUserTurn) {
			const declaracao = declaracaoDoTurno(captura.textoLimpo);
			if (declaracao.categoria || declaracao.valorDoBem) {
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
		const exibidas = await listShownOffersForConversation(conversationId).catch(() => []);
		const naTela = exibidas.length
			? `\n\nCartas na tela desta conversa:\n${exibidas
					.map(
						(o) =>
							`- [na tela: ${o.administradora ?? "administradora"} · carta R$ ${o.creditValue?.toLocaleString("pt-BR") ?? "?"} · id ${o.groupId}]`,
					)
					.join("\n")}`
			: "";

		// Fila de eventos: o beat empurra o texto AO VIVO, o generator drena.
		const fila: TurnEvent[] = [];
		let acordar: (() => void) | null = null;
		const emitir = (evento: TurnEvent) => {
			fila.push(evento);
			acordar?.();
			acordar = null;
		};

		const trechos = criarSeparadorDeTrechos();
		let pendente = "";
		// O aviso da LGPD é FATO DO HARNESS: se ele ainda não foi dado na conversa e a
		// fala pede CPF ou celular, o aviso entra ANTES do pedido e o pedido fica pro
		// turno depois do aceite. Não é conselho de prompt — é o verificador do texto.
		let avisoDado = historico.some((f) => f.role === "assistant" && AVISO_LGPD_RE.test(f.content));
		// O caso aberto NESTE turno define o balão: uma linha, sem promessa.
		let casoAberto = false;
		// Uma linha por turno: se a linha da casa já saiu, o segundo trecho de prosa de handoff
		// não vira segunda mensagem.
		let linhaDeHandoffEmitida = false;
		// CPF mascarado JÁ na saída (o número digitado não volta por eco do modelo)
		// e uma pergunta por trecho de fala.
		// CPF mascarado, aviso da LGPD antes do pedido de dado e uma pergunta por
		// trecho — tudo em `montarTrechoDeSaida`, que é testável sem banco.
		const soltarTrecho = () => {
			if (!pendente) return;
			const ehHandoff = casoAberto || RE_DE_PROMESSA.test(pendente);
			if (ehHandoff && linhaDeHandoffEmitida) {
				pendente = "";
				return;
			}
			const saida = montarTrechoDeSaida({
				texto: pendente,
				avisoDado,
				cardsDoTurno: ctx.cards,
				handoff:
					casoAberto || RE_DE_PROMESSA.test(pendente)
						? { nome: ctx.nomeDoCliente, clientePediu: true, casoAberto }
						: undefined,
			});
			avisoDado ||= saida.avisoAplicado;
			if (ehHandoff) linhaDeHandoffEmitida = true;
			pendente = "";
			for (const ev of trechos.aoDelta(saida.texto)) {
				estado = { ...estado, events: [...estado.events, ev] };
				emitir(ev);
			}
			// O chip entra DEPOIS da pergunta: o cliente lê e toca, não lê a lista.
			if (saida.chip) ctx.cards.push(saida.chip as never);
		};
		// O mesmo `toolCallId` duas vezes não vira dois eventos de tool.
		const chamadasEmitidas = new Set<string>();
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
			// O campo é do `ContextoDasTools` do bloco FECHO-B (mesma onda): a leitura
			// opcional aqui não depende da ordem em que as duas metades entram.
			const metaDaEmissao = (ctx as ContextoDasTools & { metaDaEmissao?: MetaDaEmissao })
				.metaDaEmissao;
			estado = aplicarMetaDaEmissao(estado, metaDaEmissao);

			// 5. Cards por RESULTADO — o card de NÚMERO nunca é escolha do modelo;
			// o de ESCOLHA (pergunta + opções) é, e foi validado em `mostrar_card`.
			//
			// As falas do fecho vêm ANTES: são o aviso de divergência que a tool de
			// proposta gera (valor da administradora diferente do que foi falado).
			// Elas entram AO VIVO no stream — antes só iam para a persistência, e o
			// cliente só descobria a diferença recarregando a página.
			for (const ev of eventosDasFalasDoFecho(ctx.falasDoFecho)) {
				estado = { ...estado, events: [...estado.events, ev] };
				emitir(ev);
			}
			// O card não GRUDA na fala que o anunciou (R5.1): cada artifact abre um
			// balão novo, como na `main` (`fechaBalao` antes do card). Sem o boundary,
			// "deixa eu te mostrar…" e o card chegavam no MESMO balão, com o card
			// embaixo de dois parágrafos de prosa.
			//
			// E o MESMO card não sai duas vezes: payload idêntico é a mesma carta na
			// tela (L41/P301) — repetir a busca não pode empilhar a tabela.
			const cardsJaEmitidos = new Set<string>();
			for (const card of ctx.cards) {
				const chave = `${card.type}:${JSON.stringify(card.payload)}`;
				if (cardsJaEmitidos.has(chave)) continue;
				cardsJaEmitidos.add(chave);
				estado = {
					...estado,
					events: [
						...estado.events,
						{ type: "text-boundary" },
						{
							type: "artifact",
							artifactType: card.type,
							payload: card.payload as never,
							toolCallId: crypto.randomUUID(),
						},
					],
				};
			}
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

			// 6. Custo do turno (livro-caixa local). O preço é CONHECIDO ou o campo fica
			// `null` — nunca zero por ausência de preço (mesma disciplina de `custo-de-ia`).
			// UMA linha por turno, com a soma EXATA dos beats arredondada no fim
			// (N09/P217): o turno de hoje tem um beat, mas quem arredondava por beat
			// perdia a fração de centavo de cada um — ver `somarUsoDosBeats`.
			const modelo = process.env.AI_MODEL?.trim() || "qwen3.6-flash";
			usosDoTurno.push({
				modelo,
				tokensInput: beat.uso.input,
				tokensOutput: beat.uso.output,
			});
			const usoDoTurno = somarUsoDosBeats(usosDoTurno);
			if (usoDoTurno.tokensInput > 0 || usoDoTurno.tokensOutput > 0) {
				void db
					.insert(usoDeIa)
					.values({
						conversationId,
						modelo,
						tokensInput: usoDoTurno.tokensInput,
						tokensOutput: usoDoTurno.tokensOutput,
						custoUsdCents: usoDoTurno.custoUsdCents,
					})
					.catch((erro: unknown) => console.error("[uso-de-ia] não registrado (ignorado):", erro));
			}

			// 7. Persistência. Cards saem DEPOIS de gravar a meta.
			await persistirTurnoLivre({ estado });
			for (const ev of estado.events) {
				if (ev.type === "tool-call" || ev.type === "text-delta") continue;
				emitir(ev);
			}

			// Modelo sem nada a dizer não pode virar turno mudo no canal.
			const falou = estado.events.some(
				(ev) => ev.type === "text-delta" && ev.text.trim().length > 0,
			);
			if (!falou) {
				emitir({
					type: "text-delta",
					text:
						ctx.cards.length > 0
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
