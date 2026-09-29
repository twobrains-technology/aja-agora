/**
 * A RÉGUA NA TELA — a derivação PURA do que `/admin/remarketing` mostra.
 *
 * A régua (bloco 1) sabe SE o toque sai; o motor (bloco 2) sabe COMO entregar.
 * O que faltava era a terceira pergunta, a do dono do produto: **quem está na
 * régua, em que passo, e por que saiu**. Este arquivo responde isso a partir da
 * linha de `remarketing_touches` — sem banco, sem relógio escondido (`agora`
 * entra por parâmetro, como em `regua.ts`) e sem inventar vocabulário: os
 * status são os do enum `remarketing_touch_status` e os motivos, os do motor.
 *
 * ── Por que a classificação mora AQUI, e não em SQL ─────────────────────────
 *
 * A tela precisa de uma classificação por linha (situação), de contadores e de
 * dois guardas de ação. Escrever o mesmo `CASE WHEN` na consulta e em TS daria
 * duas verdades para "quem respondeu" — e a divergência apareceria como um
 * contador que não fecha com a lista logo abaixo dele, que é o defeito clássico
 * de painel. Aqui a consulta devolve as COLUNAS e a classificação existe uma
 * vez só, testável sem banco.
 *
 * ── SEGURAR usa um status que o predicado já respeita ───────────────────────
 *
 * Não existe status `PAUSADO` no enum, e a instrução do bloco é não criar um
 * nem mexer em `regua.ts`. O escolhido é **`RESPONDEU`**, e o motivo é
 * mecânico, não estético:
 *
 *   1. o ciclo lê só `WHERE status = 'ATIVO'` (`listarVencidas`), então qualquer
 *      status fora de `ATIVO` tira a linha do índice e a régua para de disparar
 *      — inclusive para quem está no passo 0, que é justamente onde um
 *      "segurar" por `next_touch_at = NULL` FALHARIA (o motor recalcula a data a
 *      partir do último inbound quando `step = 0`);
 *   2. `OPTOUT` e `CONVERTEU` são terminais no predicado: usá-los para segurar
 *      tornaria o "soltar" impossível por construção;
 *   3. `ESGOTADO` diria que os três toques saíram, o que é falso;
 *   4. `RESPONDEU` é o único bloqueio REVERSÍVEL da régua — é exatamente a
 *      semântica de "a sequência parou, mas pode voltar".
 *
 * O que separa uma linha segurada de uma que respondeu de verdade é o
 * `motivo_saida` (`MOTIVO_SEGURADO`), e é ele que a tela lê. A distinção não é
 * cosmética: é ela que decide se o botão "soltar" aparece.
 *
 * ── O contato que pediu opt-out é o FATO, não o status ──────────────────────
 *
 * O terminal por pessoa é `contacts.remarketing_optout_at` (ver `motor.ts`): o
 * motor trata o campo como definitivo e o status `OPTOUT` da linha é só o
 * reflexo dele, gravado no ciclo seguinte. Por isso a situação "pediu para
 * sair" olha o CAMPO primeiro — contar pelo status mostraria uma pessoa que já
 * pediu para sair como "ativa" até o ciclo passar.
 */

import { montarEstado } from "@/lib/remarketing/motor";
import {
	dentroDaJanelaDeHorario,
	MAX_TOQUES,
	type MotivoBloqueio,
	PARAMETROS_DE_FABRICA,
	type ParametrosRegua,
	podeDisparar,
	type StatusRegua,
} from "@/lib/remarketing/regua";
import {
	MOTIVO_SAIDA_EQUIPE,
	MOTIVO_SAIDA_SEGURADO,
	MOTIVO_SAIDA_TESTE,
	motivoDeSaidaLegivel,
} from "./motivo-fora-da-regua";
import { BENS } from "./rotulo-do-bem";

/**
 * O motivo que marca uma linha segurada à mão.
 *
 * Fica em código (e não como frase livre) porque a tela DECIDE com base nele:
 * `situacao` e o guarda do "soltar" casam este valor. Frase livre no banco
 * obrigaria a tela a adivinhar por regex, que é o anti-padrão que o CLAUDE.md
 * descreve. O texto que o operador lê é o rótulo de `ROTULO_DO_MOTIVO`.
 */
export const MOTIVO_SEGURADO = MOTIVO_SAIDA_SEGURADO;

/**
 * Os motivos de saída que significam "a sequência parou, mas pode voltar": a
 * ação manual do atendente e as duas higienes do F6 (teste e equipe), que usam
 * `status=RESPONDEU` + `motivo_saida` próprio. Sem isto, uma conversa marcada
 * como teste apareceria como "o cliente respondeu" — mentira.
 */
const MOTIVOS_DE_PARADA: readonly string[] = [
	MOTIVO_SAIDA_SEGURADO,
	MOTIVO_SAIDA_TESTE,
	MOTIVO_SAIDA_EQUIPE,
];

/** As duas ações da tela. */
export type AcaoDaRegua = "segurar" | "soltar";

/**
 * A situação da linha como o operador a lê. Derivada de `status` + o motivo de
 * saída + o opt-out do contato — nunca de um campo novo no banco.
 */
export const SITUACOES = [
	"ativo",
	"segurado",
	"respondeu",
	"esgotado",
	"optout",
	"converteu",
] as const;

export type Situacao = (typeof SITUACOES)[number];

export const ROTULO_DA_SITUACAO: Record<Situacao, string> = {
	ativo: "Ativo",
	segurado: "Segurado pelo atendente",
	respondeu: "Respondeu",
	esgotado: "Esgotou os 3 toques",
	optout: "Pediu para sair",
	converteu: "Fechou contrato",
};

/** Os objetivos da régua (`motor.objetivoCanonico`), com o rótulo do painel.
 * Derivado do dicionário único do bem — a Régua não mantém uma segunda tabela.
 * `desconhecido` é o valor que o F6 grava quando o bem não foi informado: ele
 * NÃO pode virar "Carro" na tela (seria inventar perfil que ninguém disse). */
export const ROTULO_DO_OBJETIVO: Record<string, string> = {
	...Object.fromEntries(BENS.map((b) => [b.chave, b.rotulo])),
	desconhecido: "Bem não informado",
};

/** O rastro da última ação do atendente, guardado no metadata da conversa. */
export interface RastroDoAtendente {
	tipo: AcaoDaRegua;
	/** Quem agiu — nome de quem estava logado. */
	por: string;
	/** O id da sessão, para quando dois nomes iguais agirem. */
	porId: string;
	/** Quando, em ISO. */
	em: string;
}

/**
 * A linha como a CONSULTA a devolve: colunas cruas do banco, telefone já
 * mascarado na borda (o servidor é quem lê o número em claro) e o rastro do
 * metadata já interpretado.
 */
