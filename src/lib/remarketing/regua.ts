/**
 * A RÉGUA DE REMARKETING — o predicado PURO.
 *
 * Fonte de verdade: Remarketing_WhatsApp_V3.pdf (13/09). O que ele manda:
 * até 3 toques em 7 dias para quem conversou e não fechou; qualquer resposta
 * encerra a sequência; no máximo 3 toques por PESSOA a cada 30 dias, contando
 * entre campanhas; opt-out é definitivo; e quem faz nova simulação depois do
 * último toque pode reentrar.
 *
 * ── Por que isto é um módulo puro, e não regra no prompt ────────────────────
 *
 * Contagem de toque, teto de 30 dias e janela de horário são FACTS do servidor:
 * o modelo não pode inventar "já é o terceiro toque" nem "sua cota reabriu".
 * Vira código determinístico (é a primeira regra do CLAUDE.md). E a régua é
 * consultada a cada 30s pelo motor — o que ela decidir tem que ser reproduzível
 * e provável em teste, sem banco e sem relógio escondido: `agora` entra por
 * parâmetro, como em `src/lib/admin/periodo.ts`, e quem grava no banco é o
 * bloco 2. Este arquivo não importa client de banco, não faz I/O e não lê
 * `Date.now()`.
 *
 * ── As decisões de desenho que o PDF não fixa ───────────────────────────────
 *
 * 1. **Toque 03 = +5 dias do 02.** O PDF diz "4 a 7 dias"; 5 é a decisão do
 *    dono. Fica em UM parâmetro nomeado (`diasAteTerceiroToque`, fábrica 5) para
 *    mudar sem caçar número solto — e é o cadastro (`remarketing_config`) que o
 *    ajusta, sem deploy. Os oito parâmetros da régua estão em
 *    `ParametrosRegua`/`PARAMETROS_DE_FABRICA`: o código é o padrão, o banco é o
 *    ajuste, linha ausente é fábrica.
 * 2. **A janela de 24h da Meta virou MODO DE ENTREGA, não motivo de bloqueio.**
 *    Ela não pode barrar o toque 01: o primeiro toque sai 90 min depois do
 *    silêncio, ou seja, SEMPRE dentro das 24h — barrar ali mataria a régua
 *    inteira. O que a janela decide é se o toque pode ir como texto livre
 *    (dentro das 24h do último inbound) ou se precisa de template aprovado
 *    (fora). É o campo `entrega`, e é o que o motor usa para escolher o envio.
 * 3. **O teto é "por pessoa", e por isso o estado carrega a LISTA de toques da
 *    janela** (`toquesNaJanela`), não só o contador. A coluna `touches_30d` é a
 *    contagem derivada (`contarToquesNaJanela`); sem os instantes não dá para
 *    responder a pergunta que o teto faz — quando a cota reabre. Contador sem
 *    data não sabe cair sozinho.
 * 4. **A janela do teto é aberta em 30 dias**: um toque conta enquanto não fez
 *    30 dias, e sai da conta exatamente no instante em que faz — que é o mesmo
 *    instante devolvido por `proximoToque` como a reabertura da cota.
 * 5. **`registrarToque` respeita só os terminais** (opt-out, conversão, e a
 *    sequência morta sem nova simulação). Horário, teto e silêncio são do
 *    `podeDisparar`: quem decide SE dispara é ele; o registro registra o que
 *    aconteceu.
 */

import { TZ_NEGOCIO } from "@/lib/admin/periodo";

// ─── As constantes da régua ─────────────────────────────────────────────────

/** O "não respondeu em 1h30" — silêncio que abre o toque 01. */
export const ESPERA_SILENCIO_MS = 90 * 60 * 1000;

/** Toque 02 = +3 dias do 01. */
export const DIAS_ATE_SEGUNDO_TOQUE = 3;

