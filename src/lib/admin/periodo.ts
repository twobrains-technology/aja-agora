/**
 * O PERÍODO que o painel lê — num lugar só, e no fuso do negócio.
 *
 * Nasceu em 24/08/2026 com o pedido de abrir tudo em HOJE, e o pedido não cabia
 * no que existia: o padrão de 30 dias estava copiado em oito arquivos (três
 * páginas, quatro rotas e o próprio filtro), e as duas pontas do intervalo
 * estavam erradas de um jeito que só aparece quando a janela encolhe.
 *
 * ── As três armadilhas que este módulo existe para fechar ────────────────────
 *
 * 1. **`new Date("2026-08-24")` é meia-noite UTC**, que no Brasil são 21h do dia
 *    ANTERIOR. A querystring guarda `YYYY-MM-DD` (é o formato do `parseAsIsoDate`
 *    do nuqs), então todo dia que ia para a URL e voltava escorregava um dia para
 *    trás na leitura e na tela. Aqui todo dia solto é ancorado ao MEIO-DIA UTC:
 *    de dentro dele, nenhum fuso do Brasil consegue mudar a data, e a âncora
 *    sobrevive a horário de verão nos dois sentidos. É a mesma escolha que
 *    `diasEntre`, em `performance-queries.ts`, já fazia para o gráfico.
 *
 * 2. **`ate` colava na MEIA-NOITE do último dia**, e não no fim dele. Quem
 *    escolhia "01/08 a 24/08" recebia dados até 23/08 às 21h — perdia um dia e
 *    três horas, calado. Com a janela de 30 dias ninguém percebia; com a janela
 *    de um dia, "hoje" devolveria uma tela vazia e pareceria que a métrica tinha
 *    quebrado de novo.
 *
 * 3. **O dia é o do NEGÓCIO, não o do UTC.** Serializar com
 *    `toISOString().slice(0, 10)` faz "hoje" virar amanhã a partir das 21h de
 *    Brasília — justamente no fim do expediente, quando alguém olha o painel
 *    para fechar o dia.
 *
 * Módulo PURO: sem banco, sem React, sem relógio próprio (o `agora` é sempre
 * injetável). Roda igual no servidor e no navegador, que é o ponto — as duas
 * pontas precisam concordar sobre onde o dia começa.
 */

/** O fuso que o negócio enxerga. A operação é brasileira; o servidor é UTC. */
export const TZ_NEGOCIO = "America/Sao_Paulo";