export interface LinhaBruta {
	conversationId: string;
	contactId: string;
	nome: string | null;
	/** Telefone MASCARADO para exibição, ou `null` quando não há. */
	telefoneMascarado: string | null;
	objetivo: string;
	step: number;
	status: StatusRegua;
	motivoSaida: string | null;
	nextTouchAt: Date | null;
	ultimoToqueEm: Date | null;
	/** Cota do teto deslizante, derivada no momento da escrita pelo ciclo. */
	touches30d: number;
	criadoEm: Date;
	ultimoInboundEm: Date | null;
	/** `contacts.remarketing_optout_at` — o terminal por PESSOA. */
	optoutDaPessoaEm: Date | null;
	/**
	 * O instante em que o lead desta conversa virou `fechado_ganho`
	 * (`lead_events.created_at`), ou `null` quando ainda não fechou.
	 *
	 * É o FATO da conversão, não o reflexo dela na régua: nada grava
	 * `status = 'CONVERTEU'` hoje (a coluna existe no enum, mas nenhum caminho a
	 * escreve). Contar conversão pelo status daria zero para sempre e a tela
	 * nunca responderia "qual toque paga o próprio custo". O evento do lead é a
	 * mesma verdade que o funil do painel já usa (`fechado_ganho`), e é ele que
	 * entra na atribuição por toque.
	 */
	converteuEm: Date | null;
	rastro: RastroDoAtendente | null;
	/** O que o banco registra do ÚLTIMO toque — insumo da FORMA (`formaDoEnvio`). */
	evidenciaDaForma: EvidenciaDaForma | null;
}

/** A linha como a TELA a mostra: tudo derivado, nada para o cliente decidir. */
export interface LinhaDaTela {
	conversationId: string;
	contactId: string;
	nome: string | null;
	telefoneMascarado: string | null;
	objetivo: string;
	rotuloDoObjetivo: string;
	step: number;
	/** "—" no passo 0; "1 de 3" depois do primeiro toque. */
	passoLegivel: string;
	touches30d: number;
	situacao: Situacao;
	rotuloDaSituacao: string;
	motivoSaida: string | null;
	motivoLegivel: string | null;
	/** ISO do próximo toque, quando ainda há um; `null` quando não há mais. */
	proximoToqueISO: string | null;
	/** `true` quando a data já passou e o ciclo ainda não alcançou a linha. */
	proximoToqueVencido: boolean;
	/**
	 * POR QUE o próximo toque não saiu (FIX-378): um dos quatro motivos de
	 * repetição, CALCULADO do estado da linha — nunca persistido (ver
	 * `motivoDoProximoToque`). `null` quando a régua não tem o que explicar.
	 */
	motivoDoProximoToque: MotivoDoProximoToque | null;
	/** O motivo em português, pronto para a coluna; `null` quando não há. */
	motivoDoProximoToqueLegivel: string | null;
	/** ISO do último toque que saiu. */
	ultimoToqueISO: string | null;
	/** COMO o último toque saiu; `null` quando nenhum toque saiu ainda. */
	forma: FormaDoEnvio | null;
	/** O cliente escreveu depois do último toque? (o fato, não o status) */
	respondeuDepoisDoToque: boolean;
	criadoEmISO: string;
	/** Rótulo da cota de 30 dias ("2 de 3"), sempre do dado — nunca estimado. */
	cotaLegivel: string;
	podeSegurar: boolean;
	podeSoltar: boolean;
	/** Por que NÃO dá para soltar — texto em português, exibido na tela. */
	motivoDeNaoSoltar: string | null;
	/** Quem segurou e quando, quando a linha está segurada. */
	rastro: RastroDoAtendente | null;
}

/** Os contadores do topo — a régua inteira no período, ignorando o filtro de situação. */
export type Contadores = Record<Situacao, number>;

/**
 * O que a rota devolve para a tela, e o que a tela espera.
 *
 * `total` é o que passa pelo filtro de situação (o denominador da lista) e
 * `totalDoRecorte` é o período inteiro sem ele — os dois juntos são o que deixa
 * o rodapé dizer "12 de 340 conversas" sem inventar denominador.
 */
export interface RespostaDaRegua {
	linhas: LinhaDaTela[];
	contadores: Contadores;
	total: number;
	totalDoRecorte: number;
	periodo: { de: string; ate: string };
	/** O funil por passo, a atribuição da conversão e os tempos (módulo insights). */
	insights: InsightsDaRegua;
	/** O resumo agregado do topo (toques enviados, respondidos, aguardando…). */
	resumo: ResumoDaRegua;
	/** `REMARKETING_ATIVO` — o interruptor operacional, lido na borda. */
	ligada: boolean;
	/**
	 * O teto de toques vigente — do CADASTRO (`remarketing_config`), não da
	 * constante: é o mesmo número que o ciclo usa, e é ele que a tela mostra em
	 * "2 de 3". Vem no shape para a página poder rotular o que exibe.
	 */
	maxToques: number;
	/** Se a régua está ligada, desligada ou só sem toque neste período. */
	estado: EstadoDaRegua;
}

export type ResultadoDaAcao = { pode: true } | { pode: false; motivo: string; mensagem: string };

/**
 * Os campos que a régua consulta para julgar uma linha. É um subconjunto de
 * `LinhaBruta` de propósito: os guardas não precisam de nome, telefone nem
 * rastro, e o teste monta a linha com só o que a decisão usa.
 */
export interface LinhaAvaliavel {
	status: StatusRegua;
	motivoSaida: string | null;
	objetivo: string;
	step: number;
	nextTouchAt: Date | null;
	ultimoToqueEm: Date | null;
	ultimoInboundEm: Date | null;
	optoutDaPessoaEm: Date | null;
}

/**
 * O que gravar quando a ação é aceita.
 *
 * `soltar` devolve `motivoSaida: null` de propósito: linha ativa não tem motivo
 * de saída, e manter o antigo faria a tela mostrar "Segurado pelo atendente" na
 * linha que acabou de ser solta.
 */
export type DecisaoDaAcao =
	| {
			ok: true;
			acao: AcaoDaRegua;
			status: StatusRegua;
			motivoSaida: string | null;
	  }
	| { ok: false; acao: AcaoDaRegua; motivo: string; mensagem: string };

/**
 * Os bloqueios do predicado que passam sozinhos: o teto de 30 dias cai quando o
 * toque mais antigo completa 30 dias, a data futura chega e a janela de horário
 * abre às 9h. Nenhum deles é razão para impedir o operador de soltar.
 */
const BLOQUEIOS_TRANSITORIOS: readonly MotivoBloqueio[] = [
	"teto_30_dias",
	"aguardando_data",
	"fora_da_janela_de_horario",
];