/** Toque 03 = +5 dias do 02 (o PDF diz 4 a 7; 5 é a decisão do dono). */
export const DIAS_ATE_TERCEIRO_TOQUE = 5;

/** Três toques e a sequência se esgota. */
export const MAX_TOQUES = 3;

/** Teto de toques por pessoa na janela deslizante — global, entre campanhas. */
export const TETO_TOQUES_30_DIAS = 3;

/** A janela do teto, em milissegundos: 30 dias. */
export const JANELA_DO_TETO_MS = 30 * 24 * 60 * 60 * 1000;

/** A janela de 24h da Meta Cloud API, em milissegundos. */
export const JANELA_24H_MS = 24 * 60 * 60 * 1000;

/** A régua acorda às 9h e para às 20h, no fuso do negócio (fim exclusivo). */
export const HORA_ABERTURA = 9;
export const HORA_FECHAMENTO = 20;

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

// ─── Os parâmetros: o padrão de fábrica e o ajuste do cadastro ──────────────

/**
 * Os oito números que dizem COMO a régua funciona, na unidade em que o motor os
 * usa (milissegundos, dias, horas).
 *
 * Nasceram constantes deste arquivo e continuam sendo o PADRÃO DE FÁBRICA
 * (`PARAMETROS_DE_FABRICA`, logo abaixo). O que mudou é que agora podem ser
 * ajustados pelo cadastro (`remarketing_config`, lido por
 * `@/lib/admin/remarketing-config`): **o código é o padrão, o banco é o ajuste**,
 * e linha ausente significa fábrica. É essa ordem que faz a tabela nascer vazia
 * sem mudar comportamento nenhum.
 *
 * Isto NÃO faz a régua tocar banco — ela continua pura. Quem lê o cadastro
 * (o ciclo, no servidor) passa o objeto pronto por parâmetro; quando ninguém
 * passa, vale a fábrica, que é exatamente o comportamento de antes.
 */
export interface ParametrosRegua {
	/** O "não respondeu em 1h30" — silêncio que abre o toque 01. */
	esperaSilencioMs: number;
	/** Toque 02 = +N dias do 01. */
	diasAteSegundoToque: number;
	/** Toque 03 = +N dias do 02. */
	diasAteTerceiroToque: number;
	/** N toques e a sequência se esgota. */
	maxToques: number;
	/** Teto de toques por pessoa na janela deslizante — global, entre campanhas. */
	tetoToques30Dias: number;
	/** A janela do teto, em milissegundos. */
	janelaDoTetoMs: number;
	/** A régua acorda a esta hora, no fuso do negócio. */
	horaAbertura: number;
	/** E para a esta hora (fim exclusivo). */
	horaFechamento: number;
}

/** O comportamento de sempre: as constantes deste arquivo, nomeadas. */
export const PARAMETROS_DE_FABRICA: ParametrosRegua = {
	esperaSilencioMs: ESPERA_SILENCIO_MS,
	diasAteSegundoToque: DIAS_ATE_SEGUNDO_TOQUE,
	diasAteTerceiroToque: DIAS_ATE_TERCEIRO_TOQUE,
	maxToques: MAX_TOQUES,
	tetoToques30Dias: TETO_TOQUES_30_DIAS,
	janelaDoTetoMs: JANELA_DO_TETO_MS,
	horaAbertura: HORA_ABERTURA,
	horaFechamento: HORA_FECHAMENTO,
};

/** A ordem canônica dos campos — a mesma que a tela de cadastro percorre. */
export const CAMPOS_DOS_PARAMETROS: readonly (keyof ParametrosRegua)[] = [
	"esperaSilencioMs",
	"diasAteSegundoToque",
	"diasAteTerceiroToque",
	"maxToques",
	"tetoToques30Dias",
	"janelaDoTetoMs",
	"horaAbertura",
	"horaFechamento",
];

