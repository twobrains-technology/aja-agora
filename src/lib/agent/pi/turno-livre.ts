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
import { type MetaDaEmissao, TIPOS_DE_ESCOLHA } from "@/lib/agent/pi/cards-livres";
import { type ChipGerado, garantirChip } from "@/lib/agent/pi/chips";
import { executarBeat } from "@/lib/agent/pi/converse";
import { linhaFinalDoHandoff, RE_DE_PROMESSA } from "@/lib/agent/pi/handoff";
import { AVISO_LGPD_RE, garanteAvisoLgpd, PEDE_DADO_RE } from "@/lib/agent/pi/lgpd";
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

/** As palavras que põem o dinheiro ao lado no contexto de LANCE — o que o
 * cliente vai OFERECER, não o preço do bem nem a parcela. É a versão na fala dos
 * cards `lance-value`/`lance-embutido` da `main`. Lista fechada, como a das
 * categorias: palavra desconhecida ao lado do número é ambígua e não vira lance. */
const PALAVRAS_DE_LANCE = "lance|entrada|[áa]gio";
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
	"e",
	"ou",
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
 * painel e o estágio do lead. */
export function declaracaoDoTurno(texto: string | null | undefined): {
	categoria?: Category;
	valorDoBem?: number;
} {
	if (!texto) return {};
	const nomeadas = PALAVRAS_DE_CATEGORIA.filter((p) => (texto.match(p.re) ?? []).length > 0);
	const categoria = nomeadas.length === 1 ? nomeadas[0]?.categoria : undefined;
	// O DINHEIRO DO LANCE SAI DA FRASE, O RESTO FICA (P212): "quero um carro de 80
	// mil, sem entrada" declara o bem de 80 mil — a palavra "entrada" não apaga a
	// frase inteira. Só o número que o cliente ligou ao lance é retirado; o que
	// sobra (o preço do bem) vai ao mesmo `parseAssetValue` de sempre.
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
 * bem. */
const TOKEN_DE_DINHEIRO = /(?:\br\$\s*)?\d[\d.,]*(?:\s*(?:mil(?:h[ãa]o|h[õo]es)?|mi|k)\b)?/gi;

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
 * com mais de quatro palavras — o par não vale. */
function somenteLigacoes(vao: string): boolean {
	const palavras = vao.trim().split(/\s+/).filter(Boolean);
	if (palavras.length > 4) return false;
	return palavras.every((p) => LIGACOES_DO_LANCE.has(semAcento(p).replace(/[^\p{L}]/gu, "")));
}

type OracaoDoTurno = { inicio: number; fim: number };

/** Quebra a fala em ORAÇÕES. A pontuação só separa quando NÃO está dentro de um
 * número: em "R$ 20.000" o ponto é separador de milhar, e em "1,5 milhão" a
 * vírgula é decimal — cortar ali partiria o dinheiro no meio.
 *
 * A oração é a unidade de quem DECLARA (P139): "quanto de lance eu preciso?" e
 * "tenho 30 mil" são orações diferentes, e só a segunda é dinheiro disponível. */
function oracoesDe(texto: string): OracaoDoTurno[] {
	const oracoes: OracaoDoTurno[] = [];
	let inicio = 0;
	for (let i = 0; i < texto.length; i++) {
		const caractere = texto[i] ?? "";
		if (!",.;:!?\n".includes(caractere)) continue;
		const anterior = texto[i - 1] ?? "";
		const seguinte = texto[i + 1] ?? "";
		// Separador DENTRO de um número (milhar/decimal) não fecha oração.
		if (/\d/.test(anterior) && /\d/.test(seguinte)) continue;
		oracoes.push({ inicio, fim: i });
		inicio = i + 1;
	}
	oracoes.push({ inicio, fim: texto.length });
	return oracoes;
}

/** O dinheiro que a fala liga ao LANCE, com a posição: o token de dentro da
 * oração que nomeia lance/entrada/ágio, o mais colado ao marcador.
 *
 * Serve às duas perguntas do turno, e é por isso que ela devolve também a
 * posição: (a) o número é dinheiro DISPONÍVEL? — quem responde é
 * `dinheiroFoiDeclarado`, que lê a oração em volta; (b) o número é o valor do
 * BEM? — não: é do lance, e `semODinheiroDoLance` o retira da frase antes do
 * `parseAssetValue` (P212). */
type DinheiroDoLance = { valor: number; inicio: number; fim: number; oracao: OracaoDoTurno };

function dinheirosDoLance(texto: string): DinheiroDoLance[] {
	const oracoes = oracoesDe(texto);
	const tokens = [...texto.matchAll(TOKEN_DE_DINHEIRO)].map((token) => ({
		inicio: token.index ?? 0,
		fim: (token.index ?? 0) + token[0].length,
		valor: parseAssetValue(token[0]),
	}));
	const dinheiros: DinheiroDoLance[] = [];
	for (const oracao of oracoes) {
		const marcadores = [...texto.matchAll(MARCADORES_DE_LANCE)]
			.map((m) => ({ inicio: m.index ?? 0, fim: (m.index ?? 0) + m[0].length }))
			.filter((m) => m.inicio >= oracao.inicio && m.fim <= oracao.fim);
		if (marcadores.length === 0) continue;
		let melhor: { dinheiro: DinheiroDoLance; distancia: number } | null = null;
		for (const token of tokens) {
			if (token.valor === null) continue;
			if (token.inicio < oracao.inicio || token.fim > oracao.fim) continue;
			for (const marcador of marcadores) {
				const vao =
					token.fim <= marcador.inicio
						? texto.slice(token.fim, marcador.inicio)
						: token.inicio >= marcador.fim
							? texto.slice(marcador.fim, token.inicio)
							: null;
				// Vão de LIGAÇÃO só: "o carro de 80 mil tem lance de quanto?" não liga o
				// preço do bem ao lance, e o "tem" no meio é o que desfaz o par.
				if (vao === null || !somenteLigacoes(vao)) continue;
				if (melhor && vao.trim().length >= melhor.distancia) continue;
				melhor = {
					dinheiro: { valor: token.valor, inicio: token.inicio, fim: token.fim, oracao },
					distancia: vao.trim().length,
				};
			}
		}
		if (melhor) dinheiros.push(melhor.dinheiro);
	}
	return dinheiros;
}

/** O que NEGA o dinheiro antes do número ("não tenho 30 mil para lance") e o que
 * TRANSFORMA a fala em pergunta ("preciso ter 30 mil de lance?"). */
const NEGACAO_ANTES_DO_DINHEIRO = /\b(n[ãa]o|nunca|jamais|nem|sem)\b/i;
const PERGUNTA_ANTES_DO_DINHEIRO =
	/\b(quanto|quantos|quantas|qual|quais|quando|onde|como|preciso|precisaria|ser[áa]|tem como|d[áa] pra)\b/i;

/** O cliente AFIRMOU ter esse dinheiro? (P139)
 *
 * Pergunta e negativa não viram dinheiro DISPONÍVEL: "preciso ter 30 mil de
 * lance?" e "não tenho 30 mil para lance" descrevem o que ele NÃO tem ou quer
 * saber — gravar como lance faria os três cenários usarem recurso que ele não
 * tem. A leitura é da oração: a negação vale quando vem ANTES do dinheiro, e a
 * pergunta quando está na mesma oração ("?") ou é aberta por palavra
 * interrogativa antes do número. */
function dinheiroFoiDeclarado(texto: string, dinheiro: DinheiroDoLance): boolean {
	const antes = texto.slice(dinheiro.oracao.inicio, dinheiro.inicio);
	const depois = texto.slice(dinheiro.fim, dinheiro.oracao.fim);
	if (NEGACAO_ANTES_DO_DINHEIRO.test(antes)) return false;
	if (depois.includes("?")) return false;
	if (PERGUNTA_ANTES_DO_DINHEIRO.test(antes)) return false;
	return true;
}

/** A fala SEM o dinheiro que pertence ao lance — é sobre ela que o
 * `parseAssetValue` decide o valor do BEM (P212). Assim "quero um carro de 80
 * mil, sem entrada" continua declarando 80 mil, e "quero um de 80 mil e dou 20
 * mil de entrada" separa os dois números: bem 80 mil, lance 20 mil. */
function semODinheiroDoLance(texto: string): string {
	const dinheiros = dinheirosDoLance(texto);
	if (dinheiros.length === 0) return texto;
	let limpo = texto;
	for (const dinheiro of [...dinheiros].sort((a, b) => b.inicio - a.inicio)) {
		limpo = `${limpo.slice(0, dinheiro.inicio)} ${limpo.slice(dinheiro.fim)}`;
	}
	return limpo;
}

/** O valor de LANCE que o cliente DISSE TER, ou `undefined`.
 *
 * O par é dinheiro + palavra de lance na MESMA oração, em qualquer ordem
 * ("tenho 30 mil pro lance", "meu lance é de 30 mil"), e só vale quando é
 * declaração — pergunta e negativa ficam de fora (ver `dinheiroFoiDeclarado`). */
function lanceDaFala(texto: string): number | undefined {
	for (const dinheiro of dinheirosDoLance(texto)) {
		if (dinheiroFoiDeclarado(texto, dinheiro)) return dinheiro.valor;
	}
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
			if (
				declaracao.categoria ||
				declaracao.valorDoBem ||
				dinheiro.lanceValue ||
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
							// O dinheiro e o prazo que `perfilDeclarado` lê (cenários e dial).
							...(dinheiro.lanceValue ? { lanceValue: dinheiro.lanceValue } : {}),
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
		// A GUARDA DA NARRAÇÃO (R5.1): o balão que só anuncia a ferramenta fica
		// suspenso até o turno dizer se veio card — colado a um card ele cai, sem
		// card ele é a fala da vez. Ver `narracao.ts`.
		const narracaoDoTurno = criarNarracaoDoTurno();
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
		/** Um balão pronto no canal: fronteira (se mudou de fala) + delta. */
		const emitirFala = (texto: string) => {
			for (const ev of trechos.aoDelta(texto)) {
				estado = { ...estado, events: [...estado.events, ev] };
				emitir(ev);
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
			// O anúncio da ferramenta não vira balão quando o card fala por si: o
			// que estava suspenso sai antes deste balão, e este fica suspenso
			// (R5.1).
			for (const texto of narracaoDoTurno.aoTexto(saida.texto)) emitirFala(texto);
			// O chip entra DEPOIS da pergunta: o cliente lê e toca, não lê a lista.
			if (saida.chip) ctx.cards.push(saida.chip as never);
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
				narracaoDoTurno.mostrouCard();
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
			// pergunta que os explica — P136) e o `quick_reply` que o verificador de
			// perguntas tirou da fala. Os cards FACTUAIS já foram ao canal no resultado da
			// ferramenta (P157) e o dedupe impede que saiam de novo.
			emitirFalasNovas();
			emitirCardsNovos("todos");
			// O card fala por si (R5.1): o anúncio suspenso estava colado a ele e cai
			// (quem o descarta é `emitirCardsNovos`). Sem card no turno, o anúncio é a
			// fala da vez e sai como qualquer outra — fala legítima não se perde.
			if (ctx.cards.length === 0) {
				for (const texto of narracaoDoTurno.fimDoTurno()) emitirFala(texto);
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
			const falou =
				cardsJaEmitidos.size > 0 ||
				estado.events.some((ev) => ev.type === "text-delta" && ev.text.trim().length > 0);
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