/** A situação da linha. A ordem dos testes É a precedência das regras. */
export function situacaoDe(linha: {
	status: StatusRegua;
	motivoSaida: string | null;
	optoutDaPessoaEm: Date | null;
}): Situacao {
	// Opt-out vence tudo (é o terminal por pessoa e sobrevive a nova simulação).
	if (linha.optoutDaPessoaEm !== null || linha.status === "OPTOUT") return "optout";
	if (linha.status === "CONVERTEU") return "converteu";
	if (linha.status === "RESPONDEU") {
		return linha.motivoSaida !== null && MOTIVOS_DE_PARADA.includes(linha.motivoSaida)
			? "segurado"
			: "respondeu";
	}
	if (linha.status === "ESGOTADO") return "esgotado";
	return "ativo";
}

/** O motivo de saída em português. Desconhecido sai cru — inventar rótulo seria pior. */
export function rotuloDoMotivo(motivo: string | null): string | null {
	return motivoDeSaidaLegivel(motivo);
}

export function passoLegivel(step: number, maxToques: number = MAX_TOQUES): string {
	if (step <= 0) return "—";
	return `${Math.min(step, maxToques)} de ${maxToques}`;
}

/**
 * A cota de 30 dias ("2 de 3"), pelo MESMO teto que o ciclo usa.
 *
 * `maxToques` entra por parâmetro porque o teto virou ajuste do cadastro
 * (`remarketing_config`, AJA-20 T1): ler a constante aqui faria a tela dizer
 * "1 de 3" depois de alguém cadastrar 2 — o painel mentiria para quem opera. O
 * default é o valor de fábrica, o mesmo em que o ciclo cai quando não há
 * cadastro.
 */
export function cotaLegivel(touches30d: number, maxToques: number = MAX_TOQUES): string {
	return `${touches30d} de ${maxToques}`;
}

export function rotuloDoObjetivo(objetivo: string): string {
	if (!objetivo) return ROTULO_DO_OBJETIVO.desconhecido;
	return ROTULO_DO_OBJETIVO[objetivo] ?? objetivo;
}

/**
 * O próximo toque que a régua ainda vai dar, ou `null`.
 *
 * Só linha `ATIVO` tem próximo toque: é o mesmo critério do ciclo, que lê
 * `WHERE status = 'ATIVO'`. Linha segurada mantém o `next_touch_at` gravado (é
 * ele que o "soltar" devolve à vida), e por isso a coluna é derivada do status
 * e não da coluna crua — mostrar data em linha parada seria mentir sobre o que
 * o motor vai fazer.
 */
export function proximoToqueDe(linha: {
	status: StatusRegua;
	nextTouchAt: Date | null;
}): Date | null {
	if (linha.status !== "ATIVO") return null;
	return linha.nextTouchAt;
}

/**
 * Os quatro motivos de REPETIÇÃO — por que o próximo toque ainda não saiu.
 *
 * São um recorte de `MotivoBloqueio`: os terminais (`optout`, `converteu`,
 * `ja_respondeu`) não entram, porque em linha terminal não existe "próximo
 * toque" — a coluna diz "Nenhum a caminho", e inventar motivo ali seria mentir.
 */
export type MotivoDoProximoToque =
	| "aguardando_data"
	| "teto_30_dias"
	| "fora_da_janela_de_horario"
	| "esgotado";

/** O motivo em português, como a coluna do próximo toque o mostra. */
export const ROTULO_DO_PROXIMO_TOQUE: Record<MotivoDoProximoToque, string> = {
	aguardando_data: "Ainda não é hora do próximo toque",
	teto_30_dias: "Cota de 30 dias cheia",
	fora_da_janela_de_horario: "Fora do horário de envio (9h às 20h)",
	esgotado: "Esgotou os três toques",
};

/**
 * POR QUE o próximo toque não saiu — calculado do estado da linha (FIX-378).
 *
 * O PRD (§AJA-20 T5) recomenda CALCULAR em tela em vez de persistir: não exige
 * migration, e uma coluna nova nasceria mentindo sobre o passado (o backfill
 * fica `NULL`). O que a linha já traz (`status`, `nextTouchAt`, `touches30d`)
 * mais a janela de horário e o teto vigentes bastam.
 *
 * A PRECEDÊNCIA é a mesma de `podeDisparar` — teto antes de data, data antes de
 * horário —, para a tela não discordar do motor sobre o motivo do bloqueio.
 * `null` é resposta: quando não houver o que explicar, a coluna não escreve
 * nada (o toque sai no próximo ciclo).
 */
export function motivoDoProximoToque(
	linha: {
		status: StatusRegua;
		nextTouchAt: Date | null;
		touches30d: number;
	},
	agora: Date,
	parametros: ParametrosRegua = PARAMETROS_DE_FABRICA,
): MotivoDoProximoToque | null {
	// Fora de `ATIVO` não há próximo toque; a única linha terminal que ainda tem
	// o que dizer é a esgotada (e ela diz por quê).
	if (linha.status !== "ATIVO") return linha.status === "ESGOTADO" ? "esgotado" : null;

	// O teto vem ANTES da data porque é ele que empurra a data.
	if (linha.touches30d >= parametros.tetoToques30Dias) return "teto_30_dias";

	// Sem data (ou data futura): ainda não é hora.
	if (!linha.nextTouchAt || linha.nextTouchAt.getTime() > agora.getTime()) {
		return "aguardando_data";
	}

	// Vencido e fora do horário: a régua espera a janela abrir.
	if (!dentroDaJanelaDeHorario(agora, parametros)) return "fora_da_janela_de_horario";

	// Vencido, dentro do horário e com cota: o toque sai no próximo ciclo.
	return null;
}

/**
 * A linha bruta vira a linha da tela. PURA: `agora` entra por parâmetro.
 *
 * `parametros` são os vigentes do cadastro (quando o chamador os tem): sem eles,
 * vale a fábrica — a tela não pode MENTIR sobre a hora de envio nem sobre o teto
 * que o motor está usando.
 */