/**
 * A faixa aceita de cada parâmetro, na unidade do motor. Fora dela — ou valor
 * não-inteiro — a régua RECUSA o ajuste e vale a fábrica.
 *
 * O viés é deliberado e é o mesmo de sempre: na dúvida, menos toque, não mais.
 * Um teto cadastrado como 100 no lugar de 3 mandaria mensagem para quem já
 * disse que não quer; um `diasAteSegundoToque` gigante só atrasa. O limite
 * existe para que o cadastro não consiga transformar a régua em spam.
 */
export const LIMITES_DOS_PARAMETROS: Record<
	keyof ParametrosRegua,
	{ minimo: number; maximo: number }
> = {
	esperaSilencioMs: { minimo: 60_000, maximo: 24 * HORA_MS }, // 1 min a 24 h
	diasAteSegundoToque: { minimo: 1, maximo: 30 },
	diasAteTerceiroToque: { minimo: 1, maximo: 60 },
	maxToques: { minimo: 1, maximo: 5 },
	tetoToques30Dias: { minimo: 1, maximo: 10 },
	janelaDoTetoMs: { minimo: 24 * HORA_MS, maximo: 366 * DIA_MS },
	horaAbertura: { minimo: 0, maximo: 23 },
	horaFechamento: { minimo: 1, maximo: 24 },
};

/**
 * O valor é aceito neste campo? Inteiro, dentro da faixa e — no caso do par de
 * horário — numa janela que acorda antes de parar.
 *
 * `demais` existe para julgar o par: validar `horaAbertura` sozinho aceitaria
 * 22h com fechamento às 6h, e a régua passaria a falar de madrugada.
 */
export function parametroValido(
	campo: keyof ParametrosRegua,
	valor: number,
	demais: Partial<ParametrosRegua> = {},
): boolean {
	if (!Number.isInteger(valor)) return false;
	const faixa = LIMITES_DOS_PARAMETROS[campo];
	if (valor < faixa.minimo || valor > faixa.maximo) return false;

	const abertura =
		campo === "horaAbertura" ? valor : (demais.horaAbertura ?? PARAMETROS_DE_FABRICA.horaAbertura);
	const fechamento =
		campo === "horaFechamento"
			? valor
			: (demais.horaFechamento ?? PARAMETROS_DE_FABRICA.horaFechamento);
	return abertura < fechamento;
}

/**
 * O objeto SEMPRE válido: só os campos válidos do parcial entram; o resto vem
 * da fábrica. É a rede de proteção do cadastro — valor corrompido no banco não
 * derruba a régua nem a faz disparar mais, ela simplesmente ignora o ajuste.
 */
export function normalizarParametros(parcial: Partial<ParametrosRegua>): ParametrosRegua {
	const resultado: ParametrosRegua = { ...PARAMETROS_DE_FABRICA };

	for (const campo of CAMPOS_DOS_PARAMETROS) {
		const valor = parcial[campo];
		if (valor === undefined) continue;
		if (!parametroValido(campo, valor, parcial)) continue;
		resultado[campo] = valor;
	}

	// O par de horário vale junto ou não vale: uma janela invertida não é "quase
	// certa", é a régua calada de manhã e falando de madrugada.
	if (resultado.horaAbertura >= resultado.horaFechamento) {
		resultado.horaAbertura = PARAMETROS_DE_FABRICA.horaAbertura;
		resultado.horaFechamento = PARAMETROS_DE_FABRICA.horaFechamento;
	}

	return resultado;
}

// ─── Estado ─────────────────────────────────────────────────────────────────

/**
 * `ATIVO` = na régua · `RESPONDEU` = resposta encerrou a sequência ·
 * `ESGOTADO` = três toques sem resposta · `OPTOUT` = pediu para sair (terminal,
 * vence tudo) · `CONVERTEU` = fechou (terminal).
 */
export type StatusRegua = "ATIVO" | "RESPONDEU" | "ESGOTADO" | "OPTOUT" | "CONVERTEU";

