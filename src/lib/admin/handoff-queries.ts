// src/lib/admin/handoff-queries.ts
//
// A caixa-preta entre "viu oferta" e "contrato" — aberta.
//
// ── D1: o funil por sub-etapa ───────────────────────────────────────────────
//
// A planilha do Gustavo trata isto como pré-requisito analítico, e com razão:
// entre a oferta na tela e a proposta assinada existem vários passos humanos
// (o cliente respondeu no WhatsApp, o especialista contatou, os documentos
// chegaram, a proposta subiu para a administradora) e uma taxa agregada não
// diz qual deles derruba.
//
// O dado para responder isso JÁ EXISTE e nunca foi lido: `lead_events` grava
// `from_stage` → `to_stage` com `created_at` desde sempre. Não é
// instrumentação nova — é dar olhos ao que já é gravado.
//
// ── D3 e E1: o SLA que ninguém verificava ───────────────────────────────────
//
// Os dois itens pedem "definir SLA de resposta humana" e "SLA de documentos
// pós-proposta". Combinar um número que ninguém mede é combinar nada — e o
// histórico deste código diz por quê: em 14/08/2026 uma cliente fechou proposta
// de R$ 211 mil, escreveu, e a notificação de handoff levou 42 minutos para ser
// entregue e 17h24 para ser lida (`src/lib/mesa/acolhida-n1.ts`). O cobertor
// (a acolhida N1) existe e o próprio arquivo é honesto ao dizer que ele **não
// conserta a campainha**.
//
// A parte de processo — quem responde, em quanto tempo — é da mesa. A parte que
// é nossa é medir, e é o que está aqui: p50 e p90 do tempo em cada estágio,
// e a lista de quem está parado além do limite.
//
// ── Por que p50 e p90, e não a média ────────────────────────────────────────
//
// Média de tempo de atendimento é o número mais enganoso que existe numa
// operação com poucos casos: um lead esquecido por duas semanas move a média de
// todo mundo e some dentro dela. A mediana diz como é o caso típico; o p90 diz
// o quão ruim fica a cauda — e é a cauda que perde venda.

import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { LeadStage } from "./lead-stages";

/**
 * As sub-etapas do handoff, na ordem em que a operação as percorre.
 *
 * Recorte deliberado: começa em `qualificado` — o primeiro estágio em que o
 * lead já é do time e não mais do bot — e termina em `fechado_ganho`. O trecho
 * anterior (visita → conversa → oferta) já é o funil de mídia da tela de
 * Performance, e repeti-lo aqui seria duas telas contando a mesma população por
 * definições diferentes, que é o defeito que `sinais-do-funil.ts` existe para
 * evitar.
 */
export const SUB_ETAPAS_HANDOFF = [
	{ estagio: "qualificado", label: "Qualificado", ajuda: "O bot entregou o lead ao time" },
	{
		estagio: "em_negociacao",
		label: "Em negociação",
		ajuda: "O especialista assumiu a conversa",
	},
	{
		estagio: "proposta_enviada",
		label: "Proposta enviada",
		ajuda: "A proposta foi apresentada ao cliente",
	},
	{
		estagio: "na_administradora",
		label: "Na administradora",
		ajuda: "Documentos entregues, cadastro em análise",
	},
	{ estagio: "em_atendimento", label: "Em atendimento", ajuda: "Acompanhamento humano ativo" },
	{
		estagio: "aguardando_pagamento",
		label: "Aguardando pagamento",
		ajuda: "Falta o cliente pagar a primeira parcela",
	},
	{ estagio: "fechado_ganho", label: "Fechado", ajuda: "Contrato fechado" },
] as const satisfies ReadonlyArray<{ estagio: LeadStage; label: string; ajuda: string }>;

export type EstagioHandoff = (typeof SUB_ETAPAS_HANDOFF)[number]["estagio"];