export function linhaDaTela(
	linha: LinhaBruta,
	agora: Date,
	parametros: ParametrosRegua = PARAMETROS_DE_FABRICA,
): LinhaDaTela {
	// O teto de toques vem do MESMO `parametros` da régua (cadastro > fábrica): a
	// tela não pode contar uma cota e o motor outra. União dos blocos toques-lista
	// e regua-cadencia (onda 1) — os dois mexeram neste parâmetro.
	const maxToques = parametros.maxToques;
	const situacao = situacaoDe(linha);
	const proximo = proximoToqueDe(linha);
	const soltar = podeSoltar(linha, agora);
	const motivo = motivoDoProximoToque(linha, agora, parametros);

	return {
		conversationId: linha.conversationId,
		contactId: linha.contactId,
		nome: linha.nome,
		telefoneMascarado: linha.telefoneMascarado,
		objetivo: linha.objetivo,
		rotuloDoObjetivo: rotuloDoObjetivo(linha.objetivo),
		step: linha.step,
		passoLegivel: passoLegivel(linha.step, maxToques),
		touches30d: linha.touches30d,
		situacao,
		rotuloDaSituacao: ROTULO_DA_SITUACAO[situacao],
		motivoSaida: linha.motivoSaida,
		motivoLegivel: rotuloDoMotivo(linha.motivoSaida),
		proximoToqueISO: proximo ? proximo.toISOString() : null,
		proximoToqueVencido: proximo ? proximo.getTime() <= agora.getTime() : false,
		motivoDoProximoToque: motivo,
		motivoDoProximoToqueLegivel: motivo === null ? null : ROTULO_DO_PROXIMO_TOQUE[motivo],
		ultimoToqueISO: linha.ultimoToqueEm ? linha.ultimoToqueEm.toISOString() : null,
		forma: formaDoEnvio(linha),
		respondeuDepoisDoToque: respondeuDepoisDoToque(linha),
		criadoEmISO: linha.criadoEm.toISOString(),
		cotaLegivel: cotaLegivel(linha.touches30d, maxToques),
		// Uma fonte só para o guarda: `podeSegurar` já recusa opt-out, e a tela não
		// pode discordar dele sobre o que dá para fazer.
		podeSegurar: podeSegurar(linha).pode,
		podeSoltar: soltar.pode,
		motivoDeNaoSoltar: situacao === "segurado" && !soltar.pode ? soltar.mensagem : null,
		rastro: linha.rastro,
	};
}

export function linhasDaTela(
	linhas: readonly LinhaBruta[],
	agora: Date,
	parametros: ParametrosRegua = PARAMETROS_DE_FABRICA,
): LinhaDaTela[] {
	return linhas.map((linha) => linhaDaTela(linha, agora, parametros));
}

/** Conta a régua inteira por situação. Sem banco, sem limite: contador tem que fechar. */
export function contadoresDe(linhas: readonly LinhaBruta[]): Contadores {
	const contadores = Object.fromEntries(SITUACOES.map((s) => [s, 0])) as Contadores;
	for (const linha of linhas) contadores[situacaoDe(linha)] += 1;
	return contadores;
}

/** Só a página pedida, na situação pedida (`null` = todas). */
export function filtrarPorSituacao(
	linhas: readonly LinhaBruta[],
	situacao: Situacao | null,
): LinhaBruta[] {
	if (!situacao) return [...linhas];
	return linhas.filter((linha) => situacaoDe(linha) === situacao);
}

/**
 * Dá para segurar esta linha?
 *
 * Só linha `ATIVO`: segurar o que já parou não muda nada e mentiria sobre o
 * estado (a linha passaria a "segurada" quando na verdade ela respondeu ou
 * esgotou). Opt-out e conversão também não: o motor nunca dispararia ali.
 */
export function podeSegurar(linha: {
	status: StatusRegua;
	optoutDaPessoaEm: Date | null;
}): ResultadoDaAcao {
	if (linha.status !== "ATIVO") {
		return {
			pode: false,
			motivo: "regua_ja_parada",
			mensagem: "Esta conversa já saiu da régua — não há toque para segurar.",
		};
	}
	if (linha.optoutDaPessoaEm !== null) {
		return {
			pode: false,
			motivo: "optout_do_cliente",
			mensagem: "O cliente pediu para sair: a régua já não dispara para esta pessoa.",
		};
	}
	return { pode: true };
}

/**
 * Dá para soltar esta linha?
 *
 * Três perguntas, nesta ordem:
 *
 *   1. **ela foi segurada?** Sem o motivo de `MOTIVO_SEGURADO` não há o que
 *      soltar — a tela só oferece o botão nessa linha, e esta é a validação que
 *      o servidor refaz por conta própria;
 *   2. **o cliente pediu opt-out?** Definitivo por decisão de produto e por
 *      implementação do motor: não volta, nem com a ação manual do atendente;
 *   3. **o predicado permitiria disparar?** Aqui quem responde é a PRÓPRIA
 *      régua — o estado solto (`ATIVO`) é montado com `montarEstado` e
 *      submetido a `podeDisparar`. É o que pega os dois casos que uma regra
 *      escrita à mão esqueceria: `step = 3` (cota de toques esgotada) e o
 *      cliente que **escreveu depois do último toque** (o motor deriva
 *      `RESPONDEU` desse fato, e soltar ali seria devolver a conversa à mesa em
 *      loop). Bloqueio TRANSITÓRIO (teto de 30 dias, data futura, fora do
 *      horário) NÃO impede soltar: soltar é liberar o estado, e a hora do
 *      disparo continua sendo decisão do ciclo.
 *
 * `toquesNaJanela` entra vazio porque só alimenta o teto — transitório, e sem
 * influência no resultado. A consulta da tela não lê o histórico da pessoa.
 */
export function podeSoltar(linha: LinhaAvaliavel, agora: Date): ResultadoDaAcao {
	if (linha.status !== "RESPONDEU" || linha.motivoSaida !== MOTIVO_SEGURADO) {
		return {
			pode: false,
			motivo: "nao_esta_segurada",
			mensagem: "Esta conversa não está segurada — não há o que soltar.",
		};
	}
	if (linha.optoutDaPessoaEm !== null) {
		return {
			pode: false,
			motivo: "optout_do_cliente",
			mensagem: "O cliente pediu para sair: opt-out é definitivo e não volta.",
		};
	}

	const estadoSolto = montarEstado({
		objetivo: linha.objetivo,
		status: "ATIVO",
		motivoSaida: null,
		fatos: {
			step: linha.step,
			nextTouchAt: linha.nextTouchAt,
			ultimoToqueEm: linha.ultimoToqueEm,
			ultimoInboundEm: linha.ultimoInboundEm,
		},
		toquesNaJanela: [],
		simulacaoEm: null,
		optoutDaPessoaEm: null,
	});

	const veredito = podeDisparar(estadoSolto, agora);
	if (veredito.pode || BLOQUEIOS_TRANSITORIOS.includes(veredito.motivo)) return { pode: true };

	if (veredito.motivo === "esgotado") {
		return {
			pode: false,
			motivo: veredito.motivo,
			mensagem: "Os três toques já saíram — esta conversa não volta para a régua.",
		};
	}
	if (veredito.motivo === "ja_respondeu") {
		return {
			pode: false,
			motivo: veredito.motivo,
			mensagem: "O cliente respondeu depois do último toque — a conversa voltou para a mesa.",
		};
	}
	return {
		pode: false,
		motivo: veredito.motivo,
		mensagem: "A régua não permitiria um novo toque para esta pessoa.",
	};
}

/**
 * A decisão da ação, com o que gravar. É o que a rota usa e o que o teste prova
 * — a rota fica só com sessão, banco e auditoria.
 */
