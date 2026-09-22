/**
 * O resumo do perfil dos visitantes — o dado, não o desenho.
 *
 * A tela "Agora" dizia QUANTAS visitas chegaram na última hora e nunca QUEM
 * chegou. Este módulo fecha a pergunta de perfil em três eixos fixos:
 *
 *   1. **Novidade** — novos × recorrentes (visitante que já tinha visita antes).
 *   2. **Origem**  — de onde a chegada veio (campanha, referência ou direto).
 *   3. **Dispositivo** — celular × desktop, lido do `user_agent`.
 *
 * Três eixos e nada mais: pedir uma lista aberta degenera ("quem falou o quê"
 * não é síntese, cada tela pediria um recorte novo). É a mesma promessa do
 * painel de contexto do assistente: definições fixas de um lado, resultados do
 * outro, e cada resultado é `detalhe` ou `semMedicao` — fonte sem dado **não
 * some da lista**, ela declara que não mediu.
 *
 * A `fracao` viaja pronta no dado (0 a 1, `null` quando não há medição) para
 * que a barra desenhada não recalcule nada: o gráfico lê a mesma fração que o
 * texto ao lado declara, e por isso os dois não podem discordar.
 *
 * O dado é do DIA corrente (`INICIO_DE_HOJE` em diante), no fuso do negócio, e
 * usa o MESMO denominador das outras telas (`VISITA_CONTAVEL`): só gente, e sem
 * o eco de prefetch. Duas populações com o mesmo rótulo seriam duas verdades.
 */

/** Como uma medição se apresenta: medida, ou declaradamente sem dado. */
export type EstadoDaMedicao = "detalhe" | "semMedicao";

/** Uma fatia de um eixo — ex.: "Campanha · 45 · 0,45". */
export interface FatiaDoPerfil {
	rotulo: string;
	total: number;
	/** 0 a 1, sobre o total do eixo. */
	fracao: number;
}

export type ChaveDoEixo = "novidade" | "origem" | "dispositivo";

export interface EixoDoPerfil {
	chave: ChaveDoEixo;
	rotulo: string;
	/** Como o total do eixo se chama ("pessoas" ou "chegadas"). */
	unidade: string;
	estado: EstadoDaMedicao;
	/** Por que não há medição — só quando `semMedicao`. */
	motivo?: string;
	/** Total medido no eixo (0 quando sem medição). */
	total: number;
	/** A fração da primeira fatia (0 a 1) ou `null` quando sem medição. */
	fracao: number | null;
	fatias: FatiaDoPerfil[];
}

export interface PerfilDosVisitantes {
	/** Chegadas contáveis do dia (o denominador de tudo aqui). */
	totalDeChegadas: number;
	eixos: EixoDoPerfil[];
}

/** As contagens cruas, como saem do banco. */
export interface ContagensDoPerfil {
	/** Chegadas contáveis do dia (visitas). */
	chegadas: number;
	/** Pessoas distintas por trás dessas chegadas. */
	pessoas: number;
	novos: number;
	recorrentes: number;
	campanha: number;
	referencia: number;
	direto: number;
	mobile: number;
	desktop: number;
}

export const ROTULO_SEM_DADO = "Sem dado";

/**
 * O perfil quando a leitura falha.
 *
 * Na sala de guerra, perder o pulso e as conversas ao vivo porque o bloco de
 * perfil não pôde ser lido seria trocar o essencial pelo acessório. O perfil sai
 * como "sem medição · motivo" — declarado, nunca silencioso.
 */
export function perfilIndisponivel(motivo: string): PerfilDosVisitantes {
	const eixo = (chave: ChaveDoEixo, rotulo: string, unidade: string): EixoDoPerfil => ({
		chave,
		rotulo,
		unidade,
		estado: "semMedicao",
		motivo,
		total: 0,
		fracao: null,
		fatias: [],
	});

	return {
		totalDeChegadas: 0,
		eixos: [
			eixo("novidade", "Novidade", "pessoas"),
			eixo("origem", "Origem", "chegadas"),
			eixo("dispositivo", "Dispositivo", "chegadas"),
		],
	};
}

function fatias(brutas: Array<{ rotulo: string; total: number }>, total: number): FatiaDoPerfil[] {
	return brutas
		.filter((f) => f.total > 0)
		.map((f) => ({
			rotulo: f.rotulo,
			total: f.total,
			fracao: total > 0 ? f.total / total : 0,
		}));
}

/**
 * Monta os três eixos a partir das contagens cruas.
 *
 * Pura de propósito: o teste prova que a fração desenhada é a mesma que o texto
 * declara, e que eixo sem medição não desenha barra — sem abrir a janela.
 */
export function montarPerfilDosVisitantes(bruto: ContagensDoPerfil): PerfilDosVisitantes {
	const semMedicao = (chave: ChaveDoEixo, rotulo: string, unidade: string): EixoDoPerfil => ({
		chave,
		rotulo,
		unidade,
		estado: "semMedicao",
		motivo: "Sem visita de gente no período",
		total: 0,
		fracao: null,
		fatias: [],
	});

	if (bruto.chegadas === 0) {
		return {
			totalDeChegadas: 0,
			eixos: [
				semMedicao("novidade", "Novidade", "pessoas"),
				semMedicao("origem", "Origem", "chegadas"),
				semMedicao("dispositivo", "Dispositivo", "chegadas"),
			],
		};
	}

	const deNovidade = fatias(
		[
			{ rotulo: "Novos", total: bruto.novos },
			{ rotulo: "Recorrentes", total: bruto.recorrentes },
		],
		bruto.pessoas,
	);

	const deOrigemTotal = bruto.campanha + bruto.referencia + bruto.direto;
	const deOrigem = fatias(
		[
			{ rotulo: "Campanha", total: bruto.campanha },
			{ rotulo: "Referência", total: bruto.referencia },
			{ rotulo: "Direto", total: bruto.direto },
		],
		deOrigemTotal,
	);

	const deDispositivoTotal = bruto.mobile + bruto.desktop;
	const deDispositivo = fatias(
		[
			{ rotulo: "Celular", total: bruto.mobile },
			{ rotulo: "Desktop", total: bruto.desktop },
		],
		deDispositivoTotal,
	);

	return {
		totalDeChegadas: bruto.chegadas,
		eixos: [
			{
				chave: "novidade",
				rotulo: "Novidade",
				unidade: "pessoas",
				estado: deNovidade.length > 0 ? "detalhe" : "semMedicao",
				...(deNovidade.length === 0
					? { motivo: "Não foi possível separar novos de recorrentes" }
					: {}),
				total: bruto.pessoas,
				fracao: deNovidade[0]?.fracao ?? null,
				fatias: deNovidade,
			},
			{
				chave: "origem",
				rotulo: "Origem",
				unidade: "chegadas",
				estado: deOrigem.length > 0 ? "detalhe" : "semMedicao",
				...(deOrigem.length === 0 ? { motivo: "Origem não informada" } : {}),
				total: deOrigemTotal,
				fracao: deOrigem[0]?.fracao ?? null,
				fatias: deOrigem,
			},
			{
				chave: "dispositivo",
				rotulo: "Dispositivo",
				unidade: "chegadas",
				estado: deDispositivo.length > 0 ? "detalhe" : "semMedicao",
				...(deDispositivo.length === 0 ? { motivo: "Aparelho não identificado" } : {}),
				total: deDispositivoTotal,
				fracao: deDispositivo[0]?.fracao ?? null,
				fatias: deDispositivo,
			},
		],
	};
}
