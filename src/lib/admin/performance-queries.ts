/**
 * Queries da tela de Performance — o funil que começa na VISITA.
 *
 * Duas regras atravessam o arquivo:
 *
 * 1. **Simulado nunca entra.** `is_simulated` filtra conversa e lead em toda
 *    query. Teste interno inflando o relatório é como verba vai pro criativo
 *    errado. (Mesma regra do `realLeads` em `dashboard-queries.ts`.)
 * 2. **Nada é derivado de tabela de evento paralela.** Cada etapa vem da tabela
 *    que é dona do fato — a decisão está na spec de 2026-08-03.
 */

import { type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { sqlEscreveuAlgoProprio, sqlSoPrePreenchida } from "@/lib/funil/mensagem-pre-preenchida";
import {
	bemDaChave,
	faixaDeValor,
	ROTULO_DO_BEM,
	ROTULO_SEM_VALOR,
	rotuloDaFaixa,
} from "@/lib/funil/quem-chegou";
import { rotularOrigem } from "./origem-label";
import {
	type ChaveEtapaFunil,
	type CoberturaAtribuicao,
	ETAPAS_FUNIL_MIDIA,
	ETAPAS_RAMIFICADAS,
	type EtapaFunilMidia,
	type LinhaOrigem,
	type PontoSerie,
	type PortaDoFunil,
	type QuemChegou,
} from "./performance-types";
import {
	ARTIFACTS_DE_OFERTA_SQL,
	chaveDaPessoa,
	contagensDoFunil,
	conversaAtribuida,
	conversaIdentificada,
	conversaViva,
	teveProposta,
	VISITA_CONTAVEL,
	VISITA_DE_GENTE,
	viuOferta,
} from "./sinais-do-funil";

/** O dia que o negócio enxerga. A operação é brasileira; o servidor é UTC. */
const TZ = "America/Sao_Paulo";

/**
 * Dia de um timestamp no fuso do negócio, já como TEXTO `YYYY-MM-DD`.
 *
 * Devolver texto, e não `date`, é de propósito: com `DATE(...)` o driver
 * converte a data pra `Date` no fuso do processo Node e o dia 15 vira 14 no
 * caminho de volta. Foi assim que o gráfico apareceu deslocado um dia no
 * primeiro teste de integração.
 */
function diaLocal(coluna: SQL): SQL {
	return sql`to_char(${coluna} AT TIME ZONE ${TZ}, 'YYYY-MM-DD')`;
}

/**
 * As chaves de dia entre duas datas, no MESMO fuso do agrupamento SQL. Caminha
 * ao meio-dia UTC pra que mudança de horário de verão não pule nem repita dia.
 */
function diasEntre(fromDate: Date, toDate: Date): string[] {
	const formatador = new Intl.DateTimeFormat("en-CA", {
		timeZone: TZ,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});

	const inicio = formatador.format(fromDate);
	const fim = formatador.format(toDate);

	const chaves: string[] = [];
	let cursor = new Date(`${inicio}T12:00:00Z`);
	const limite = new Date(`${fim}T12:00:00Z`);

	while (cursor <= limite && chaves.length < 400) {
		chaves.push(formatador.format(cursor));
		cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
	}
	return chaves;
}

function pct(parte: number, todo: number): number {
	return todo > 0 ? Math.round((parte / todo) * 1000) / 10 : 0;
}

function num(valor: unknown): number {
	return Number(valor ?? 0) || 0;
}

// ─── Funil de mídia ─────────────────────────────────────────────────────────

export async function computeFunilMidia(fromDate: Date, toDate: Date): Promise<EtapaFunilMidia[]> {
	// `atribuida` é o coração da correção: TODA etapa depois de `visitas` conta
	// só conversa que nasceu de uma visita (ver `conversaAtribuida`, na fonte
	// única dos sinais do funil — a mesma que a tela de Campanhas usa para
	// declarar as conversas que ficam fora).
	const atribuida = conversaAtribuida(fromDate, toDate);

	// A CHAVE DA PESSOA — a fonte única de `sinais-do-funil`, a mesma que a Porta
	// e o Percurso usam. Cada degrau conta PESSOAS, não conversas: cinco conversas
	// do mesmo telefone são uma pessoa (decisão do dono, 23/09/2026). Duas
	// definições de pessoa divergem no primeiro caso raro, com o mesmo rótulo.
	const chave = chaveDaPessoa(fromDate, toDate);

	// AJA-01 — as duas metades do que era só "tem mensagem do usuário".
	// `engajou` é o que o negócio chama de "iniciou a conversa";
	// `so_pre_preenchida` é quem só apertou enviar no texto que o CTA escreveu.
	const engajou = sqlEscreveuAlgoProprio(sql`c.id`);
	const soPrePreenchida = sqlSoPrePreenchida(sql`c.id`);

	const resultado = await db.execute<Record<string, unknown>>(sql`
    SELECT
      (SELECT count(*) FROM visits v
        WHERE v.created_at BETWEEN ${fromDate} AND ${toDate}
          AND ${VISITA_CONTAVEL}) AS visitas,

      (SELECT count(DISTINCT ${chave}) FROM conversations c
        JOIN visits v ON v.id = c.visit_id
        WHERE ${atribuida}) AS conversas,

      -- 'engajadas' EXIGE mensagem que o produto NÃO escreveu (AJA-01).
      -- Era 'EXISTS messages.role='user'', e o CTA entrega a primeira fala já
      -- pronta: 47% das conversas web medidas em produção tinham uma única
      -- mensagem, e ela era o texto do anúncio. O predicado mora em
      -- 'src/lib/funil/mensagem-pre-preenchida', o mesmo da tela de Percurso.
      (SELECT count(DISTINCT ${chave}) FROM conversations c
        JOIN visits v ON v.id = c.visit_id
        WHERE ${atribuida} AND ${engajou}) AS engajadas,

      -- O degrau que faltava: existe mensagem do cliente, e TODAS são texto do
      -- produto. Era o vazamento somado dentro de "Engajaram".
      (SELECT count(DISTINCT ${chave}) FROM conversations c
        JOIN visits v ON v.id = c.visit_id
        WHERE ${atribuida} AND ${soPrePreenchida}) AS so_pre_preenchida,

      -- Conta PESSOAS identificadas: a regra é do CANAL e o fragmento é o
      -- compartilhado com Percurso, Exportação e Campanhas.
      (SELECT count(DISTINCT ${chave}) FROM conversations c
        JOIN visits v ON v.id = c.visit_id
        WHERE ${atribuida} AND ${conversaIdentificada(sql`c`)}) AS identificados,

      (SELECT count(DISTINCT ${chave}) FROM conversations c
        JOIN visits v ON v.id = c.visit_id
        JOIN messages m ON m.conversation_id = c.id
        JOIN artifacts a ON a.message_id = m.id
        WHERE ${atribuida}
          AND a.type IN (${ARTIFACTS_DE_OFERTA_SQL})) AS viram_oferta,

      (SELECT count(DISTINCT ${chave}) FROM conversations c
        JOIN visits v ON v.id = c.visit_id
        JOIN bevi_proposals bp ON bp.conversation_id = c.id
        WHERE ${atribuida}) AS propostas,

      (SELECT count(DISTINCT ${chave}) FROM conversations c
        JOIN visits v ON v.id = c.visit_id
        JOIN leads l ON l.conversation_id = c.id
          AND l.is_simulated = false
          AND l.stage = 'fechado_ganho'
        WHERE ${atribuida}) AS fechados
  `);

	// ONDE CADA PESSOA PAROU — e se ela ainda está de pé. A leitura mora em
	// `pessoasQuePararam` (com o critério de vida compartilhado com o Percurso, em
	// `conversaViva`); aqui só o agregado por degrau entra no funil.
	const paradas = await pessoasQuePararam(fromDate, toDate);

	// Chave da etapa → quantas PESSOAS pararam ali e quantas seguem vivas. A
	// unidade do mapa é a mesma do `count` acima (pessoa), senão a soma das
	// paradas deixaria de fechar com o topo do funil.
	const pararamPorEtapa = new Map<string, { pararam: number; vivas: number }>();
	for (const p of paradas) {
		const atual = pararamPorEtapa.get(p.etapa) ?? { pararam: 0, vivas: 0 };
		atual.pararam += 1;
		if (p.viva) atual.vivas += 1;
		pararamPorEtapa.set(p.etapa, atual);
	}

	const linha = resultado.rows[0] ?? {};
	const topo = num(linha.visitas);
	const conversas = num(linha.conversas);

	let anterior = 0;
	return ETAPAS_FUNIL_MIDIA.map((etapa, i) => {
		const count = num(linha[etapa.chave]);
		// Ramificação não tem "etapa anterior": ela reparte a etapa de cima, e
		// medir queda contra a etapa anterior inventaria um encolhimento que
		// ninguém viveu. Ver `ETAPAS_RAMIFICADAS`.
		const quedaDaAnterior = ETAPAS_RAMIFICADAS.has(etapa.chave)
			? 0
			: i === 0 || anterior === 0
				? 0
				: Math.max(0, pct(anterior - count, anterior));
		// `visitas` é o índice 0 do array e não é etapa de conversa — a
		// profundidade 1 ("abriu e não escreveu") casa com `conversas`, no índice 1.
		const parada = pararamPorEtapa.get(etapa.chave);
		const resultadoEtapa: EtapaFunilMidia = {
			chave: etapa.chave,
			label: etapa.label,
			ajuda: etapa.ajuda,
			count,
			percentDoTopo: pct(count, topo),
			percentDasConversas: etapa.chave === "visitas" ? 100 : pct(count, conversas),
			quedaDaAnterior,
			pararamAqui: parada?.pararam ?? 0,
			aindaVivas: parada?.vivas ?? 0,
		};
		// A cadeia avança mesmo quando a etapa é ramificação: o "anterior" de quem
		// vem depois dela continua sendo a etapa de cima, e não a ramificação.
		if (!ETAPAS_RAMIFICADAS.has(etapa.chave)) anterior = count;
		return resultadoEtapa;
	});
}

/**
 * Uma PESSOA parada num degrau do funil de mídia — e se ela ainda está viva.
 *
 * Existe como leitura separada por duas razões: a tela precisa do AGREGADO por
 * degrau, e o teste de equivalência precisa dos IDS — comparar contagem entre
 * duas telas não prova que elas falam das mesmas pessoas.
 */
export interface PessoaParada {
	/** A chave de `chaveDaPessoa`: o contato quando conhecido, senão o visitante. */
	chave: string;
	/** O degrau MAIS FUNDO que a pessoa alcançou — uma pessoa, um degrau. */
	etapa: ChaveEtapaFunil;
	/** O cliente escreveu na janela recente e a conversa não foi encerrada. */
	viva: boolean;
}

/**
 * ONDE CADA PESSOA PAROU — e se ela ainda está de pé.
 *
 * O funil dizia "44,4% saíram aqui" e parava por aí. Duas pessoas paradas na
 * mesma etapa pedem decisões opostas: a que morreu manda consertar o agente; a
 * que ainda responde manda puxar de volta (o watchdog de retomada existe
 * exatamente para isso). Sem separar, o painel manda consertar o que só
 * precisava de um empurrão.
 *
 * `lastInboundAt` não serve como sinal de vida: é específico do WhatsApp
 * (schema). A última mensagem do CLIENTE vale nos dois canais — e o critério
 * vive em `conversaViva` (`sinais-do-funil`), o MESMO que o Percurso lê.
 *
 * A parada é por PESSOA, no degrau mais fundo que ela alcançou. Contando
 * conversa, quem voltou e abriu duas — uma que engajou, outra que virou
 * proposta — aparecia parada em dois degraus, e a soma das paradas passava do
 * topo do funil (que conta pessoa).
 */
export async function pessoasQuePararam(fromDate: Date, toDate: Date): Promise<PessoaParada[]> {
	const atribuida = conversaAtribuida(fromDate, toDate);
	// A chave da PESSOA — a mesma de computePorta e da escada do Percurso.
	const chave = chaveDaPessoa(fromDate, toDate);
	const engajou = sqlEscreveuAlgoProprio(sql`c.id`);
	const soPrePreenchida = sqlSoPrePreenchida(sql`c.id`);

	const resultado = await db.execute<Record<string, unknown>>(sql`
    WITH conv AS (
      SELECT
        ${chave} AS chave,
        ${conversaViva(sql`(SELECT max(m.created_at) FROM messages m
          WHERE m.conversation_id = c.id AND m.role = 'user')`)} AS viva,
      -- O ONDE CADA CONVERSA PAROU tem um degrau a mais: quem só mandou a
      -- mensagem pré-preenchida era contado como engajado. As duas colunas
      -- ("engajou" e "so_pre_preenchida") saem do MESMO predicado que as
      -- contagens do funil — duas definições de "escreveu" divergiriam no
      -- primeiro dia, com o mesmo rótulo na mesma tela.
        ${engajou} AS engajou,
        ${soPrePreenchida} AS so_pre_preenchida,
        ${conversaIdentificada(sql`c`)} AS identificou,
        ${viuOferta(sql`c`)} AS viu_oferta,
        ${teveProposta(sql`c`)} AS teve_proposta,
        EXISTS (SELECT 1 FROM leads l
          WHERE l.conversation_id = c.id AND l.is_simulated = false
            AND l.stage = 'fechado_ganho') AS fechou
      FROM conversations c
      JOIN visits v ON v.id = c.visit_id
      WHERE ${atribuida}
    ),
    profundidade AS (
      SELECT
        chave,
        max(CASE
          WHEN fechou THEN 7
          WHEN teve_proposta THEN 6
          WHEN viu_oferta THEN 5
          WHEN identificou THEN 4
          WHEN engajou THEN 3
          WHEN so_pre_preenchida THEN 2
          ELSE 1
        END) AS etapa,
        -- Por PESSOA: basta UMA conversa viva para ela ser retomável.
        bool_or(viva) AS viva
      FROM conv
      GROUP BY chave
    )
    SELECT chave, etapa, viva FROM profundidade
  `);

	return resultado.rows.map((linha) => {
		const indice = Math.min(Math.max(num(linha.etapa), 1), ETAPAS_FUNIL_MIDIA.length - 1);
		return {
			chave: String(linha.chave),
			etapa: ETAPAS_FUNIL_MIDIA[indice].chave,
			viva: linha.viva === true,
		};
	});
}

/**
 * O limiar de entrada: quantas chegadas viraram conversa.
 *
 * Separado do funil de propósito — ver `PortaDoFunil`.
 */
export async function computePorta(fromDate: Date, toDate: Date): Promise<PortaDoFunil> {
	const resultado = await db.execute<Record<string, unknown>>(sql`
    SELECT
      -- PESSOAS, com a MESMA chave que a tela de Percurso usa (sinais-do-funil).
      -- Duas telas contando a mesma população por definicoes diferentes foi o
      -- defeito que este numero existe para fechar.
      (SELECT count(DISTINCT ${chaveDaPessoa(fromDate, toDate)}) FROM visits v
        WHERE v.created_at BETWEEN ${fromDate} AND ${toDate}
          AND ${VISITA_DE_GENTE}) AS pessoas,
      (SELECT count(*) FROM visits v
        WHERE v.created_at BETWEEN ${fromDate} AND ${toDate}
          AND ${VISITA_CONTAVEL}) AS visitas,
      (SELECT count(*) FROM conversations c
        WHERE c.is_simulated = false
          AND c.visit_id IS NOT NULL
          AND c.created_at BETWEEN ${fromDate} AND ${toDate}) AS conversas,
      -- As mesmas conversas, contadas por PESSOA. É este o número que fecha com a
      -- escada do Percurso; "conversas" fica ao lado, como sublinha.
      -- A visita TAMBÉM precisa estar no período. Sem isso, quem chegou ontem às
      -- 23h e abriu o chat hoje às 00h10 entra no numerador e não no denominador,
      -- e a taxa passa de 100%. Com a janela de um dia isso deixa de ser borda.
      (SELECT count(DISTINCT ${chaveDaPessoa(fromDate, toDate)})
        FROM conversations c
        JOIN visits v ON v.id = c.visit_id
        WHERE c.is_simulated = false
          AND c.created_at BETWEEN ${fromDate} AND ${toDate}
          AND v.created_at BETWEEN ${fromDate} AND ${toDate}) AS pessoas_que_conversaram,
      (SELECT count(*) FROM conversations c
        WHERE c.is_simulated = false
          AND c.visit_id IS NOT NULL
          AND c.channel = 'web'
          AND c.created_at BETWEEN ${fromDate} AND ${toDate}) AS web,
      (SELECT count(*) FROM conversations c
        WHERE c.is_simulated = false
          AND c.visit_id IS NOT NULL
          AND c.channel = 'whatsapp'
          AND c.created_at BETWEEN ${fromDate} AND ${toDate}) AS whatsapp
  `);
	const linha = resultado.rows[0] ?? {};
	const pessoas = num(linha.pessoas);
	const visitas = num(linha.visitas);
	const conversas = num(linha.conversas);
	const pessoasQueConversaram = num(linha.pessoas_que_conversaram);
	return {
		pessoas,
		visitas,
		pessoasQueConversaram,
		conversas,
		// Pessoa sobre pessoa, nas duas pontas. Com conversas em cima e pessoas
		// embaixo, a taxa passava de 100% no dia em que alguém abrisse o chat duas
		// vezes — e era exatamente esse alguém que fazia as duas telas divergirem.
		taxaDeEntrada: pct(pessoasQueConversaram, pessoas),
		web: num(linha.web),
		whatsapp: num(linha.whatsapp),
	};
}

// ─── "Quem chegou" — o cheiro de perfil ────────────────────────────────

/**
 * A distribuição de QUEM INICIOU A CONVERSA, por bem e por faixa de valor.
 *
 * Por que "iniciou a conversa" e não "abriu o chat": é o degrau que o AJA-01
 * separou do texto do anúncio. Misturar quem só apertou enviar no CTA com quem
 * escreveu algo mudaria o perfil — e o perfil é justamente o que se quer ler.
 */
export async function computeQuemChegou(fromDate: Date, toDate: Date): Promise<QuemChegou> {
	// O valor vem de `metadata.qualifyAnswers.creditMax` — o que a pessoa informou
	// no gate de crédito. A conversão é guardada por regex: o `jsonb` é livre, e
	// um `::numeric` direto derrubaria a tela inteira no dia em que alguém gravar
	// "80 mil" ali.
	const resultado = await db.execute<Record<string, unknown>>(sql`
    SELECT
      c.metadata->>'currentCategory' AS bem,
      CASE
        WHEN c.metadata->'qualifyAnswers'->>'creditMax' ~ '^[0-9]+(\.[0-9]+)?$'
        THEN (c.metadata->'qualifyAnswers'->>'creditMax')::numeric
      END AS valor,
      count(*) AS total
    FROM conversations c
    WHERE c.is_simulated = false
      AND c.visit_id IS NOT NULL
      AND c.created_at BETWEEN ${fromDate} AND ${toDate}
      AND ${sqlEscreveuAlgoProprio(sql`c.id`)}
    GROUP BY 1, 2
  `);

	let total = 0;
	let comValorInformado = 0;
	const porBem = new Map<string, number>();
	const porFaixa = new Map<string, number>();

	for (const linha of resultado.rows) {
		const quantidade = num(linha.total);
		total += quantidade;

		const bem = bemDaChave(linha.bem);
		const rotuloDoBem = bem ? ROTULO_DO_BEM[bem] : ROTULO_SEM_VALOR;
		porBem.set(rotuloDoBem, (porBem.get(rotuloDoBem) ?? 0) + quantidade);

		const faixa = faixaDeValor(linha.valor === null ? null : num(linha.valor));
		if (faixa) comValorInformado += quantidade;
		const rotulo = faixa ? rotuloDaFaixa(faixa) : ROTULO_SEM_VALOR;
		porFaixa.set(rotulo, (porFaixa.get(rotulo) ?? 0) + quantidade);
	}

	return {
		total,
		// A ordem é a do dicionário, e não a do volume: barra que troca de lugar
		// entre dois períodos não deixa comparar um com o outro.
		porBem: [...porBem.entries()].map(([rotulo, quantidade]) => ({
			rotulo,
			total: quantidade,
		})),
		porFaixa: [...porFaixa.entries()].map(([rotulo, quantidade]) => ({
			rotulo,
			total: quantidade,
		})),
		comValorInformado,
	};
}

// ─── Desempenho por origem ──────────────────────────────────────────────────

export async function computeOrigens(fromDate: Date, toDate: Date): Promise<LinhaOrigem[]> {
	// O host do referrer só entra no agrupamento quando NÃO há campanha: senão
	// uma mesma campanha alcançada por dois referrers viraria duas linhas com o
	// mesmo nome na tela.
	const resultado = await db.execute<Record<string, unknown>>(sql`
    SELECT
      -- Fonte em minúscula: o que chega aqui é o que o anunciante DIGITOU na
      -- UTM, e "IG" e "ig" são a mesma campanha. Sem normalizar, a mesma
      -- campanha virava duas linhas na tabela com os números partidos — o
      -- defeito que a consolidação por rótulo, logo abaixo, existe para evitar
      -- e que ela não pegava por ser sensível a caixa.
      lower(v.utm_source) AS utm_source,
      v.utm_medium, v.utm_campaign, v.utm_content,
      v.ctwa_source_id, v.ctwa_headline,
      CASE
        WHEN v.utm_source IS NULL AND v.ctwa_source_id IS NULL AND v.referrer IS NOT NULL
        THEN split_part(regexp_replace(v.referrer, '^https?://', ''), '/', 1)
      END AS referrer_host,
      -- O id de campanha da Meta. É a chave de MAIOR FORÇA para resolver o nome
      -- real (chaveDeOrigem): a UTM é texto que o anunciante digitou e quase
      -- nunca casa com o espelho local. Sem ele esta tabela seguiria mostrando o
      -- id abreviado — e o sufixo de seis dígitos casa com duas campanhas
      -- diferentes (medido em 17/09/2026).
      v.campaign_id AS campaign_id,
      -- Só a CONTAGEM despreza o eco. O eco não pode sair do WHERE porque a
      -- conversa fica ligada à ÚLTIMA visita da rajada (o cookie da sessão
      -- termina apontando para ela): filtrar as linhas aqui apagaria da tabela
      -- por origem 18 das 47 conversas com visita, medido em produção.
      --
      -- As cinco contagens vêm de contagensDoFunil, o MESMO fragmento que a
      -- tela de Campanhas usa. Era aqui o único lugar que sabia medir o degrau;
      -- agrupar por campanha não é motivo para ter uma segunda contagem.
      ${contagensDoFunil(fromDate, toDate)}
    FROM visits v
    LEFT JOIN conversations c ON c.visit_id = v.id AND c.is_simulated = false
    LEFT JOIN leads l ON l.conversation_id = c.id AND l.is_simulated = false
    LEFT JOIN bevi_proposals bp ON bp.conversation_id = c.id
    WHERE v.created_at BETWEEN ${fromDate} AND ${toDate}
      AND ${VISITA_DE_GENTE}
    GROUP BY 1,2,3,4,5,6,7,8
  `);

	// Consolidação por RÓTULO: duas linhas do banco podem virar o mesmo nome na
	// tela (ex.: mesma campanha com e sem `utm_medium`). Somar aqui evita a tela
	// mostrar a mesma campanha duas vezes com números partidos.
	const porLabel = new Map<string, LinhaOrigem>();

	for (const linha of resultado.rows) {
		const origem = rotularOrigem({
			utmSource: (linha.utm_source as string) ?? null,
			utmMedium: (linha.utm_medium as string) ?? null,
			utmCampaign: (linha.utm_campaign as string) ?? null,
			utmContent: (linha.utm_content as string) ?? null,
			ctwaSourceId: (linha.ctwa_source_id as string) ?? null,
			ctwaHeadline: (linha.ctwa_headline as string) ?? null,
			referrerHost: (linha.referrer_host as string) ?? null,
			campaignId: (linha.campaign_id as string) ?? null,
		});

		const atual = porLabel.get(origem.label) ?? {
			origem,
			visitas: 0,
			conversas: 0,
			identificados: 0,
			comTelefone: 0,
			propostas: 0,
			fechados: 0,
			taxaFechamento: 0,
		};

		atual.visitas += num(linha.visitas);
		atual.conversas += num(linha.conversas);
		atual.identificados += num(linha.identificados);
		atual.comTelefone += num(linha.com_contato);
		atual.propostas += num(linha.propostas);
		atual.fechados += num(linha.fechados);

		porLabel.set(origem.label, atual);
	}

	return [...porLabel.values()]
		.map((linha) => ({ ...linha, taxaFechamento: pct(linha.fechados, linha.visitas) }))
		.sort((a, b) => b.visitas - a.visitas || b.fechados - a.fechados);
}

// ─── Série temporal ─────────────────────────────────────────────────────────

export async function computeSerie(fromDate: Date, toDate: Date): Promise<PontoSerie[]> {
	const resultado = await db.execute<Record<string, unknown>>(sql`
    WITH v AS (
      SELECT ${diaLocal(sql`v.created_at`)} AS dia, count(*) AS total
      FROM visits v WHERE v.created_at BETWEEN ${fromDate} AND ${toDate}
        AND ${VISITA_CONTAVEL}
      GROUP BY 1
    ),
    -- Mesma população do funil de mídia (conversa COM origem). Contar aqui o
    -- total e lá o atribuído colocaria dois números diferentes com o mesmo
    -- nome na mesma tela.
    c AS (
      SELECT ${diaLocal(sql`created_at`)} AS dia, count(*) AS total
      FROM conversations
      WHERE is_simulated = false AND visit_id IS NOT NULL
        AND created_at BETWEEN ${fromDate} AND ${toDate} GROUP BY 1
    ),
    l AS (
      SELECT ${diaLocal(sql`c.created_at`)} AS dia, count(DISTINCT c.id) AS total
      FROM conversations c
      WHERE c.is_simulated = false AND c.visit_id IS NOT NULL
        AND ${conversaIdentificada(sql`c`)}
        AND c.created_at BETWEEN ${fromDate} AND ${toDate} GROUP BY 1
    )
    SELECT
      COALESCE(v.dia, c.dia, l.dia) AS dia,
      COALESCE(v.total, 0) AS visitas,
      COALESCE(c.total, 0) AS conversas,
      COALESCE(l.total, 0) AS identificados
    FROM v FULL OUTER JOIN c ON c.dia = v.dia
           FULL OUTER JOIN l ON l.dia = COALESCE(v.dia, c.dia)
  `);

	const porDia = new Map<string, PontoSerie>();
	for (const linha of resultado.rows) {
		const dia = String(linha.dia);
		porDia.set(dia, {
			date: dia,
			visitas: num(linha.visitas),
			conversas: num(linha.conversas),
			identificados: num(linha.identificados),
		});
	}

	// Preenche os buracos: dia sem movimento tem que aparecer como zero, senão o
	// gráfico "pula" o feriado e a linha mente sobre a tendência.
	const pontos: PontoSerie[] = [];
	for (const chave of diasEntre(fromDate, toDate)) {
		pontos.push(porDia.get(chave) ?? { date: chave, visitas: 0, conversas: 0, identificados: 0 });
	}
	return pontos;
}

// ─── Cobertura de atribuição ────────────────────────────────────────────────

export async function computeCobertura(fromDate: Date, toDate: Date): Promise<CoberturaAtribuicao> {
	const resultado = await db.execute<Record<string, unknown>>(sql`
    SELECT
      count(*) FILTER (WHERE is_simulated = false AND visit_id IS NOT NULL) AS com_origem,
      count(*) FILTER (WHERE is_simulated = false) AS total,
      count(*) FILTER (WHERE is_simulated = true) AS de_teste
    FROM conversations
    WHERE created_at BETWEEN ${fromDate} AND ${toDate}
  `);

	const linha = resultado.rows[0] ?? {};
	const conversasComOrigem = num(linha.com_origem);
	const conversasTotal = num(linha.total);

	return {
		conversasComOrigem,
		conversasTotal,
		percent: pct(conversasComOrigem, conversasTotal),
		// A conversa de TESTE não entra no total do funil (é o recorte que a tela
		// declara) e não pode entrar aqui: misturá-la faria a porcentagem de
		// atribuição cair por causa de conversa que não é do negócio.
		conversasDeTeste: num(linha.de_teste),
	};
}