/** 0 = nada disparado ainda; 1, 2, 3 = o toque que já saiu. */
export type PassoRegua = 0 | 1 | 2 | 3;

/** O toque que o próximo disparo seria. */
export type PassoDisparo = 1 | 2 | 3;

/**
 * Como o toque pode ser entregue na Meta: texto livre só dentro das 24h do
 * último inbound do cliente; fora disso, template aprovado.
 */
export type Entrega = "texto_livre" | "template";

export type MotivoBloqueio =
	| "optout"
	| "converteu"
	| "ja_respondeu"
	| "esgotado"
	| "teto_30_dias"
	| "aguardando_data"
	| "fora_da_janela_de_horario";

export type ResultadoDisparo =
	| { pode: true; step: PassoDisparo; entrega: Entrega }
	| { pode: false; motivo: MotivoBloqueio };

/** Os motivos gravados em `remarketing_touches.motivo_saida`. */
export type MotivoSaida = "cliente_respondeu" | "tres_toques_sem_resposta" | "optout_do_cliente";

/**
 * O estado da régua — a linha de `remarketing_touches`, mais o que ela precisa
 * saber. `objetivo` é contexto (escolhe o template), não entrada de decisão;
 * vai e volta intacto.
 */
export interface EstadoRegua {
	/** `carro` · `moto` · `imovel` — o eixo comercial do disparo. */
	objetivo: string;
	status: StatusRegua;
	step: PassoRegua;
	/** Quando o próximo toque pode sair; null quando não há mais toque. */
	nextTouchAt: Date | null;
	/** Quando saiu o último toque. */
	ultimoToqueEm: Date | null;
	/**
	 * Instantes dos toques do CLIENTE dentro da janela do teto — base do teto
	 * deslizante e global. É esta lista que faz a cota cair sozinha.
	 */
	toquesNaJanela: readonly Date[];
	/** Quando o cliente fez a última simulação — o que permite a reentrada. */
	simulacaoEm: Date | null;
	/** Último inbound do cliente: silêncio de 90 min e janela de 24h da Meta. */
	ultimoInboundEm: Date | null;
	/** Por que saiu da régua; null enquanto está ativa. */
	motivoSaida: string | null;
}

/** Um estado novo, ainda intocado. O único campo obrigatório é o objetivo. */
export function estadoInicial(
	entrada: { objetivo: string } & Partial<Omit<EstadoRegua, "objetivo">>,
): EstadoRegua {
	return {
		status: "ATIVO",
		step: 0,
		nextTouchAt: null,
		ultimoToqueEm: null,
		toquesNaJanela: [],
		simulacaoEm: null,
		ultimoInboundEm: null,
		motivoSaida: null,
		...entrada,
	};
}

// ─── A decisão ──────────────────────────────────────────────────────────────

/**
 * O toque pode sair agora? Quando não pode, o `motivo` diz exatamente por quê —
 * é ele que o motor grava em log, e um motivo genérico não serve.
 */
export function podeDisparar(
	estado: EstadoRegua,
	agora: Date,
	parametros: ParametrosRegua = PARAMETROS_DE_FABRICA,
): ResultadoDisparo {
	// Terminais: opt-out vence tudo, conversão também.
	if (estado.status === "OPTOUT") return { pode: false, motivo: "optout" };
	if (estado.status === "CONVERTEU") return { pode: false, motivo: "converteu" };

	// Sequência morta: só reabre com simulação POSTERIOR ao último toque.
	const morta = estado.status === "RESPONDEU" || estado.status === "ESGOTADO";
	const reentrada = morta && houveNovaSimulacao(estado);
	if (morta && !reentrada) {
		return { pode: false, motivo: estado.status === "RESPONDEU" ? "ja_respondeu" : "esgotado" };
	}

	// Teto deslizante e global — antes da data, porque é ele que empurra a data.
	if (contarToquesNaJanela(estado, agora, parametros) >= parametros.tetoToques30Dias) {
		return { pode: false, motivo: "teto_30_dias" };
	}

	const passo = (reentrada ? 0 : estado.step) + 1;
	if (passo > parametros.maxToques) return { pode: false, motivo: "esgotado" };

	// Sem agendamento não há toque: a régua nunca dispara sem data de referência.
	const quando = agendamento(estado, reentrada, parametros);
	if (!quando || agora.getTime() < quando.getTime()) {
		return { pode: false, motivo: "aguardando_data" };
	}

	if (!dentroDaJanelaDeHorario(agora, parametros)) {
		return { pode: false, motivo: "fora_da_janela_de_horario" };
	}

	return { pode: true, step: passo as PassoDisparo, entrega: entregaDe(estado, agora) };
}

