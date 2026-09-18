/**
 * O MOTOR da régua de remarketing — a decisão PURA de o que fazer com quem
 * ficou em silêncio.
 *
 * A régua (`./regua.ts`, do bloco 1) sabe SE o toque pode sair e QUANDO é o
 * próximo. O que ela não sabe é COMO entregar: o mesmo toque é um turno de
 * conversa quando a janela de 24 h da Meta está aberta, e um template aprovado
 * quando está fechada. Este arquivo é essa decisão — e só ela.
 *
 * ── A doutrina ──────────────────────────────────────────────────────────────
 *
 * Nada aqui toca banco, HTTP ou `Date.now()`: o `agora` entra por parâmetro,
 * como na régua. A entrada é o estado da conversa (montado pelo ciclo a partir
 * de `remarketing_touches` + `conversations` + `contacts`) mais os fatos que
 * mudam o desfecho; a saída é o EFEITO que o ciclo executa (dados, não I/O) e o
 * próximo estado a gravar. O ciclo é burro de propósito — a inteligência (e o
 * teste) mora aqui.
 *
 * ── As duas portas de saída ─────────────────────────────────────────────────
 *
 * 1. **Turno de retomada** (dentro da janela de 24 h). O cliente pode receber
 *    texto livre, então o toque 01 NÃO é uma mensagem enlatada escrita no nosso
 *    código: é um turno de servidor de verdade, com o directive que a retomada
 *    já usa, e a arte vai anexada como imagem. Foi a doutrina registrada em
 *    `workers/retomada.ts` — "não existe canal paralelo de texto enlatado".
 * 2. **Template** (fora da janela). A Meta só entrega template aprovado; a
 *    chave lógica (`usageKey`) é escolhida pelo `objetivo` do disparo. Quem
 *    resolve o template é o `template-dispatch` (FIX-201), que ainda decide se
 *    enfileira quando o template não está aprovado — nenhum toque se perde.
 *
 * ── Opt-out e telefone interno são TERMINAIS ────────────────────────────────
 *
 * O opt-out é por PESSOA (`contacts.remarketing_optout_at`), não por conversa:
 * vence a régua inteira e sobrevive a uma nova simulação. A régua já trata
 * `OPTOUT` como terminal no estado; aqui o fato vem do contato, para valer
 * também numa conversa que ainda nem existe. Telefone interno (equipe) nunca
 * recebe toque, e a chamada isto é código, não boa intenção.
 */

import { chaveTelefoneBR } from "@/lib/whatsapp/mesmo-numero";
import {
	contarToquesNaJanela,
	type EstadoRegua,
	type MotivoBloqueio,
	PARAMETROS_DE_FABRICA,
	type ParametrosRegua,
	type PassoDisparo,
	podeDisparar,
	registrarOptout,
	registrarToque,
	type StatusRegua,
} from "./regua";

// ─── Os fatos que o ciclo precisa saber ─────────────────────────────────────

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Telefones da equipe. O `is_simulated` cobre teste interno, NÃO cobre a equipe
 * testando em produção com o próprio número (o dashboard achou 20% do pipeline
 * nessa fatia). A lista existe em CÓDIGO de propósito: é a guarda mínima que
 * não depende de coluna preenchida nem de cadastro no banco.
 *
 * O número é o de atendimento da casa, o mesmo que aparece nos incidentes de
 * 2026-08-10 (atendimento pelo painel × resposta pelo WhatsApp). A comparação
 * usa `chaveTelefoneBR`, então "556292496793", "62992496793" e "+55 (62)
 * 99249-6793" caem todos no mesmo lugar.
 *
 * Quem quiser ampliar sem deploy usa `TELEFONES_DA_EQUIPE` (separado por
 * vírgula) — ou a `REMARKETING_TELEFONES_INTERNOS`, que nasceu antes desta
 * frente e continua valendo para não trocar o número da casa por ninguém num
 * deploy. O ciclo ainda cruza com os atendentes do banco (`mesa_attendants` e
 * `user`), ATIVOS OU NÃO: o número de quem saiu da equipe continua sendo um
 * telefone da casa, e foi exatamente por filtrar `is_active = true` que 2 dos 6
 * toques de 18/09 chegaram em gente nossa (diagnóstico §d).
 */