export interface SubEtapaHandoff {
	estagio: EstagioHandoff;
	label: string;
	ajuda: string;
	/** Leads que ALCANÇARAM este estágio (em qualquer momento, não "estão nele"). */
	alcancaram: number;
	/**
	 * % de quem chegou a esta etapa OU a qualquer posterior, sobre quem chegou à
	 * anterior (ou a qualquer posterior a ela).
	 *
	 * O denominador é acumulado PARA A FRENTE, e isso é o item inteiro:
	 * `transitionLeadStage` é forward-only e **não grava os estágios pulados**.
	 * Um lead que vai de `qualificado` direto para `proposta_enviada` — três
	 * ocorrências no recorte de 30/08 — nunca aparece em `em_negociacao`, e uma
	 * conta ingênua "alcançaram nesta ÷ alcançaram na anterior" exibiria mais de
	 * 100% na etapa seguinte. Funil que cresce é o defeito que
	 * `performance-types.ts` já documenta na tela vizinha.
	 *
	 * Com o acumulado, a leitura volta a ser a que o nome promete: de quem chegou
	 * até aqui, quantos seguiram.
	 */
	percentDaAnterior: number;
	/** Quem chegou a esta etapa OU passou dela — o denominador honesto acima. */
	alcancaramOuAlem: number;
	/** Horas medianas gastas NESTE estágio antes de sair dele. `null` sem amostra. */
	horasP50: number | null;
	/** Horas no percentil 90 — a cauda, que é onde a venda se perde. */
	horasP90: number | null;
	/** Quantos estão parados AQUI agora. */
	paradosAgora: number;
}

export interface LeadParado {
	leadId: string;
	nome: string | null;
	telefone: string | null;
	estagio: EstagioHandoff;
	desdeISO: string;
	horasParado: number;
}

export interface FunilDeHandoff {
	etapas: SubEtapaHandoff[];
	/**
	 * Quem está parado além do limite. É esta lista que faz o SLA existir: sem
	 * ela, "definir SLA" é combinar um número que ninguém verifica.
	 */
	parados: LeadParado[];
	/** O limite usado, em horas — declarado para a tela não inventar o seu. */
	limiteHoras: number;
	/**
	 * Um aviso que viaja junto do número. Com a amostra desta operação (2
	 * propostas e 0 contratos no recorte de 16–30/08), qualquer taxa depois de
	 * "proposta_enviada" é hipótese, e nenhuma decisão de investimento deveria se
	 * apoiar nela. Melhor a tela dizer isso do que o leitor supor.
	 */
	amostraSuficiente: boolean;
}

/**
 * Limite padrão de SLA, em horas.
 *
 * 24h e não 1h: o que se quer pegar aqui é o lead ESQUECIDO, não o atendente
 * que demorou uma tarde. Um alarme que dispara toda hora é um alarme que a mesa
 * desliga na primeira semana — e aí volta a não haver campainha nenhuma. O
 * número é parâmetro justamente para a mesa poder apertá-lo quando o processo
 * dela suportar.
 */
export const LIMITE_SLA_HORAS_PADRAO = 24;

/** Abaixo disto, taxa de fechamento é hipótese e a tela precisa dizer. */
const AMOSTRA_MINIMA_DE_PROPOSTAS = 10;

function num(valor: unknown): number {
	return Number(valor ?? 0) || 0;
}