const FORMATO_DO_DIA = new Intl.DateTimeFormat("en-CA", {
	timeZone: TZ_NEGOCIO,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/** O dia do negócio (`YYYY-MM-DD`) em que um instante cai. */
export function diaDoNegocio(instante: Date): string {
	return FORMATO_DO_DIA.format(instante);
}

/**
 * Quanto o fuso do negócio está deslocado do UTC, em minutos, NAQUELE instante.
 *
 * Perguntado ao `Intl` e não cravado em −180: o Brasil não tem horário de verão
 * desde 2019, mas cravar o número transforma uma eventual volta dele num defeito
 * de dados silencioso — a janela inteira andaria uma hora e ninguém saberia por
 * quê.
 */
function deslocamentoEmMinutos(instante: Date): number {
	const partes = new Intl.DateTimeFormat("en-US", {
		timeZone: TZ_NEGOCIO,
		timeZoneName: "longOffset",
	}).formatToParts(instante);

	const rotulo = partes.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
	const casado = /GMT([+-])(\d{2}):(\d{2})/.exec(rotulo);
	if (!casado) return 0;

	const sinal = casado[1] === "-" ? -1 : 1;
	return sinal * (Number(casado[2]) * 60 + Number(casado[3]));
}

/** O instante em que o dia do negócio de `quando` começou. */
export function inicioDoDia(quando: Date): Date {
	const dia = diaDoNegocio(quando);
	const deslocamento = deslocamentoEmMinutos(new Date(`${dia}T12:00:00Z`));
	return new Date(Date.parse(`${dia}T00:00:00Z`) - deslocamento * 60_000);
}

/**
 * O último instante do dia do negócio de `quando` — 23:59:59.999 local.
 *
 * Derivado do início do dia SEGUINTE em vez de somar 24h ao início deste: numa
 * virada de horário de verão o dia tem 23 ou 25 horas, e somar 24 deixaria a
 * janela mordendo o dia vizinho.
 */
export function fimDoDia(quando: Date): Date {
	const diaSeguinte = new Date(Date.parse(`${diaDoNegocio(quando)}T12:00:00Z`) + UM_DIA_MS);
	return new Date(inicioDoDia(diaSeguinte).getTime() - 1);
}

/**
 * O `Date` que representa um DIA na querystring: meio-dia UTC daquele dia.
 *
 * Nunca use `new Date(dia)` para isso — ver a armadilha 1 no topo do arquivo.
 */
export function diaComoData(dia: string): Date {
	return new Date(`${dia}T12:00:00Z`);
}

/**
 * Lê um valor de querystring como instante, sem deixar o dia escorregar.
 *
 * Aceita as duas formas que circulam no painel: o dia puro que o filtro escreve
 * (`2026-08-24`) e o ISO completo que o funil da tela de Performance monta ao
 * levar o período para o Percurso.
 */
export function instanteDoParametro(valor: string): Date | null {
	const data = new Date(SO_DATA.test(valor) ? `${valor}T12:00:00Z` : valor);
	return Number.isNaN(data.getTime()) ? null : data;
}

export interface Periodo {
	de: Date;
	ate: Date;
}

/**
 * O período com que o painel abre: HOJE, inteiro. **Instantes — para consultar.**
 *
 * Era "os últimos 30 dias". Mudou a pedido do Kairo em 24/08/2026 — a pergunta
 * do dia a dia é "o que está acontecendo hoje", e trinta dias diluem justamente
 * o que se quer ver. Os outros períodos continuam a um clique, no filtro.
 *
 * ⚠️ **Não use isto como valor de campo do filtro.** O `ate` é 23:59:59.999
 * local, ou seja, 02:59 UTC do dia SEGUINTE — e o Next renderiza a página no
 * servidor, que roda em UTC. O campo saía do servidor escrito "25/08" e o
 * navegador o reescrevia como "24/08" na hidratação: o operador via a data
 * piscar e trocar. Para o campo existe `diaDeHoje`.
 */
export function periodoPadrao(agora: Date = new Date()): Periodo {
	return { de: inicioDoDia(agora), ate: fimDoDia(agora) };
}

/**
 * HOJE como DIA — o valor que o filtro guarda e mostra.
 *
 * Ancorado ao meio-dia UTC, e é isso que o torna estável: renderizado no
 * servidor (UTC) ou no navegador (Brasília), escreve a mesma data. Quem
 * transforma este dia em janela de tempo é `resolverPeriodo`, do outro lado.
 */
export function diaDeHoje(agora: Date = new Date()): Date {
	return diaComoData(diaDoNegocio(agora));
}

/**
 * Resolve o período pedido na querystring em instantes de verdade.
 *
 * Sempre em DIAS INTEIROS: `de` cola no começo do seu dia e `ate` no fim do
 * dele. É o que faz "hoje" ser um dia e não um ponto, e o que devolve o último
 * dia que a versão anterior comia.
 *
 * Devolve `null` quando alguma das duas datas não é data — quem chama decide se
 * isso vira 400 ou se cai no padrão.
 */
export function resolverPeriodo(
	fromParam: string | null,
	toParam: string | null,
	agora: Date = new Date(),
): Periodo | null {
	const padrao = periodoPadrao(agora);

	const inicio = fromParam ? instanteDoParametro(fromParam) : null;
	if (fromParam && !inicio) return null;

	const fim = toParam ? instanteDoParametro(toParam) : null;
	if (toParam && !fim) return null;

	return {
		de: inicio ? inicioDoDia(inicio) : padrao.de,
		ate: fim ? fimDoDia(fim) : padrao.ate,
	};
}