/**
 * A data do próximo toque — já empurrada para dentro da janela de horário — ou
 * `null` quando não há mais toque.
 *
 * Um toque vencido devolve o instante vencido: significa "já podia ter saído, o
 * motor dispara no próximo ciclo". Quando o teto de 30 dias está cheio, a data
 * é a QUEDA do toque mais antigo da janela — é ali que a cota reabre.
 */
export function proximoToque(
	estado: EstadoRegua,
	agora: Date,
	parametros: ParametrosRegua = PARAMETROS_DE_FABRICA,
): Date | null {
	if (estado.status === "OPTOUT" || estado.status === "CONVERTEU") return null;

	const morta = estado.status === "RESPONDEU" || estado.status === "ESGOTADO";
	const reentrada = morta && houveNovaSimulacao(estado);
	if (morta && !reentrada) return null;

	if (contarToquesNaJanela(estado, agora, parametros) >= parametros.tetoToques30Dias) {
		const queda = quedaDoToqueMaisAntigo(estado, agora, parametros);
		return queda ? empurrarParaJanela(queda, agora, parametros) : null;
	}

	const quando = agendamento(estado, reentrada, parametros);
	if (!quando) return null;

	return empurrarParaJanela(quando, agora, parametros);
}

// ─── As transições (puras: devolvem o próximo estado) ───────────────────────

/**
 * Registra que o toque saiu.
 *
 * Na reentrada o ciclo recomeça do zero — o `step` gravado é 1 (o primeiro
 * toque do ciclo novo), nunca 4.
 */
export function registrarToque(
	estado: EstadoRegua,
	agora: Date,
	parametros: ParametrosRegua = PARAMETROS_DE_FABRICA,
): EstadoRegua {
	if (estado.status === "OPTOUT" || estado.status === "CONVERTEU") return estado;

	const morta = estado.status === "RESPONDEU" || estado.status === "ESGOTADO";
	const reentrada = morta && houveNovaSimulacao(estado);
	if (morta && !reentrada) return estado;

	const passo = (reentrada ? 0 : estado.step) + 1;
	if (passo > parametros.maxToques) return estado;

	const esgotou = passo >= parametros.maxToques;

	return {
		...estado,
		status: esgotou ? "ESGOTADO" : "ATIVO",
		step: passo as PassoRegua,
		motivoSaida: esgotou ? "tres_toques_sem_resposta" : null,
		ultimoToqueEm: agora,
		toquesNaJanela: [...podarForaDaJanela(estado.toquesNaJanela, agora, parametros), agora],
		nextTouchAt: esgotou
			? null
			: new Date(agora.getTime() + intervaloAteProximo(passo, parametros)),
	};
}

/**
 * Registra resposta do cliente: qualquer resposta encerra a sequência, mesmo
 * com o próximo toque já agendado (e mesmo vencido).
 *
 * Opt-out e conversão não são rebaixados: a última palavra anterior continua
 * valendo.
 */