export function decidirAcao(linha: LinhaAvaliavel, acao: AcaoDaRegua, agora: Date): DecisaoDaAcao {
	const veredito = acao === "segurar" ? podeSegurar(linha) : podeSoltar(linha, agora);
	if (!veredito.pode) {
		return { ok: false, acao, motivo: veredito.motivo, mensagem: veredito.mensagem };
	}

	return acao === "segurar"
		? { ok: true, acao, status: "RESPONDEU", motivoSaida: MOTIVO_SEGURADO }
		: { ok: true, acao, status: "ATIVO", motivoSaida: null };
}

/** `?situacao=` cru vira situação conhecida, ou `null` (lista inteira). */
export function situacaoDoParametro(valor: string | null | undefined): Situacao | null {
	if (!valor) return null;
	return (SITUACOES as readonly string[]).includes(valor) ? (valor as Situacao) : null;
}

// ─── Os insights: o funil por passo, quem paga o toque e quanto tempo leva ───
//
// Tudo aqui é derivado das mesmas linhas que a lista já lê — nenhuma consulta
// nova, nenhuma estimativa. Com a tabela vazia (o estado de hoje: a chave
// `REMARKETING_ATIVO` não está na task definition e nada foi disparado) os
// números são zero honesto e o estado (`estadoHonestoDaRegua`) diz que a régua
// não está ligada, em vez de desenhar um gráfico de zero que se leria como
// "ninguém respondeu".

/** Os passos da régua: 0 = entrou e nenhum toque saiu; 1..3 = o toque que saiu. */
export const PASSOS = [0, 1, 2, 3] as const;
export type Passo = (typeof PASSOS)[number];

const MAX_PASSO: Passo = 3;

/**
 * O rótulo do passo. O passo N significa "N toques já saíram", então o passo 1
 * é o mundo DEPOIS do toque 01 — é essa leitura que a atribuição de conversão
 * usa (a conversão que veio depois do toque 01 cai no passo 1).
 */
export const ROTULO_DO_PASSO: Record<Passo, string> = {
	0: "Antes de qualquer toque",
	1: "Depois do toque 01",
	2: "Depois do toque 02",
	3: "Depois do toque 03",
};

/**
 * O passo da linha, preso a 0..3.
 *
 * `step` vem do banco com `check` de 0 a 3, mas a leitura não confia no que
 * chega: valor fora da faixa (linha antiga, migration futura) não pode explodir
 * o índice do funil.
 */
export function passoDa(linha: { step: number }): Passo {
	const n = Math.trunc(linha.step);
	if (!Number.isFinite(n) || n <= 0) return 0;
	return Math.min(n, MAX_PASSO) as Passo;
}

/**
 * A conversão da linha, pelo FATO.
 *
 * O evento `fechado_ganho` é a fonte; o status `CONVERTEU` da régua entra como
 * reforço para o dia em que alguém o escrever — os dois juntos nunca contam a
 * mesma linha duas vezes porque o resultado é booleano.
 */
function converteu(linha: LinhaBruta): boolean {
	return linha.converteuEm !== null || situacaoDe(linha) === "converteu";
}

/**
 * A qual toque a conversão se deve.
 *
 * Só o ÚLTIMO toque tem instante exato no banco (`ultimo_toque_em`) — os
 * anteriores só existiriam por reconstrução de cadência, e o bloco 6 MOVE os
 * intervalos para o cadastro, o que tornaria a conta silenciosamente errada. A
 * regra então usa o que é fato:
 *
 *   - converteu antes de qualquer toque → o passo 0 ("sem toque");
 *   - converteu DEPOIS do último toque → o toque que precedeu, que é o passo;
 *   - converteu ANTES do último toque → não há como dizer qual toque veio antes
 *     (`null`): a régua seguiu tocando depois da venda, e atribuir ao último
 *     toque seria creditar a quem chegou tarde.
 */
export function passoDaConversao(linha: LinhaBruta): Passo | null {
	if (!converteu(linha)) return null;
	const passo = passoDa(linha);
	if (passo === 0) return 0;
	if (linha.ultimoToqueEm === null || linha.converteuEm === null) return null;
	return linha.converteuEm.getTime() >= linha.ultimoToqueEm.getTime() ? passo : null;
}

/** Resumo de uma lista de durações, em milissegundos. Vazio ⇒ tudo `null`, nunca NaN. */
export interface ResumoDeTempos {
	contagem: number;
	medianaMs: number | null;
	menorMs: number | null;
	maiorMs: number | null;
}

/**
 * Mediana, e não média: a régua tem cauda longa (quem responde dias depois) e a
 * média sozinha deixaria um caso extremo decidir o intervalo desenhado. Com a
 * lista vazia devolve `null` em tudo — a tela mostra "—", não uma divisão por
 * zero disfarçada de número.
 */
export function resumoDeTempos(valores: readonly number[]): ResumoDeTempos {
	const limpos = valores.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
	if (limpos.length === 0) {
		return { contagem: 0, medianaMs: null, menorMs: null, maiorMs: null };
	}

	const meio = Math.floor(limpos.length / 2);
	const mediana =
		limpos.length % 2 === 1 ? limpos[meio] : Math.round((limpos[meio - 1] + limpos[meio]) / 2);

	return {
		contagem: limpos.length,
		medianaMs: mediana,
		menorMs: limpos[0],
		maiorMs: limpos[limpos.length - 1],
	};
}

/** Uma linha do funil — um passo da régua com tudo o que se deriva dele. */
export interface LinhaDoFunil {
	passo: Passo;
	rotulo: string;
	/** Quantas linhas chegaram a este passo (cumulativo: último toque >= passo). */
	chegaram: number;
	/** Destas, quantas seguiram para o próximo passo. */
	avancaram: number;
	/** Saíram da régua neste passo (resposta, opt-out, esgotamento, conversão ou segurar). */
	sairam: number;
	/** Continuam na régua neste passo, à espera do próximo toque. */
	aguardando: number;
	responderam: number;
	segurados: number;
	converteram: number;
	optout: number;
	esgotaram: number;
	/**
	 * Queda para o próximo passo em %: `sairam + aguardando` sobre `chegaram`.
	 * `null` no passo 3 (não há próximo) e quando ninguém chegou.
	 *
	 * Ela mistura os dois motivos de não-avanço de propósito: quem já saiu e quem
	 * ainda espera o próximo toque. O número sozinho mentiria, e é por isso que a
	 * coluna "aguardando" aparece ao lado — a régua é viva, nem todo mundo parou.
	 */
	quedaPercentual: number | null;
	/** Conversões atribuídas a ESTE toque (a venda veio depois dele). */
	conversoesAtribuidas: number;
	/** Tempo entre o último toque e a resposta, para quem respondeu neste passo. */
	tempoAteResposta: ResumoDeTempos;
	/** Tempo entre o último toque e o fechamento, para quem fechou neste passo. */
	tempoAteConversao: ResumoDeTempos;
}