function numOuNulo(valor: unknown): number | null {
	if (valor === null || valor === undefined) return null;
	const n = Number(valor);
	return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

/**
 * O funil por sub-etapa, com tempo e taxa entre elas.
 *
 * O recorte de período é pelo LEAD (quando ele nasceu), não pela transição:
 * agrupar por data de transição faria um lead que entrou em julho e fechou em
 * agosto aparecer só na segunda metade do funil, e a taxa entre etapas
 * passaria de 100%.
 */
export async function computeFunilDeHandoff(
	fromDate: Date,
	toDate: Date,
	limiteHoras: number = LIMITE_SLA_HORAS_PADRAO,
): Promise<FunilDeHandoff> {
	const estagios = SUB_ETAPAS_HANDOFF.map((e) => e.estagio);

	const resultado = await db.execute<Record<string, unknown>>(sql`
    WITH leads_da_janela AS (
      SELECT l.id
        FROM leads l
       WHERE l.is_simulated = false
         AND l.created_at BETWEEN ${fromDate} AND ${toDate}
    ),
    -- Toda transição desses leads, com o INSTANTE DA PRÓXIMA ao lado: é a
    -- diferença entre as duas que dá o tempo gasto no estágio. \`lead\` (sem
    -- transição seguinte) fica com NULL e é tratado como "ainda parado aqui".
    transicoes AS (
      SELECT e.lead_id,
             e.to_stage::text AS estagio,
             e.created_at AS entrou_em,
             LEAD(e.created_at) OVER (PARTITION BY e.lead_id ORDER BY e.created_at) AS saiu_em
        FROM lead_events e
        JOIN leads_da_janela j ON j.id = e.lead_id
    ),
    -- Uma linha por lead × estágio ALCANÇADO. \`DISTINCT\` porque o funil admite
    -- idas e vindas (um lead volta de \`perdido\` para \`em_atendimento\`) e
    -- contar duas passagens como duas pessoas inflaria a etapa.
    alcancados AS (
      SELECT DISTINCT lead_id, estagio FROM transicoes
    ),
    tempos AS (
      SELECT estagio,
             percentile_cont(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (saiu_em - entrou_em)) / 3600.0
             ) AS p50,
             percentile_cont(0.9) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (saiu_em - entrou_em)) / 3600.0
             ) AS p90
        FROM transicoes
       WHERE saiu_em IS NOT NULL
       GROUP BY estagio
    ),
    -- Quem está parado AGORA neste estágio: é o estágio corrente do lead.
    parados AS (
      SELECT l.stage::text AS estagio, count(*) AS n
        FROM leads l
        JOIN leads_da_janela j ON j.id = l.id
       GROUP BY 1
    )
    SELECT s.estagio,
           (SELECT count(*) FROM alcancados a WHERE a.estagio = s.estagio) AS alcancaram,
           (SELECT p50 FROM tempos t WHERE t.estagio = s.estagio) AS p50,
           (SELECT p90 FROM tempos t WHERE t.estagio = s.estagio) AS p90,
           (SELECT coalesce(n, 0) FROM parados p WHERE p.estagio = s.estagio) AS parados_agora
      FROM unnest(${sql.raw(`ARRAY[${estagios.map((e) => `'${e}'`).join(",")}]::text[]`)}) AS s(estagio)
  `);

	const porEstagio = new Map(resultado.rows.map((linha) => [String(linha.estagio), linha]));

	// Quem chegou a cada etapa, cru.
	const brutos = SUB_ETAPAS_HANDOFF.map((etapa) => {
		const linha = porEstagio.get(etapa.estagio) ?? {};
		return { etapa, linha, alcancaram: num(linha.alcancaram) };
	});

	// E o acumulado PARA A FRENTE — a correção do pulo de estágio. Ver o
	// docblock de `percentDaAnterior`: sem isto o painel exibe ">100% da
	// anterior" toda vez que um lead salta uma etapa, o que os dados do próprio
	// dia já produzem (`qualificado → proposta_enviada`, 3 ocorrências).
	const acumulado: number[] = new Array(brutos.length).fill(0);
	for (let i = brutos.length - 1; i >= 0; i--) {
		acumulado[i] = Math.max(brutos[i].alcancaram, acumulado[i + 1] ?? 0);
	}

	const etapas: SubEtapaHandoff[] = brutos.map(({ etapa, linha, alcancaram }, indice) => {
		const anterior = indice === 0 ? 0 : acumulado[indice - 1];
		// A primeira etapa é o topo deste funil: 100% por definição, não 0%.
		const percentDaAnterior =
			indice === 0
				? 100
				: anterior > 0
					? Math.round((acumulado[indice] / anterior) * 1000) / 10
					: 0;

		return {
			estagio: etapa.estagio,
			label: etapa.label,
			ajuda: etapa.ajuda,
			alcancaram,
			alcancaramOuAlem: acumulado[indice],
			percentDaAnterior,
			horasP50: numOuNulo(linha.p50),
			horasP90: numOuNulo(linha.p90),
			paradosAgora: num(linha.parados_agora),
		};
	});

	const parados = await computeLeadsParados(limiteHoras);
	const propostas = etapas.find((e) => e.estagio === "proposta_enviada")?.alcancaram ?? 0;

	return {
		etapas,
		parados,
		limiteHoras,
		amostraSuficiente: propostas >= AMOSTRA_MINIMA_DE_PROPOSTAS,
	};
}

/**
 * Quem está parado além do limite — a campainha do D3/E1.
 *
 * Sem janela de período de propósito: um lead esquecido em julho continua
 * esquecido hoje, e some da tela justamente quando o filtro de data se estreita.
 * O que importa aqui não é "quando ele entrou", é "há quanto tempo ninguém
 * mexe".
 *
 * ── Duas correções de 30/08/2026, as duas sobre o mesmo risco ───────────────
 *
 * **A lista é ALLOWLIST**, e começa em `qualificado`. O filtro por exclusão
 * ("tudo menos `fechado_ganho`, `perdido` e `novo`") deixava `engajado` entrar
 * — e `engajado` é estágio PRÉ-handoff: o próprio `SUB_ETAPAS_HANDOFF` começa
 * em `qualificado`, "o bot entregou o lead ao time". Com 11 leads em `engajado`
 * no recorte do dia, um terço da lista seria de gente que a mesa nunca recebeu.
 * É exatamente assim que se constrói o alarme que a operação desliga na
 * primeira semana — e aí volta a não haver campainha nenhuma.
 *
 * **O relógio é a última TRANSIÇÃO DE ESTÁGIO, não `leads.updated_at`.** Aquela
 * coluna tem `$onUpdate` e é bumpada por qualquer escrita na linha, inclusive
 * por manutenção que nada tem a ver com atendimento (`contacts/backfill.ts`,
 * `contacts/resolve.ts`). Um backfill zeraria todos os relógios de SLA em
 * silêncio, e a tela diria que a mesa está em dia no dia seguinte a um lead
 * esquecido há duas semanas. `lead_events` é append-only e só registra
 * movimento real do funil: é ele que responde "há quanto tempo ninguém age",
 * que é a pergunta que o item faz.
 */
export async function computeLeadsParados(
	limiteHoras: number = LIMITE_SLA_HORAS_PADRAO,
): Promise<LeadParado[]> {
	const resultado = await db.execute<Record<string, unknown>>(sql`
    SELECT l.id,
           l.name,
           l.phone,
           l.stage::text AS estagio,
           -- O relogio e a ULTIMA TRANSICAO DE ESTAGIO, nunca updated_at.
           -- Ver o comentario acima da funcao: updated_at e bumpado por
           -- qualquer escrita na linha, inclusive manutencao.
           COALESCE(
             (SELECT max(e.created_at) FROM lead_events e WHERE e.lead_id = l.id),
             l.created_at
           ) AS desde,
           EXTRACT(EPOCH FROM (now() - COALESCE(
             (SELECT max(e.created_at) FROM lead_events e WHERE e.lead_id = l.id),
             l.created_at
           ))) / 3600.0 AS horas
      FROM leads l
     WHERE l.is_simulated = false
       -- ALLOWLIST, e nao "tudo menos tres" -- ver o comentario da funcao.
       AND l.stage::text IN (
         'qualificado', 'em_negociacao', 'proposta_enviada',
         'na_administradora', 'em_atendimento', 'aguardando_pagamento'
       )
       AND COALESCE(
             (SELECT max(e.created_at) FROM lead_events e WHERE e.lead_id = l.id),
             l.created_at
           ) < now() - make_interval(hours => ${limiteHoras})
     -- Mais antigo primeiro: e ele quem a mesa tem que ligar agora.
     ORDER BY desde ASC
     LIMIT 100
  `);

	return resultado.rows.map((linha) => ({
		leadId: String(linha.id),
		nome: linha.name === null ? null : String(linha.name),
		telefone: linha.phone === null ? null : String(linha.phone),
		estagio: String(linha.estagio) as EstagioHandoff,
		desdeISO: new Date(linha.desde as string).toISOString(),
		horasParado: numOuNulo(linha.horas) ?? 0,
	}));
}