export function registrarResposta(estado: EstadoRegua, agora: Date): EstadoRegua {
	if (estado.status === "OPTOUT" || estado.status === "CONVERTEU") return estado;

	return {
		...estado,
		status: "RESPONDEU",
		motivoSaida: "cliente_respondeu",
		nextTouchAt: null,
		ultimoInboundEm: agora,
	};
}

/** Registra opt-out: terminal, e nenhum estado posterior volta a permitir disparo. */
export function registrarOptout(estado: EstadoRegua, agora: Date): EstadoRegua {
	return {
		...estado,
		status: "OPTOUT",
		motivoSaida: "optout_do_cliente",
		nextTouchAt: null,
		ultimoInboundEm: agora,
	};
}

// ─── Consultas de apoio (exportadas porque o motor também pergunta) ─────────

/**
 * Quantos toques do cliente caíram na janela deslizante de 30 dias — o valor
 * que o motor grava em `touches_30d`. A janela é ABERTA em 30 dias: o toque
 * deixa de contar no instante exato em que completa 30 dias.
 */
export function contarToquesNaJanela(
	estado: EstadoRegua,
	agora: Date,
	parametros: ParametrosRegua = PARAMETROS_DE_FABRICA,
): number {
	const limite = agora.getTime() - parametros.janelaDoTetoMs;
	return estado.toquesNaJanela.filter((toque) => toque.getTime() > limite).length;
}

/** A régua está no horário em que pode falar (fábrica: 9h–20h no fuso do negócio)? */
export function dentroDaJanelaDeHorario(
	instante: Date,
	parametros: ParametrosRegua = PARAMETROS_DE_FABRICA,
): boolean {
	const hora = horaLocal(instante);
	return hora >= parametros.horaAbertura && hora < parametros.horaFechamento;
}

// ─── Miolo ──────────────────────────────────────────────────────────────────

/** Nova simulação DEPOIS do último toque é o único caminho de volta. */
function houveNovaSimulacao(estado: EstadoRegua): boolean {
	const { simulacaoEm, ultimoToqueEm } = estado;
	return (
		simulacaoEm !== null &&
		ultimoToqueEm !== null &&
		simulacaoEm.getTime() > ultimoToqueEm.getTime()
	);
}

/**
 * Quando o próximo toque está agendado. Com `nextTouchAt` gravado, ele manda;
 * no começo do ciclo (step 0) a data sai do silêncio do cliente — é o mesmo
 * cálculo, só que sem depender de o motor ter materializado a coluna.
 */
function agendamento(
	estado: EstadoRegua,
	reentrada: boolean,
	parametros: ParametrosRegua,
): Date | null {
	if (reentrada) {
		return estado.simulacaoEm
			? new Date(estado.simulacaoEm.getTime() + parametros.esperaSilencioMs)
			: null;
	}
	if (estado.nextTouchAt) return estado.nextTouchAt;
	if (estado.step === 0 && estado.ultimoInboundEm) {
		return new Date(estado.ultimoInboundEm.getTime() + parametros.esperaSilencioMs);
	}
	return null;
}

/** A janela de 24h da Meta decide só a forma do envio — ver decisão 2 no topo. */
function entregaDe(estado: EstadoRegua, agora: Date): Entrega {
	const inbound = estado.ultimoInboundEm;
	if (inbound && agora.getTime() - inbound.getTime() < JANELA_24H_MS) return "texto_livre";
	return "template";
}

/** +N dias do 01 para o 02; +N dias do 02 para o 03 (fábrica: 3 e 5). */
function intervaloAteProximo(passo: number, parametros: ParametrosRegua): number {
	return (passo === 1 ? parametros.diasAteSegundoToque : parametros.diasAteTerceiroToque) * DIA_MS;
}