const TELEFONES_DA_EQUIPE_PADRAO = ["556292496793"];

/**
 * A lista de telefones da equipe: os padrões em código mais o que vier das
 * envs. Exportada com o `env` por parâmetro para o teste poder provar a env sem
 * mexer no processo — a lista do módulo é montada uma vez, no import.
 */
export function telefonesDaEquipe(env: Record<string, string | undefined> = process.env): string[] {
	const daEnv = [env.TELEFONES_DA_EQUIPE, env.REMARKETING_TELEFONES_INTERNOS]
		.flatMap((valor) => (valor ?? "").split(","))
		.map((t) => t.trim())
		.filter(Boolean);
	return [...TELEFONES_DA_EQUIPE_PADRAO, ...daEnv];
}

/** Exportada para o teste travar que o telefone da equipe está na lista. */
export const TELEFONES_INTERNOS: readonly string[] = telefonesDaEquipe();

// ─── Objetivo → arte e template ─────────────────────────────────────────────

/** Os três eixos comerciais da régua. `auto` (persona) e `carro` (régua) são o
 * mesmo eixo; canonicamente é `carro`. */
export type ObjetivoDoToque = "carro" | "moto" | "imovel";

/**
 * O objetivo quando a conversa NÃO revelou o bem.
 *
 * Existe como valor de propósito: sem ele, "não sei" e "carro" seriam a mesma
 * string e a arte do carro sairia para quem nunca falou de carro — o defeito
 * medido em 18/09 (AJA-14). Quem consome decide o que fazer com a ausência: a
 * ARTE não sai (ver `arteDoObjetivo`), o template cai no eixo mais frequente
 * (ver `templateDoObjetivo`).
 */
export const OBJETIVO_DESCONHECIDO = "desconhecido";

/** Os apelidos conhecidos de cada eixo — a persona diz `auto`, a régua `carro`. */
const APELIDOS_DO_OBJETIVO: Record<string, ObjetivoDoToque> = {
	carro: "carro",
	auto: "carro",
	automovel: "carro",
	autos: "carro",
	moto: "moto",
	motos: "moto",
	imovel: "imovel",
};