/** A atribuição da conversão aos toques — a pergunta que quase nenhuma régua responde. */
export interface AtribuicaoDaConversao {
	/** Total de conversões no recorte, por qualquer definição (fato ou status). */
	total: number;
	/** Conversões que não dão para atribuir a um toque (vieram antes do último). */
	semAtribuicao: number;
	/**
	 * O toque (1..3) que mais converteu, ou `null` quando nenhum converteu.
	 *
	 * É a resposta possível HOJE: não há custo por toque no banco, então a tela
	 * mostra quem converte, não quem "paga o próprio custo" com número de custo
	 * inventado. Empate devolve o toque mais adiantado (menos mensagem para o
	 * mesmo resultado).
	 */
	paga: Passo | null;
}

/** O que a tela de insights mostra, derivado do mesmo recorte da lista. */
export interface InsightsDaRegua {
	funil: LinhaDoFunil[];
	conversoes: AtribuicaoDaConversao;
}

/** Uma linha só, para os testes e para a leitura não depender do índice. */
function resumoDoPasso(
	linhas: readonly LinhaBruta[],
	passo: Passo,
	conversoesAtribuidas: number,
): LinhaDoFunil {
	const nestePasso = linhas.filter((l) => passoDa(l) === passo);
	const chegaram = linhas.filter((l) => passoDa(l) >= passo).length;
	const avancaram = passo < MAX_PASSO ? linhas.filter((l) => passoDa(l) > passo).length : 0;

	const count = (pred: (l: LinhaBruta) => boolean) => nestePasso.filter(pred).length;

	// Desfechos em PRECEDÊNCIA, para cada linha cair em UM só: quem fechou contrato
	// conta como "fecharam" mesmo tendo respondido antes — senão a pessoa que
	// respondeu e depois comprou apareceria duas vezes e as colunas não fechariam
	// com o total do passo.
	const converteram = count(converteu);
	const responderam = count((l) => !converteu(l) && situacaoDe(l) === "respondeu");
	const segurados = count((l) => !converteu(l) && situacaoDe(l) === "segurado");
	const esgotaram = count((l) => !converteu(l) && situacaoDe(l) === "esgotado");
	const optout = count((l) => !converteu(l) && situacaoDe(l) === "optout");
	// O resto é quem continua na régua à espera do próximo toque.
	const aguardando = nestePasso.length - converteram - responderam - segurados - esgotaram - optout;
	const sairam = nestePasso.length - aguardando;

	const temposResposta: number[] = [];
	const temposConversao: number[] = [];
	for (const linha of nestePasso) {
		const resposta = respostaDepoisDoToque(linha);
		if (resposta !== null) temposResposta.push(resposta);
		const conversao = conversaoDepoisDoToque(linha);
		if (conversao !== null) temposConversao.push(conversao);
	}

	return {
		passo,
		rotulo: ROTULO_DO_PASSO[passo],
		chegaram,
		avancaram,
		sairam,
		aguardando,
		responderam,
		segurados,
		converteram,
		optout,
		esgotaram,
		quedaPercentual:
			passo < MAX_PASSO && chegaram > 0 ? ((sairam + aguardando) / chegaram) * 100 : null,
		conversoesAtribuidas,
		tempoAteResposta: resumoDeTempos(temposResposta),
		tempoAteConversao: resumoDeTempos(temposConversao),
	};
}

/**
 * Milissegundos entre o último toque e a resposta de quem respondeu.
 * `null` quando não há os dois instantes ou quando a resposta veio antes do
 * toque (o que não é resposta À régua).
 */
function respostaDepoisDoToque(linha: LinhaBruta): number | null {
	if (situacaoDe(linha) !== "respondeu") return null;
	if (!linha.ultimoToqueEm || !linha.ultimoInboundEm) return null;
	const delta = linha.ultimoInboundEm.getTime() - linha.ultimoToqueEm.getTime();
	return delta >= 0 ? delta : null;
}

/** Milissegundos entre o último toque e o fechamento, quando a régua precedeu a venda. */
function conversaoDepoisDoToque(linha: LinhaBruta): number | null {
	if (passoDaConversao(linha) === null || passoDa(linha) === 0) return null;
	if (!linha.ultimoToqueEm || !linha.converteuEm) return null;
	const delta = linha.converteuEm.getTime() - linha.ultimoToqueEm.getTime();
	return delta >= 0 ? delta : null;
}

/**
 * O funil e a atribuição, derivados das linhas do recorte. PURO.
 *
 * A lista pode vir vazia: todas as contagens são zero e os resumos de tempo são
 * `null`. Nada aqui divide por zero nem produz NaN.
 */
export function insightsDaRegua(linhas: readonly LinhaBruta[]): InsightsDaRegua {
	const porPasso = new Map<Passo, number>();
	let conversoes = 0;
	let semAtribuicao = 0;

	for (const linha of linhas) {
		if (!converteu(linha)) continue;
		conversoes += 1;
		const passo = passoDaConversao(linha);
		if (passo === null) {
			semAtribuicao += 1;
			continue;
		}
		porPasso.set(passo, (porPasso.get(passo) ?? 0) + 1);
	}

	const funil = PASSOS.map((passo) => resumoDoPasso(linhas, passo, porPasso.get(passo) ?? 0));

	let paga: Passo | null = null;
	for (const passo of [1, 2, 3] as const) {
		const quantas = porPasso.get(passo) ?? 0;
		if (quantas === 0) continue;
		if (paga === null || quantas > (porPasso.get(paga) ?? 0)) paga = passo;
	}

	return { funil, conversoes: { total: conversoes, semAtribuicao, paga } };
}

/**
 * O resumo agregado do topo — a resposta à pergunta "quantas foram disparadas?"
 * (AJA-04).
 *
 * O que cada número É, para não mentir:
 *
 *   - **toques enviados**: a SOMA de `step` das linhas do recorte. `step` é
 *     quantos toques já saíram para aquela conversa, então somá-lo dá o total
 *     de mensagens disparadas — não o número de conversas. `touches30d` NÃO
 *     serve: ele é a cota deslizante por pessoa, não o histórico;
 *   - **responderam**: as linhas em que o cliente respondeu (situação
 *     `respondeu`); a linha segurada à mão não conta, porque parar à mão não é
 *     o cliente ter respondido;
 *   - **aguardando**: as que ainda vão receber toque (ATIVO com `next_touch_at`),
 *     com a data mais próxima para o resumo dizer QUANDO;
 *   - **elegíveis fora**: quantas conversas entrariam no próximo ciclo
 *     (`contarElegiveisParaRegua`, passado pela borda) — a fila que a régua
 *     ainda não alcançou, seja porque está desligada ou porque o ciclo não
 *     rodou.
 *
 * Função PURA sobre as linhas que a lista já leu: nenhuma consulta nova, e o
 * teste prova que os contadores fecham com a soma das linhas.
 */
