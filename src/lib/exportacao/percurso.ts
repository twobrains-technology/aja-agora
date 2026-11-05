/**
 * EXPORTAR PERCURSO — uma linha por PESSOA.
 *
 * Evolui `scripts/exportar-percurso-prod.mjs` para dentro do módulo (o script
 * era um CSV manual, com o SQL embutido e sem "vínculo ausente" declarado).
 * A query é a mesma, com duas mudanças que o pedido do Gustavo exige:
 *
 *   1. **Vazio sai escrito.** O script deixava a célula em branco quando não
 *      havia contato, nome, telefone, e-mail ou conversa; aqui cada ausência
 *      vira texto de `textos.ts`.
 *   2. **Janela e mascaramento são parâmetros**, não constantes do arquivo.
 *
 * Quem chegou e **não** falou continua aparecendo (`incluirSemConversa`, padrão
 * `true`): é a metade do problema que a exportação existe para mostrar, e o
 * pedido pede explicitamente "incluir quem não virou lead, quem interrompeu".
 */

import { type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import type { Campanhas } from "@/lib/admin/campanhas";
import { predicadoDeOrigemNaVisita } from "@/lib/admin/filtro-origem";
import { cteDoBracoDaPessoa, NOME_DO_CTE_DO_BRACO_DA_PESSOA } from "@/lib/admin/filtro-variante";
import {
	type ModoDoPasso,
	ORDEM_DOS_PASSOS,
	PASSOS_DO_PERCURSO,
	type PassoDoPercurso,
} from "@/lib/admin/percurso-types";
import {
	chaveDaPessoa,
	conversaIdentificada,
	teveProposta,
	viuOferta,
} from "@/lib/admin/sinais-do-funil";
import {
	EXPERIMENTOS,
	type Experimento,
	type RecorteAB,
	SEM_BRACO,
} from "@/lib/experimentos/registro";
import { sqlEscreveuAlgoProprio, sqlSoPrePreenchida } from "@/lib/funil/mensagem-pre-preenchida";
import { isoDeSaoPaulo } from "./conversas";
import { colunaDoBraco, type LinhaExportada } from "./formato";
import { mascararEmail, mascararNome, mascararTelefone } from "./mascarar";
import {
	INDISPONIVEL_EMAIL,
	INDISPONIVEL_NOME,
	INDISPONIVEL_TELEFONE,
	listaDeIndisponiveis,
	SEM_BRACO_NO_EXPORT,
	SEM_RESULTADO_COMERCIAL,
	SEM_VINCULO_SEM_CONTATO,
	SEM_VINCULO_VISITA_SEM_ORIGEM,
} from "./textos";

export interface OpcoesDePercurso {
	de: Date;
	ate: Date;
	/** `true` (padrão) mascara telefone, e-mail e nome. */
	mascarar?: boolean;
	/** Padrão `true`: inclui a visita sem conversa (quem não virou lead). */
	incluirSemConversa?: boolean;
	/**
	 * O RECORTE da tela de Percurso, para o arquivo responder o mesmo que a
	 * lista. Exportar sem ele devolvia todos os degraus enquanto a tela mostrava
	 * um só — o arquivo respondia por OUTRO recorte (Bruna, 23/09).
	 *
	 * O critério é o MESMO da lista: os nove degraus de `ORDEM_DOS_PASSOS` e o
	 * modo `parou`/`alcancou`.
	 */
	passo?: PassoDoPercurso | null;
	modo?: ModoDoPasso;
	/** Chave de canal como a tabela por origem monta (`campanha:ig`, `direto`). */
	origem?: string | null;
	/** Campanha (ou lista de campanhas) — só corta junto com `origem` de campanha. */
	campanha?: Campanhas;
	/** Busca por nome, telefone ou e-mail — o mesmo `q` da lista. */
	q?: string | null;
	/** O recorte por braço de experimento (`?ab=…`); `[]` = todas as variantes. */
	recorte?: RecorteAB;
	/** O registro de experimentos (padrão `EXPERIMENTOS`); injetável no teste de D4. */
	experimentos?: readonly Experimento[];
}

interface LinhaCrua extends Record<string, unknown> {
	contato_id: string | null;
	visitor_id: string;
	name: string | null;
	email: string | null;
	phone: string | null;
	channel: string | null;
	utm_source: string | null;
	utm_medium: string | null;
	utm_campaign: string | null;
	utm_content: string | null;
	ctwa_source_id: string | null;
	ctwa_headline: string | null;
	referrer: string | null;
	landing_path: string | null;
	first_arrival: string;
	last_activity: string;
	arrivals: number | string;
	conversations: number | string;
	customer_messages: number | string;
	profundidade: number | string;
	stage: string | null;
	conversation_id: string | null;
}

function rotuloDaProfundidade(profundidade: number): PassoDoPercurso {
	const indice = Math.min(Math.max(profundidade, 1), ORDEM_DOS_PASSOS.length) - 1;
	return ORDEM_DOS_PASSOS[indice];
}

/** A profundidade que nomeia o degrau — o índice na escada canônica, +1. */
function profundidadeDoPasso(passo: PassoDoPercurso): number {
	return ORDEM_DOS_PASSOS.indexOf(passo) + 1;
}

/** A legenda legível do degrau — o pedido é lido por gente, não só por script. */
function legendaDoPasso(passo: PassoDoPercurso): string {
	return PASSOS_DO_PERCURSO.find((p) => p.chave === passo)?.label ?? passo;
}

function ouIndisponivel(valor: unknown, campo: string): string {
	const t = valor === null || valor === undefined ? null : String(valor).trim();
	return t ? t : `indisponível: ${campo} não informado`;
}

/** O alias SQL do braço de um experimento no arquivo (`braco_<id>`). */
function aliasDoBraco(experimento: Experimento): string {
	return `braco_${experimento.id}`;
}

export async function exportarPercurso(opcoes: OpcoesDePercurso): Promise<LinhaExportada[]> {
	const mascara = opcoes.mascarar ?? true;
	const incluirSemConversa = opcoes.incluirSemConversa ?? true;

	// A origem corta na VISITA, com o mesmo predicado da tabela por origem — é
	// o que faz o arquivo ter as mesmas linhas do link que a tela abriu.
	const origem = opcoes.origem?.trim()
		? predicadoDeOrigemNaVisita(opcoes.origem.trim(), opcoes.campanha ?? null)
		: null;
	const filtroOrigem = origem ? sql` AND ${origem}` : sql``;

	// As condições que SÓ existem no recorte externo (`final`): a exclusão de
	// quem não falou vive na coluna `conversation_id`, e a busca de `q` lê o nome
	// já resolvido (contato ou lead).
	const condicoes: SQL[] = [];
	if (!incluirSemConversa) condicoes.push(sql`conversation_id IS NOT NULL`);
	if (opcoes.passo) {
		const alvo = profundidadeDoPasso(opcoes.passo);
		condicoes.push(
			opcoes.modo === "alcancou" ? sql`profundidade >= ${alvo}` : sql`profundidade = ${alvo}`,
		);
	}
	const busca = opcoes.q?.trim();
	if (busca) {
		const alvo = `%${busca}%`;
		condicoes.push(sql`(name ILIKE ${alvo} OR phone ILIKE ${alvo} OR email ILIKE ${alvo})`);
	}

	// ─── O BRAÇO DO EXPERIMENTO (FIX-404) ────────────────────────────────────
	//
	// UMA COLUNA POR EXPERIMENTO DO REGISTRO (D8), resolvida por PESSOA pela CTE
	// canônica do refino 3 (§4a): a pessoa é atribuída ao braço da conversa em que
	// se IDENTIFICOU (a etapa âncora); quem nunca se identificou cai na última
	// exposição. A chave é a MESMA que este arquivo já usa (`por_visita.chave` =
	// `chaveDaPessoa`), e a fonte é o `por_visita` — não se reimplementa resolução
	// de identidade, e não há segundo caminho para o fato da etapa (ele vem de
	// `fatoDaEtapaNaConversa`, dentro da CTE do `filtro-variante`).
	//
	// A CTE entra dentro de uma tabela derivada por experimento porque o nome
	// dela é fixo (`braco_da_pessoa`): um escopo por experimento permite N
	// colunas sem renomear nada e sem avaliar a subconsulta por linha.
	const experimentos = opcoes.experimentos ?? EXPERIMENTOS;
	const recorte = opcoes.recorte ?? [];
	const colunasDoBraco = experimentos.map((experimento) => ({
		experimento,
		coluna: colunaDoBraco(experimento.id),
	}));

	const juncoesDoBraco =
		colunasDoBraco.length === 0
			? sql``
			: sql.join(
					colunasDoBraco.map(({ experimento }) => {
						const alias = aliasDoBraco(experimento);
						return sql`
      LEFT JOIN (
        WITH ${cteDoBracoDaPessoa(experimento, {
					de: opcoes.de,
					ate: opcoes.ate,
					chave: sql`pv.chave`,
					fonte: sql`por_visita`,
				})}
        SELECT chave, braco FROM ${sql.raw(NOME_DO_CTE_DO_BRACO_DA_PESSOA)}
      ) ${sql.raw(alias)} ON ${sql.raw(alias)}.chave = p.chave`;
					}),
					sql``,
				);

	const projecaoDoBraco =
		colunasDoBraco.length === 0
			? sql``
			: sql`, ${sql.join(
					colunasDoBraco.map(
						({ experimento, coluna }) =>
							sql`${sql.raw(aliasDoBraco(experimento))}.braco AS ${sql.raw(`"${coluna}"`)}`,
					),
					sql`, `,
				)}`;

	// O recorte é aplicado sobre a COLUNA já resolvida — é a forma canônica
	// ("braço X ⇒ `bp.braco = X`; sem variante ⇒ `IS NULL`"), não uma segunda
	// resolução do braço.
	for (const par of recorte) {
		const alvo = colunasDoBraco.find(({ experimento }) => experimento.id === par.experimento);
		if (!alvo) continue;
		if (par.braco !== SEM_BRACO && !alvo.experimento.bracos.includes(par.braco)) continue;
		const coluna = sql.raw(`"${alvo.coluna}"`);
		condicoes.push(
			par.braco === SEM_BRACO ? sql`${coluna} IS NULL` : sql`${coluna} = ${par.braco}`,
		);
	}

	const filtroFinal = condicoes.length > 0 ? sql` WHERE ${sql.join(condicoes, sql` AND `)}` : sql``;

	const { rows } = await db.execute<LinhaCrua>(sql`
    WITH visita AS (
      SELECT v.*, NOT EXISTS (
        SELECT 1 FROM visits eco WHERE eco.visitor_id = v.visitor_id
          AND eco.created_at < v.created_at AND v.created_at - eco.created_at < interval '2 seconds'
      ) AS conta_como_chegada
      FROM visits v
      WHERE v.created_at BETWEEN ${opcoes.de} AND ${opcoes.ate}
        AND (EXISTS (SELECT 1 FROM conversations cg WHERE cg.visit_id = v.id AND cg.is_simulated = false)
          OR (v.user_agent IS NOT NULL AND v.user_agent !~* '(ELB-HealthChecker|facebookexternalhit|python-requests|HeadlessChrome|crawler|spider|curl|wget|bot)([^a-z]|$)'))${filtroOrigem}
    ),
    por_visita AS (
      SELECT vi.*,
        -- A chave da PESSOA vem da fonte única (chaveDaPessoa), como na Porta e
        -- no Percurso. Era uma cópia local — sem a janela na conversa que resolve
        -- o contato —, e duas definições de pessoa divergem no primeiro caso raro.
        ${chaveDaPessoa(opcoes.de, opcoes.ate, sql`vi.visitor_id`)} AS chave
      FROM visita vi
    ),
    credito AS (
      SELECT DISTINCT ON (chave) chave, landing_path, channel, utm_source, utm_medium, utm_campaign,
        utm_content, ctwa_source_id, ctwa_headline, referrer
      FROM por_visita
      ORDER BY chave, (utm_source IS NULL AND ctwa_source_id IS NULL AND ctwa_headline IS NULL) ASC, created_at ASC
    ),
    pessoa AS (
      SELECT chave,
        min(NULLIF(chave, visitor_id)) AS contact_id,
        (array_agg(visitor_id ORDER BY created_at))[1] AS visitor_id,
        count(*) FILTER (WHERE conta_como_chegada) AS arrivals,
        min(created_at) AS first_arrival,
        max(created_at) AS last_visit,
        bool_or(EXISTS (SELECT 1 FROM page_events pe WHERE pe.visit_id = id AND pe.type IN ('click','rage_click','scroll_depth'))) AS olhou,
        bool_or(EXISTS (SELECT 1 FROM page_events pe WHERE pe.visit_id = id AND pe.type = 'chat_open')) AS abriu_teatro
      FROM por_visita GROUP BY chave
    ),
    conv AS (
      SELECT c.id, c.visit_id, c.updated_at,
        (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id AND m.role = 'user') AS msgs,
        (SELECT max(m.created_at) FROM messages m WHERE m.conversation_id = c.id AND m.role = 'user') AS ultimo_inbound,
        -- AJA-01: "escreveu" era o EXISTS de mensagem do cliente, e o CTA do
        -- anúncio escreve a primeira fala. O degrau se parte em dois, com os
        -- MESMOS predicados da lista do Percurso — é o que faz a exportação do
        -- degrau devolver exatamente as linhas que a tela mostrava.
        ${sqlEscreveuAlgoProprio(sql`c.id`)} AS iniciou_conversa,
        ${sqlSoPrePreenchida(sql`c.id`)} AS so_pre_preenchida,
        ${conversaIdentificada(sql`c`)} AS identificou,
        ${viuOferta(sql`c`)} AS viu_oferta,
        ${teveProposta(sql`c`)} AS teve_proposta,
        EXISTS (SELECT 1 FROM leads l WHERE l.conversation_id = c.id AND l.is_simulated = false AND l.stage = 'fechado_ganho') AS fechou
      FROM conversations c JOIN visita vi ON vi.id = c.visit_id WHERE c.is_simulated = false
    ),
    conv_pessoa AS (
      SELECT pv.chave, count(DISTINCT c.id) AS conversations, COALESCE(sum(c.msgs),0) AS customer_messages,
        max(c.ultimo_inbound) AS ultimo_inbound,
        bool_or(c.iniciou_conversa) AS iniciou_conversa, bool_or(c.so_pre_preenchida) AS so_pre_preenchida,
        bool_or(c.identificou) AS identificou,
        bool_or(c.viu_oferta) AS viu_oferta, bool_or(c.teve_proposta) AS teve_proposta, bool_or(c.fechou) AS fechou
      FROM por_visita pv JOIN conv c ON c.visit_id = pv.id GROUP BY pv.chave
    ),
    conversa_recente AS (
      SELECT DISTINCT ON (pv.chave) pv.chave, c.id AS conversation_id
      FROM por_visita pv JOIN conv c ON c.visit_id = pv.id ORDER BY pv.chave, c.updated_at DESC
    ),
    lead_pessoa AS (
      SELECT DISTINCT ON (pv.chave) pv.chave, l.name, l.phone, l.email, l.stage
      FROM por_visita pv JOIN conv c ON c.visit_id = pv.id JOIN leads l ON l.conversation_id = c.id AND l.is_simulated = false
      ORDER BY pv.chave, (l.stage = 'perdido') ASC, l.stage DESC, l.created_at DESC
    ),
    contato AS (
      SELECT p.chave, ct.name, ct.phone, ct.email FROM pessoa p JOIN contacts ct ON ct.id::text = p.contact_id
    ),
    final AS (
      SELECT p.contact_id, p.visitor_id, COALESCE(ct.name, lp.name) AS name, COALESCE(ct.email, lp.email) AS email,
        COALESCE(ct.phone, lp.phone) AS phone, cr.channel, cr.utm_source, cr.utm_medium, cr.utm_campaign, cr.utm_content,
        cr.ctwa_source_id, cr.ctwa_headline, cr.referrer, cr.landing_path, p.first_arrival,
        GREATEST(p.last_visit, COALESCE(cp.ultimo_inbound, p.last_visit)) AS last_activity, p.arrivals,
        COALESCE(cp.conversations,0) AS conversations, COALESCE(cp.customer_messages,0) AS customer_messages,
        -- A ESCADA é a mesma da lista do Percurso, os nove degraus de
        -- ORDEM_DOS_PASSOS: 'so_pre_preenchida' entrou e a antiga contagem de
        -- oito degraus rotulava 'fechado' como 'proposta'. Sem isto a exportação
        -- de um degrau devolveria outro recorte que a tela.
        CASE
          WHEN COALESCE(cp.fechou,false) THEN 9
          WHEN COALESCE(cp.teve_proposta,false) THEN 8
          WHEN COALESCE(cp.viu_oferta,false) THEN 7
          WHEN COALESCE(cp.identificou,false) THEN 6
          WHEN COALESCE(cp.iniciou_conversa,false) THEN 5
          WHEN COALESCE(cp.so_pre_preenchida,false) THEN 4
          WHEN COALESCE(cp.conversations,0) > 0 OR p.abriu_teatro THEN 3
          WHEN p.olhou THEN 2 ELSE 1 END AS profundidade,
        lp.stage, rc.conversation_id${projecaoDoBraco}
      FROM pessoa p JOIN credito cr ON cr.chave = p.chave LEFT JOIN conv_pessoa cp ON cp.chave = p.chave
      LEFT JOIN conversa_recente rc ON rc.chave = p.chave LEFT JOIN lead_pessoa lp ON lp.chave = p.chave
      LEFT JOIN contato ct ON ct.chave = p.chave${juncoesDoBraco}
    )
    SELECT * FROM final${filtroFinal} ORDER BY last_activity DESC, visitor_id ASC
  `);

	return rows.map((linha) => {
		const motivos: string[] = [];
		const contatoId = linha.contato_id ? String(linha.contato_id) : null;
		if (!contatoId) motivos.push(SEM_VINCULO_SEM_CONTATO);

		const nome = mascara ? mascararNome(linha.name) : linha.name;
		const telefone = mascara ? mascararTelefone(linha.phone) : linha.phone;
		const email = mascara ? mascararEmail(linha.email) : linha.email;
		if (!linha.name) motivos.push(INDISPONIVEL_NOME);
		if (!linha.phone) motivos.push(INDISPONIVEL_TELEFONE);
		if (!linha.email) motivos.push(INDISPONIVEL_EMAIL);

		const semOrigem =
			!linha.utm_source && !linha.utm_medium && !linha.utm_campaign && !linha.ctwa_source_id;
		if (semOrigem) motivos.push(SEM_VINCULO_VISITA_SEM_ORIGEM);

		const profundidade = Number(linha.profundidade ?? 1) || 1;
		const passo = rotuloDaProfundidade(profundidade);
		const conversaId = linha.conversation_id ? String(linha.conversation_id) : null;
		if (!conversaId) motivos.push("sem vínculo: pessoa sem conversa");

		const etapaDoLead = linha.stage ? String(linha.stage) : SEM_RESULTADO_COMERCIAL;
		if (!linha.stage) motivos.push(SEM_RESULTADO_COMERCIAL);

		const origemCampo = (valor: string | null, campo: string): string =>
			semOrigem ? `${SEM_VINCULO_VISITA_SEM_ORIGEM} (${campo})` : ouIndisponivel(valor, campo);

		// A coluna do braço, uma por experimento do registro. Sem braço gravado a
		// célula sai ESCRITA — nunca vazia, nunca um chute derivado por hash.
		const bracos: Record<string, string> = {};
		for (const { coluna } of colunasDoBraco) {
			const bruto = linha[coluna];
			const limpo = bruto === null || bruto === undefined ? "" : String(bruto).trim();
			bracos[coluna] = limpo === "" ? SEM_BRACO_NO_EXPORT : limpo;
		}

		return {
			contatoId: contatoId ?? SEM_VINCULO_SEM_CONTATO,
			visitanteId: String(linha.visitor_id),
			nome: nome ?? INDISPONIVEL_NOME,
			telefone: telefone ?? INDISPONIVEL_TELEFONE,
			email: email ?? INDISPONIVEL_EMAIL,
			canal: ouIndisponivel(linha.channel, "canal"),
			origemFonte: origemCampo(linha.utm_source, "utm_source"),
			origemMeio: origemCampo(linha.utm_medium, "utm_medium"),
			origemCampanha: origemCampo(linha.utm_campaign, "utm_campaign"),
			origemConteudo: origemCampo(linha.utm_content, "utm_content"),
			ctwaSourceId: ouIndisponivel(linha.ctwa_source_id, "ctwa_source_id"),
			ctwaHeadline: ouIndisponivel(linha.ctwa_headline, "ctwa_headline"),
			referrer: ouIndisponivel(linha.referrer, "referrer"),
			landingPath: ouIndisponivel(linha.landing_path, "landing_path"),
			primeiraChegada: isoDeSaoPaulo(linha.first_arrival),
			ultimaAtividade: isoDeSaoPaulo(linha.last_activity),
			chegadas: String(linha.arrivals ?? 0),
			conversas: String(linha.conversations ?? 0),
			mensagensDoCliente: String(linha.customer_messages ?? 0),
			passo,
			passoRotulo: legendaDoPasso(passo),
			etapaDoLead,
			conversaId: conversaId ?? "sem vínculo: pessoa sem conversa",
			...bracos,
			dadosIndisponiveis: listaDeIndisponiveis(motivos),
		};
	});
}

/**
 * Contagem para o cartão da tela.
 *
 * Com RECORTE (degrau, origem ou busca), a contagem é `exportarPercurso` —
 * materializar as linhas é mais caro, e é de propósito: o cartão e o arquivo
 * não podem discordar. Sem recorte, o caminho leve de sempre (o teste "a
 * contagem de pessoas bate com o número de linhas" prova que os dois concordam
 * no caso sem filtro).
 */
export async function contarPercurso(opcoes: OpcoesDePercurso): Promise<{ pessoas: number }> {
	const temRecorte =
		Boolean(opcoes.passo || opcoes.origem?.trim() || opcoes.q?.trim()) ||
		(opcoes.recorte?.length ?? 0) > 0;
	if (temRecorte) return { pessoas: (await exportarPercurso(opcoes)).length };

	const incluirSemConversa = opcoes.incluirSemConversa ?? true;
	const filtroConversa = incluirSemConversa
		? sql``
		: sql` AND EXISTS (SELECT 1 FROM conversations c WHERE c.visit_id = v.id AND c.is_simulated = false)`;
	const { rows } = await db.execute<{ pessoas: string | number }>(sql`
    SELECT count(DISTINCT ${chaveDaPessoa(opcoes.de, opcoes.ate)}) AS pessoas
    FROM visits v
    WHERE v.created_at BETWEEN ${opcoes.de} AND ${opcoes.ate}${filtroConversa}
      AND (EXISTS (SELECT 1 FROM conversations cg WHERE cg.visit_id = v.id AND cg.is_simulated = false)
        OR (v.user_agent IS NOT NULL AND v.user_agent !~* '(ELB-HealthChecker|facebookexternalhit|python-requests|HeadlessChrome|crawler|spider|curl|wget|bot)([^a-z]|$)'))
  `);
	return { pessoas: Number(rows[0]?.pessoas ?? 0) };
}