function normalizarObjetivo(valor: string | null | undefined): string {
	// Sem acento de propósito: "Automóvel", "IMÓVEL" e "imovel" caem no mesmo
	// apelido — a caixa e o acento são digitação, não outro bem.
	return (valor ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim()
		.toLowerCase();
}

/**
 * O valor é um bem que a régua CONHECE?
 *
 * É a pergunta que separa "carro" de "não disse" — e que `objetivoCanonico`
 * sozinho não responde, porque ele é deliberadamente tolerante (desconhecido →
 * carro, para o template nunca ficar sem chave).
 */
export function ehObjetivoConhecido(valor: string | null | undefined): boolean {
	const v = normalizarObjetivo(valor);
	return v !== "" && v in APELIDOS_DO_OBJETIVO;
}

/** Normaliza o objetivo que veio do metadata/da régua. Desconhecido cai em
 * `carro` — o eixo mais frequente — e o desvio fica registrado aqui. */
export function objetivoCanonico(valor: string | null | undefined): ObjetivoDoToque {
	return APELIDOS_DO_OBJETIVO[normalizarObjetivo(valor)] ?? "carro";
}

/**
 * A chave lógica do template aprovado, por objetivo.
 *
 * O nome segue a convenção do projeto (`snake_case`), e o vínculo uso↔template
 * Meta é resolvido no banco por essa chave — o código nunca crava o nome do
 * template na Meta (ver `template-dispatch.ts`). As linhas nascem no admin /
 * na migration do bloco de templates; enquanto não estiverem `APPROVED`, o
 * `template-dispatch` enfileira em vez de perder o toque.
 */
export function templateDoObjetivo(objetivo: string): string {
	return `remarketing_oportunidade_${objetivoCanonico(objetivo)}`;
}

/**
 * A arte que acompanha o toque 01 (o único que sai como conversa).
 *
 * É um CAMINHO público: o ciclo monta a URL absoluta com a origem do site antes
 * de enviar (`sendImageMessage` aceita link). As artes são as da campanha do
 * Lucas (1080×1080), versionadas em `public/kv/remarketing/` e servidas pelo
 * próprio app. Trocar a arte é mexer nesta única tabela.
 */
export const ARTE_POR_OBJETIVO: Record<ObjetivoDoToque, string> = {
	carro: "/kv/remarketing/oportunidade-carro.png",
	moto: "/kv/remarketing/oportunidade-moto.png",
	imovel: "/kv/remarketing/oportunidade-imovel.png",
};

export function arteDoObjetivo(objetivo: string | null | undefined): string | null {
	// Sem bem conhecido NÃO sai arte: melhor um toque só de texto do que a imagem
	// de um carro para quem nunca falou de carro (AJA-14, 18/09).
	if (!ehObjetivoConhecido(objetivo)) return null;
	return ARTE_POR_OBJETIVO[objetivoCanonico(objetivo)];
}

// ─── O estado mountado pelo ciclo ───────────────────────────────────────────

/** O que o ciclo sabe de uma linha de `remarketing_touches` que vai virar
 * `EstadoRegua`. Sem banco: o ciclo já leu. */
export interface FatosDaLinha {
	step: number;
	/** `next_touch_at` gravado. */
	nextTouchAt: Date | null;
	/**
	 * `ultimo_toque_em` — o INSTANTE do último toque que saiu (coluna da rodada
	 * 2). É a fonte preferida; `next_touch_at` só entra como fallback.
	 */
	ultimoToqueEm: Date | null;
	/** Último inbound do cliente (`conversations.last_inbound_at`). */
	ultimoInboundEm: Date | null;
}

/**
 * O instante do último toque, derivado de `next_touch_at − intervalo(step)`.
 *
 * É **FALLBACK**, não o mecanismo: a coluna `ultimo_toque_em` (rodada 2) é a
 * fonte. A derivação só serve para linha antiga, gravada antes de a coluna
 * existir. Ela depende de a cadência não ter sido reajustada — invariante que o
 * próprio ciclo pode quebrar (reentrada, linha terminal). O ciclo NUNCA reescreve
 * `next_touch_at` num ciclo bloqueado, para o fallback continuar exato.
 */
export function ultimoToqueDerivado(
	fatos: {
		step: number;
		nextTouchAt: Date | null;
	},
	parametros: ParametrosRegua = PARAMETROS_DE_FABRICA,
): Date | null {
	const { step, nextTouchAt } = fatos;
	if (!nextTouchAt) return null;
	if (step === 1) return new Date(nextTouchAt.getTime() - parametros.diasAteSegundoToque * DIA_MS);
	if (step === 2) return new Date(nextTouchAt.getTime() - parametros.diasAteTerceiroToque * DIA_MS);
	return null;
}

/** O último toque da linha: a COLUNA `ultimo_toque_em`, com o fallback derivado
 * quando ela ainda é `null` (linha antiga). */
export function ultimoToqueDoFato(
	fatos: FatosDaLinha,
	parametros: ParametrosRegua = PARAMETROS_DE_FABRICA,
): Date | null {
	return fatos.ultimoToqueEm ?? ultimoToqueDerivado(fatos, parametros);
}

/**
 * Reconstrói os instantes dos toques da pessoa dentro da janela, de trás para
 * frente a partir do último — a base do teto de 30 dias quando não há histórico.
 *
 * FALLBACK da rodada 2: com a coluna `ultimo_toque_em` gravada a cada toque, o
 * histórico continua sendo reconstruído (a tabela guarda só o último instante),
 * mas a partir de um dado REAL em vez de uma derivação. Linha antiga sem a
 * coluna ainda cai no `ultimoToqueDerivado` antes de chegar aqui.
 *
 * `touches30d` é a contagem da janela; `step` é o passo do ciclo. Usamos o maior
 * dos dois para não subcontar (reentrada reseta o `step`, mas a cota gasta
 * continua valendo — subcontar liberaria mensagem a mais, e é esse o lado que
 * não se pode errar).
 */
export function toquesReconstruidos(
	args: {
		step: number;
		touches30d: number;
		ultimoToqueEm: Date | null;
	},
	parametros: ParametrosRegua = PARAMETROS_DE_FABRICA,
): Date[] {
	const { ultimoToqueEm } = args;
	if (!ultimoToqueEm) return [];

	const quantos = Math.min(parametros.maxToques, Math.max(args.step, args.touches30d));
	if (quantos <= 0) return [];

	const instantes: Date[] = [ultimoToqueEm];
	for (let i = quantos - 1; i >= 1; i--) {
		const intervalo =
			(i === 1 ? parametros.diasAteSegundoToque : parametros.diasAteTerceiroToque) * DIA_MS;
		instantes.unshift(new Date(instantes[0].getTime() - intervalo));
	}
	return instantes;
}

/**
 * Monta o `EstadoRegua` a partir da linha e dos fatos. PURA.
 *
 * Faz uma derivação que a régua não faz sozinha: se o cliente escreveu DEPOIS
 * do último toque, a sequência está morta (`RESPONDEU`) — "qualquer resposta
 * encerra a sequência". A régua trata isso como estado terminal; o fato, aqui,
 * vem do `last_inbound_at` da conversa.
 */
export function montarEstado(
	args: {
		objetivo: string;
		status: StatusRegua;
		motivoSaida: string | null;
		fatos: FatosDaLinha;
		toquesNaJanela: readonly Date[];
		simulacaoEm: Date | null;
		/** Opt-out por pessoa (`contacts.remarketing_optout_at`) — terminal. */
		optoutDaPessoaEm: Date | null;
	},
	parametros: ParametrosRegua = PARAMETROS_DE_FABRICA,
): EstadoRegua {
	const { objetivo, status, motivoSaida, fatos, toquesNaJanela, simulacaoEm } = args;
	// A coluna `ultimo_toque_em` é a fonte; a derivação é fallback de linha antiga
	// (e usa a cadência vigente, para o fallback não mentir depois de um ajuste).
	const ultimoToqueEm = ultimoToqueDoFato(fatos, parametros);

	// Resposta posterior ao último toque mata a sequência; a reentrada por
	// simulação posterior é decisão da régua (`podeDisparar`), não daqui.
	const respondeuDepoisDoToque =
		status === "ATIVO" &&
		fatos.ultimoInboundEm !== null &&
		ultimoToqueEm !== null &&
		fatos.ultimoInboundEm.getTime() > ultimoToqueEm.getTime();

	return {
		objetivo,
		status: respondeuDepoisDoToque ? "RESPONDEU" : status,
		step: fatos.step as EstadoRegua["step"],
		// No começo do ciclo (step 0) quem manda é o silêncio: com `next_touch_at`
		// zerado, `agendamento` recalcula a partir do ÚLTIMO inbound. É o que
		// empurra o toque 01 de novo quando o cliente volta a falar antes dos 90
		// minutos — sem isto a linha vencida dispararia com a conversa viva.
		nextTouchAt: fatos.step === 0 ? null : fatos.nextTouchAt,
		ultimoToqueEm,
		toquesNaJanela,
		simulacaoEm,
		ultimoInboundEm: fatos.ultimoInboundEm,
		motivoSaida: respondeuDepoisDoToque ? "cliente_respondeu" : motivoSaida,
	};
}

// ─── A decisão ──────────────────────────────────────────────────────────────

/** Por que nada saiu — os motivos da régua mais os que só o motor conhece. */
export type MotivoSemDisparo =
	| MotivoBloqueio
	| "optout_da_pessoa"
	| "telefone_interno"
	| "sem_destino"
	| "teto_de_retomadas";

export type AcaoRemarketing =
	| { tipo: "nada"; motivo: MotivoSemDisparo }
	| {
			tipo: "turno_de_retomada";
			passo: PassoDisparo;
			/** Caminho público da arte que acompanha a fala do agente; `null`
			 * quando o bem não é conhecido — o toque sai só com o texto. */
			arte: string | null;
	  }
	| { tipo: "template"; passo: PassoDisparo; usageKey: string };

export interface EntradaDoMotor {
	agora: Date;
	/** Estado já montado pelo ciclo (com `toquesNaJanela` da pessoa). */
	estado: EstadoRegua;
	/** Destino E.164 do cliente; `null` quando não há telefone resolvido. */
	telefone: string | null;
	/** `contacts.remarketing_optout_at` — opt-out por pessoa. */
	optoutDaPessoaEm?: Date | null;
	/** `podeRetomar` da retomada (MAX_RETOMADAS + backoff), para o turno. */
	retomadaPermitida?: boolean;
	/**
	 * O telefone é de um atendente ATIVO no banco? O ciclo resolve (é I/O);
	 * o motor só decide. Soma-se à lista de telefones internos em código.
	 */
	telefoneDaEquipe?: boolean;
	/**
	 * Os parâmetros vigentes da régua — o ajuste do cadastro, já validado por
	 * `normalizarParametros`. Ausente = padrão de fábrica (comportamento de
	 * sempre). É por aqui que `remarketing_config` chega ao motor: a régua
	 * continua pura, quem lê o banco é o ciclo.
	 */
	parametros?: ParametrosRegua;
}

export interface DecisaoDoMotor {
	acao: AcaoRemarketing;
	/**
	 * O estado a GRAVAR quando há mudança real — `null` quando nada muda.
	 *
	 * Nulo de propósito nos bloqueios transitórios (horário, teto, aguardando):
	 * gravar ali reescreveria `next_touch_at` (e quebraria a derivação do último
	 * toque) sem necessidade — a linha já está vencida e volta no próximo ciclo.
	 */
	proximoEstado: EstadoRegua | null;
	/** Contagem para a coluna `touches_30d`, derivada do estado. */
	touches30d: number;
}

/** O telefone pertence à equipe? Compara por chave canônica do BR, então o
 * nono dígito e o DDI não driblam a guarda. */
export function ehTelefoneInterno(
	telefone: string | null,
	lista: readonly string[] = TELEFONES_INTERNOS,
): boolean {
	if (!telefone) return false;
	return lista.some((interno) => chaveTelefoneBR(interno) === chaveTelefoneBR(telefone));
}

/**
 * A decisão pura: entra o estado + os fatos, sai o efeito e o próximo estado.
 *
 * Ordem dos guardas — ela importa:
 *   1. opt-out da PESSOA (vence tudo, inclusive reentrada);
 *   2. destino e telefone interno;
 *   3. a régua (`podeDisparar`) — que já cobre terminal, teto, horário e data;
 *   4. entrega: texto livre → turno de retomada (respeitando MAX_RETOMADAS);
 *      template → `usageKey` do objetivo.
 */
export function decidir(entrada: EntradaDoMotor): DecisaoDoMotor {
	const { agora, estado, telefone } = entrada;
	const optout = entrada.optoutDaPessoaEm ?? null;
	const parametros = entrada.parametros ?? PARAMETROS_DE_FABRICA;

	const semDisparo = (
		motivo: MotivoSemDisparo,
		proximoEstado: EstadoRegua | null = null,
	): DecisaoDoMotor => ({
		acao: { tipo: "nada", motivo },
		proximoEstado,
		touches30d: contarToquesNaJanela(proximoEstado ?? estado, agora, parametros),
	});

	// 1. Opt-out por PESSOA: terminal e gravado na régua para sair do índice.
	if (optout || estado.status === "OPTOUT") {
		const jaGravado = estado.status === "OPTOUT";
		return semDisparo(
			"optout_da_pessoa",
			jaGravado ? null : registrarOptout(estado, optout ?? agora),
		);
	}

	// 2. Sem telefone não há destino; telefone da equipe nunca recebe toque.
	if (!telefone) return semDisparo("sem_destino");
	if (entrada.telefoneDaEquipe === true || ehTelefoneInterno(telefone)) {
		return semDisparo("telefone_interno");
	}

	// 3. A régua decide SE pode sair.
	const pode = podeDisparar(estado, agora, parametros);
	if (!pode.pode) {
		return semDisparo(pode.motivo, normalizarSequenciaMorta(estado));
	}

	// 4. COMO entregar.
	// O toque SAIU: registra uma vez e usa o mesmo estado para contagem e gravação.
	const proximoEstado = registrarToque(estado, agora, parametros);
	const touches30d = contarToquesNaJanela(proximoEstado, agora, parametros);

	if (pode.entrega === "texto_livre") {
		if (entrada.retomadaPermitida === false) {
			return semDisparo("teto_de_retomadas");
		}
		return {
			acao: { tipo: "turno_de_retomada", passo: pode.step, arte: arteDoObjetivo(estado.objetivo) },
			proximoEstado,
			touches30d,
		};
	}

	return {
		acao: { tipo: "template", passo: pode.step, usageKey: templateDoObjetivo(estado.objetivo) },
		proximoEstado,
		touches30d,
	};
}

/**
 * Sequência morta sem reentrada: grava o status terminal para a linha sair do
 * índice parcial (`WHERE status = 'ATIVO'`). Sem isto ela seria relida a cada
 * 30 s para sempre. Já normalizada (ou terminal), não há o que gravar.
 */
function normalizarSequenciaMorta(estado: EstadoRegua): EstadoRegua | null {
	if (estado.status !== "RESPONDEU" && estado.status !== "ESGOTADO") return null;
	return {
		...estado,
		motivoSaida:
			estado.motivoSaida ??
			(estado.status === "RESPONDEU" ? "cliente_respondeu" : "tres_toques_sem_resposta"),
	};
}

// ─── Opt-out: a manifestação do cliente ─────────────────────────────────────

/**
 * O cliente PEDIU para sair? Predicado conservador, sobre o texto do inbound.
 *
 * ── Por que uma lista de frases AQUI, se o CLAUDE.md abomina lista de frases ─
 *
 * Porque o anti-padrão que ele descreve é outro: é colher uma fala de TOM da
 * produção e amordaçá-la com regex. Opt-out não é tom — é o FATO terminal mais
 * forte do canal, e a régua inteira depende dele: sem marcar, o remarketing
 * segue mandando para quem pediu para parar, que é o dano que a Meta pune e o
 * cliente sente. É o caso 2 do teste de decisão ("o dado vai para o banco").
 *
 * A lista é DELIBERADAMENTE conservadora: só entram formulações explícitas de
 * "pare de me mandar". Dúvida não marca (o custo de um falso positivo é perder
 * um cliente vivo); a mesa continua podendo marcar à mão. A âncora é o campo
 * `contacts.remarketing_optout_at` — não a frase.
 */
const FRASES_DE_OPTOUT = [
	"parar de receber",
	"pare de receber",
	"para de receber",
	"parar de mandar",
	"pare de mandar",
	"para de mandar",
	"parar de enviar",
	"pare de enviar",
	"de me mandar",
	"de me enviar",
	"de me chamar",
	"de me contatar",
	"de me perturbar",
	"nao quero receber",
	"nao quero mais receber",
	"nao receber mais",
	"nao quero mais mensagem",
	"nao quero mais nada",
	"nao me mande",
	"nao me mandar",
	"nao me envie",
	"nao me chame",
	"nao me contate",
	"nao perturbe",
	"sair da lista",
	"me remove",
	"me remover",
	"me tira da lista",
	"remove meu numero",
	"remover meu numero",
	"descadastr",
	"desinscrev",
	"cancelar mensagens",
	"cancelar o recebimento",
	"chega de mensagem",
	"bloqueia meu numero",
];

/** O texto é, INTEIRO (sem sobras), um pedido de sair? */
const RESPOSTAS_CURTAS_DE_OPTOUT = new Set([
	"pare",
	"parar",
	"sair",
	"cancelar",
	"stop",
	"nao quero mais",
	"descadastrar",
	"me tira",
	"opt out",
	"opt-out",
]);

/** Verbo que, em fala CURTA, só pede uma coisa: que a gente pare. "Cancelar"
 * fica de fora de propósito — "quero cancelar" é o contrato, não o
 * remarketing, e marcar isso perderia um cliente vivo. */
const VERBOS_DE_PARADA = ["pare", "parar", "stop"];

function normalizarFala(texto: string): string {
	return texto
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function ehPedidoDeOptout(texto: string): boolean {
	const fala = normalizarFala(texto);
	if (!fala) return false;
	if (RESPOSTAS_CURTAS_DE_OPTOUT.has(fala)) return true;

	// Fala curta com verbo de parada (ex.: "por favor pare", "pare") — é pedido.
	const palavras = fala.split(" ");
	if (palavras.length <= 4 && palavras.some((p) => VERBOS_DE_PARADA.includes(p))) return true;

	return FRASES_DE_OPTOUT.some((frase) => fala.includes(frase));
}

// Reexport para o teste conferir os nomes dos motivos sem importar `regua`.
export type { MotivoBloqueio };