export interface ResumoDaRegua {
	toquesEnviados: number;
	responderam: number;
	/** % de quem respondeu sobre os toques enviados; `null` quando não houve toque. */
	responderamPercentual: number | null;
	pediramSair: number;
	esgotaram: number;
	aguardando: { n: number; proximoEm: string | null };
	elegiveisFora: number;
}

export function resumoDaRegua(
	linhas: readonly LinhaBruta[],
	contexto: { elegiveisAgora?: number } = {},
): ResumoDaRegua {
	let toquesEnviados = 0;
	let responderam = 0;
	let pediramSair = 0;
	let esgotaram = 0;
	let aguardando = 0;
	let proximoEm: number | null = null;

	for (const linha of linhas) {
		toquesEnviados += Math.max(0, Math.trunc(linha.step));
		const situacao = situacaoDe(linha);
		if (situacao === "respondeu") responderam += 1;
		if (situacao === "optout") pediramSair += 1;
		if (situacao === "esgotado") esgotaram += 1;

		const proximo = proximoToqueDe(linha);
		if (proximo) {
			aguardando += 1;
			const ms = proximo.getTime();
			if (proximoEm === null || ms < proximoEm) proximoEm = ms;
		}
	}

	return {
		toquesEnviados,
		responderam,
		responderamPercentual:
			toquesEnviados > 0 ? Math.round((responderam / toquesEnviados) * 1000) / 10 : null,
		pediramSair,
		esgotaram,
		aguardando: {
			n: aguardando,
			proximoEm: proximoEm === null ? null : new Date(proximoEm).toISOString(),
		},
		elegiveisFora: Math.max(0, Math.trunc(contexto.elegiveisAgora ?? 0)),
	};
}

/**
 * O estado honesto da régua — o que a tela diz ANTES de mostrar gráfico.
 *
 * Três situações, e a diferença entre elas é o ponto:
 *
 *   1. **nunca ligada** (`remarketing_touches` vazia no banco inteiro): nada foi
 *      enviado. `elegiveisAgora` é quantas conversas entrariam no próximo ciclo
 *      — hoje 218 —, a resposta que o dono do produto quer nesse estado;
 *   2. **sem toques no período**: a régua já rodou, mas não neste recorte;
 *   3. **com dados**: há o que mostrar.
 *
 * A distinção existe porque "zero linhas no período" e "régua desligada" são
 * fatos diferentes, e tratá-los iguais faria o painel dizer "ninguém respondeu"
 * quando a verdade é "nada foi enviado".
 */
export type EstadoDaRegua =
	| { tipo: "nunca_ligada"; elegiveisAgora: number }
	| { tipo: "sem_toques_no_periodo"; totalNoHistorico: number; elegiveisAgora: number }
	| { tipo: "com_dados"; totalNoPeriodo: number };

export function estadoHonestoDaRegua(args: {
	/** Linhas em `remarketing_touches` no banco inteiro, sem recorte de período. */
	totalNoHistorico: number;
	/** Linhas dentro do período escolhido. */
	linhasNoPeriodo: number;
	/** Conversas elegíveis para entrar na régua agora. */
	elegiveisAgora: number;
}): EstadoDaRegua {
	const elegiveisAgora = Math.max(0, Math.trunc(args.elegiveisAgora));
	const totalNoHistorico = Math.max(0, Math.trunc(args.totalNoHistorico));
	const linhasNoPeriodo = Math.max(0, Math.trunc(args.linhasNoPeriodo));

	if (totalNoHistorico === 0) return { tipo: "nunca_ligada", elegiveisAgora };
	if (linhasNoPeriodo === 0) {
		return { tipo: "sem_toques_no_periodo", totalNoHistorico, elegiveisAgora };
	}
	return { tipo: "com_dados", totalNoPeriodo: linhasNoPeriodo };
}

/**
 * Uma duração em milissegundos para leitura humana.
 *
 * `null` para entrada ausente ou negativa — a tela mostra "—" e não "0 min",
 * que se leria como "respondeu na hora".
 */
export function duracaoLegivel(ms: number | null): string | null {
	if (ms === null || !Number.isFinite(ms) || ms < 0) return null;

	const minutos = Math.round(ms / 60_000);
	if (minutos < 60) return `${minutos} min`;

	const horas = Math.floor(minutos / 60);
	const restoMin = minutos % 60;
	if (horas < 24) return restoMin > 0 ? `${horas} h ${restoMin} min` : `${horas} h`;

	const dias = ms / 86_400_000;
	const arredondado = Math.round(dias * 10) / 10;
	return arredondado < 2
		? `${arredondado.toLocaleString("pt-BR")} dia`
		: `${arredondado.toLocaleString("pt-BR")} dias`;
}

// ─── A FORMA DO ENVIO: como o último toque saiu (FIX-380) ────────────────────
//
// A régua sabe SE o toque sai (`regua.ts`) e o motor decide COMO entregar
// (`motor.ts`): turno de retomada quando a janela de 24 h do cliente está
// aberta, template aprovado quando está fechada. O que a tela não dizia era
// como aquilo DE FATO saiu — e é a segunda metade da pergunta do dono ("e como
// que foi?"): a diferença entre os dois é a explicação de por que o texto muda
// de um toque para o outro.
//
// ── Reuso, e não coluna nova ────────────────────────────────────────────────
//
// A forma é DERIVADA do que o banco já grava, sem migration e sem passar pelo
// ciclo — o que também faz ela valer para o histórico, em vez de nascer NULL:
//
//   - `whatsapp_outbound_queue`: linha para o destino = o toque entrou na fila
//     de template. `pending` = esperando aprovação na Meta (o toque NÃO saiu
//     como mensagem ainda); `sent` = a fila esvaziou e o template saiu;
//   - `messages`: a fala do agente logo depois do toque = turno de retomada. É
//     o marcador que separa "o agente falou" de "saiu template", porque o envio
//     de template NÃO grava mensagem no histórico;
//   - `messages.template_name`: nome do template quando a saída foi um template
//     (hoje quem grava é o painel do atendente; a régua não — mas a coluna é a
//     evidência declarada do bloco e entra na ordem);
//   - `whatsapp_templates`: o template do bem, quando já está `APPROVED` — o
//     caso do envio direto, que não deixa fila nem fala.
//
// ── O que não se deriva não se inventa ──────────────────────────────────────
//
// Sem rastro nenhum a resposta é `nao_registrado`, NUNCA "texto livre" por
// omissão: não ter o dado não é o mesmo que ter o dado "não", que é a mesma
// disciplina do `estadoHonestoDaRegua`. E o passo 0 (nenhum toque saiu) não tem
// forma — devolve `null`, não um rótulo vazio.