/** A queda do toque mais antigo ainda na janela: quando o teto reabre. */
function quedaDoToqueMaisAntigo(
	estado: EstadoRegua,
	agora: Date,
	parametros: ParametrosRegua,
): Date | null {
	const limite = agora.getTime() - parametros.janelaDoTetoMs;
	const naJanela = estado.toquesNaJanela.filter((toque) => toque.getTime() > limite);
	if (naJanela.length === 0) return null;

	const maisAntigo = naJanela.reduce((menor, toque) =>
		toque.getTime() < menor.getTime() ? toque : menor,
	);
	return new Date(maisAntigo.getTime() + parametros.janelaDoTetoMs);
}

/** Faxina: toque que já saiu da janela não serve para nada daqui pra frente. */
function podarForaDaJanela(
	toques: readonly Date[],
	agora: Date,
	parametros: ParametrosRegua,
): Date[] {
	const limite = agora.getTime() - parametros.janelaDoTetoMs;
	return toques.filter((toque) => toque.getTime() > limite);
}

/**
 * O próximo instante possível: se o agendamento cai em hora morta, espera até
 * a abertura seguinte; se já venceu, vale o agora.
 */
function empurrarParaJanela(quando: Date, agora: Date, parametros: ParametrosRegua): Date {
	const referencia = quando.getTime() > agora.getTime() ? quando : agora;
	if (dentroDaJanelaDeHorario(referencia, parametros)) return quando;
	return proximaAbertura(referencia, parametros);
}

// ─── Fuso do negócio ────────────────────────────────────────────────────────

const FORMATO_DA_HORA = new Intl.DateTimeFormat("en-US", {
	timeZone: TZ_NEGOCIO,
	hour: "2-digit",
	hourCycle: "h23",
});

const FORMATO_DO_DIA = new Intl.DateTimeFormat("en-CA", {
	timeZone: TZ_NEGOCIO,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

function horaLocal(instante: Date): number {
	return Number(FORMATO_DA_HORA.format(instante));
}

/** O dia do negócio (`YYYY-MM-DD`) em que um instante cai. */
function diaDoNegocio(instante: Date): string {
	return FORMATO_DO_DIA.format(instante);
}

/**
 * O instante em que o dia do negócio começou — a mesma construção de
 * `src/lib/admin/periodo.ts`, perguntando o deslocamento ao `Intl` em vez de
 * cravar −03:00 (uma volta do horário de verão não pode andar a janela calada).
 */
function deslocamentoEmMinutos(instante: Date): number {
	const partes = new Intl.DateTimeFormat("en-US", {
		timeZone: TZ_NEGOCIO,
		timeZoneName: "longOffset",
	}).formatToParts(instante);

	const rotulo = partes.find((parte) => parte.type === "timeZoneName")?.value ?? "GMT+00:00";
	const casado = /GMT([+-])(\d{2}):(\d{2})/.exec(rotulo);
	if (!casado) return 0;

	const sinal = casado[1] === "-" ? -1 : 1;
	return sinal * (Number(casado[2]) * 60 + Number(casado[3]));
}

/** O instante do fuso do negócio num dia, a uma hora cheia local. */
function instanteLocal(dia: string, hora: number): Date {
	const deslocamento = deslocamentoEmMinutos(new Date(`${dia}T12:00:00Z`));
	return new Date(Date.parse(`${dia}T00:00:00Z`) + hora * HORA_MS - deslocamento * 60_000);
}

/** A próxima abertura da janela de horário: hoje na hora cadastrada, ou amanhã. */
function proximaAbertura(instante: Date, parametros: ParametrosRegua): Date {
	const dia = diaDoNegocio(instante);
	if (horaLocal(instante) < parametros.horaAbertura) {
		return instanteLocal(dia, parametros.horaAbertura);
	}

	// Meio-dia UTC âncora o dia seguinte sem escorregar de fuso (periodo.ts).
	const amanha = diaDoNegocio(new Date(Date.parse(`${dia}T12:00:00Z`) + DIA_MS));
	return instanteLocal(amanha, parametros.horaAbertura);
}