export type StatusDaFila = "pending" | "sent" | "failed";

/** O rastro do último toque, colhido pelo servidor (`remarketing-queries.ts`). */
export interface EvidenciaDaForma {
	/** O agente falou logo depois do toque? (turno de retomada) */
	houveFalaDoAgente: boolean;
	/** `messages.template_name` da fala, quando ela foi um template. */
	nomeDoTemplateNaMensagem: string | null;
	/** A linha da fila de template do destino, quando o toque entrou nela. */
	naFila: { status: StatusDaFila; nomeDoTemplate: string | null } | null;
	/** Nome do template aprovado do bem (envio direto, sem passar pela fila). */
	templateAprovado: string | null;
}

export const FORMAS_DO_TOQUE = [
	"texto_livre",
	"template",
	"template_aguardando",
	"nao_registrado",
] as const;

export type FormaDoToque = (typeof FORMAS_DO_TOQUE)[number];

export interface FormaDoEnvio {
	tipo: FormaDoToque;
	/** O rótulo curto da célula. O nome do template vai em `nomeDoTemplate`. */
	rotulo: string;
	/** Nome do template na Meta, quando a forma é template. */
	nomeDoTemplate: string | null;
	/** A frase do `title`: o que aquela forma significa, em português. */
	explicacao: string;
}

const ROTULO_DA_FORMA: Record<FormaDoToque, string> = {
	texto_livre: "Texto livre",
	template: "Template",
	template_aguardando: "Template aguardando",
	nao_registrado: "Não registrado",
};

const EXPLICACAO_DA_FORMA: Record<FormaDoToque, string> = {
	texto_livre: "Turno de retomada: quem falou foi o agente, dentro da janela de 24 h do cliente.",
	template:
		"Template aprovado da Meta — fora da janela de 24 h é a única entrega que a Meta aceita.",
	template_aguardando:
		"Entrou na fila esperando o template ser aprovado na Meta; sai quando a aprovação chegar.",
	nao_registrado: "Sem rastro do envio no banco: sem fila de template e sem fala do agente.",
};

function forma(tipo: FormaDoToque, nomeDoTemplate: string | null): FormaDoEnvio {
	return {
		tipo,
		rotulo: ROTULO_DA_FORMA[tipo],
		nomeDoTemplate,
		explicacao: EXPLICACAO_DA_FORMA[tipo],
	};
}

/**
 * COMO o último toque saiu — `null` quando nenhum toque saiu ainda (passo 0).
 *
 * A ordem dos testes É a precedência: a FILA primeiro (um toque enfileirado não
 * saiu como conversa, por mais que haja fala no histórico), depois o nome do
 * template gravado na mensagem, depois a fala do agente (texto livre) e, por
 * fim, o template aprovado do bem — o envio direto, que não deixa outro rastro.
 */
export function formaDoEnvio(linha: {
	step: number;
	evidenciaDaForma: EvidenciaDaForma | null;
}): FormaDoEnvio | null {
	if (passoDa(linha) === 0) return null;

	const evidencia = linha.evidenciaDaForma;
	if (!evidencia) return forma("nao_registrado", null);

	const fila = evidencia.naFila;
	if (fila?.status === "pending") return forma("template_aguardando", fila.nomeDoTemplate);
	if (fila?.status === "sent") return forma("template", fila.nomeDoTemplate);
	if (evidencia.nomeDoTemplateNaMensagem) {
		return forma("template", evidencia.nomeDoTemplateNaMensagem);
	}
	if (evidencia.houveFalaDoAgente) return forma("texto_livre", null);
	if (evidencia.templateAprovado) return forma("template", evidencia.templateAprovado);

	return forma("nao_registrado", null);
}

/**
 * O cliente escreveu DEPOIS do último toque?
 *
 * É o fato (duas datas no banco), e não o status da linha: a situação
 * `segurado`, por exemplo, usa `RESPONDEU` sem que o cliente tenha respondido
 * nada — quem parou foi o atendente.
 */
export function respondeuDepoisDoToque(linha: {
	ultimoToqueEm: Date | null;
	ultimoInboundEm: Date | null;
}): boolean {
	if (!linha.ultimoToqueEm || !linha.ultimoInboundEm) return false;
	return linha.ultimoInboundEm.getTime() > linha.ultimoToqueEm.getTime();
}

// ─── O FILTRO POR PASSO: a porta para "para quem foi?" (FIX-379) ─────────────
//
// O dono perguntou "já foram enviados oito — para quem que foi?" e a resposta
// só existia agregada: o cartão "Toques enviados" e o funil por passo contavam,
// mas não levavam a lugar nenhum. Aqui mora a decisão do recorte; a rota só lê
// o parâmetro e a tela só escreve o link.
//
// O recorte é uma função PURA sobre as mesmas linhas que a lista já leu — o
// mesmo desenho do filtro de situação, e pelo mesmo motivo: `contadores`,
// `insights` e `resumo` continuam sendo do RECORTE inteiro. Filtrá-los junto
// faria o funil mudar de forma quando o operador clicasse num degrau dele.

/**
 * O que `?passo=` aceita: um passo exato (0..3) ou "com toque" — quem recebeu
 * pelo menos um toque, que é para onde o cartão "Toques enviados" aponta (ele é
 * a soma dos passos, não um passo).
 */
export type FiltroDePasso = Passo | "com_toque";

/** `?passo=` cru vira filtro conhecido, ou `null` (lista inteira). */
export function passoDoParametro(valor: string | null | undefined): FiltroDePasso | null {
	if (!valor) return null;
	if (valor === "com_toque") return "com_toque";
	return (PASSOS as readonly number[]).map(String).includes(valor)
		? (Number(valor) as Passo)
		: null;
}

/** Só quem está no passo pedido (`null` = todos). */
export function filtrarPorPasso(
	linhas: readonly LinhaBruta[],
	filtro: FiltroDePasso | null,
): LinhaBruta[] {
	// `null` é "sem filtro" — e o teste com `0` é o que guarda contra o clássico
	// `if (!filtro)`, que engoliria o passo 0 (falsy) e devolveria a lista inteira.
	if (filtro === null) return [...linhas];
	if (filtro === "com_toque") return linhas.filter((linha) => passoDa(linha) > 0);
	return linhas.filter((linha) => passoDa(linha) === filtro);
}

/**
 * O rótulo do filtro ativo, no MESMO vocabulário do funil — o operador lê
 * "Depois do toque 02" no degrau e no chip do filtro, sem um terceiro nome para
 * a mesma coisa.
 */
export function rotuloDoFiltroDePasso(filtro: FiltroDePasso): string {
	return filtro === "com_toque" ? "Com algum toque enviado" : ROTULO_DO_PASSO[filtro];
}
