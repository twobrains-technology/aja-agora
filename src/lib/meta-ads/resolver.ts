/**
 * Resolvedor de campanha — o de-para entre o que chega na visita e o nome real
 * que a Meta mostra.
 *
 * ## Por que isto existe
 *
 * A tela do admin mostra `…370104`: os seis últimos dígitos do id da campanha.
 * Duas razões para isso sair:
 *
 * 1. Ninguém decide verba olhando um id. O nome real é
 *    `META | EXP | LEAD | BR | PLACEMENTS`.
 * 2. **O sufixo de seis dígitos não identifica.** Medido em 17/09/2026 na conta
 *    `act_1594922312055163`: o sufixo `…200104` casa com DOIS anúncios
 *    diferentes (`IMG | GERAL | RMKT | V1 | PLACEMENT_TEST` e
 *    `TOFU - AJA | ... | INTERESSES CARROS`), e `…450104` também. O painel pode
 *    estar apontando o anúncio errado.
 *
 * ## As três chaves, por força
 *
 * | ordem | chave            | de onde vem                                | força                  |
 * |-------|------------------|--------------------------------------------|------------------------|
 * | 1º    | `campaign_id`    | parâmetro `{{campaign.id}}` ou referral CTWA | idêntica à da Meta   |
 * | 2º    | `utm_campaign`   | texto que o anunciante digitou na URL       | depende de disciplina  |
 * | 3º    | `ctwa_source_id` | referral do Click-to-WhatsApp (só o anúncio) | parcial, por desenho  |
 *
 * O PRD (`docs/design/specs/2026-09-15-meta-capi-qualified-lead-prd.md`, §7.2)
 * já fixa a regra que este módulo cumpre na leitura: *"se o referral fornecer
 * somente o identificador de anúncio, ele é preservado como tal; campaign/adset
 * ausentes ficam nulos e auditáveis"*. **Nada é deduzido por proximidade de
 * nome** — quando não há resposta, o rótulo atual é mantido e marcado como não
 * resolvido.
 *
 * ## Contrato congelado
 *
 * As assinaturas abaixo são lidas pelo bloco 2 (nome nas telas), pelo bloco 3
 * (filtro) e pelo bloco 4 (tela de campanhas). **O bloco 1 implementa os corpos
 * e a fonte de dados (tabela + sync), sem mudar nenhuma assinatura.**
 */

/** O que identifica uma campanha vinda de uma visita. */
export type ChaveCampanha =
	| { tipo: "campaign_id"; valor: string }
	| { tipo: "utm_campaign"; valor: string }
	| { tipo: "ctwa_source_id"; valor: string };

/** De qual das três chaves o nome saiu. `desconhecida` = não achamos. */
export type OrigemDaResolucao = "id" | "utm" | "ctwa" | "desconhecida";

export interface CampanhaResolvida {
	/** Nome de leitura. Nunca vazio quando a resolução deu certo. */
	nome: string;
	/** Id completo, nunca truncado — é o que se cola no gerenciador. */
	entityId: string | null;
	/** Qual chave resolveu. Quem renderiza mostra isso no `title`. */
	origemDaResolucao: OrigemDaResolucao;
	status: "ACTIVE" | "PAUSED" | null;
}

/** A chave serializada, como entra no `Map` e na query string. */
export function serializarChave(chave: ChaveCampanha): string {
	return `${chave.tipo}:${chave.valor}`;
}

/**
 * A partir dos campos de uma visita, monta a chave de **maior força** disponível.
 *
 * A ordem é a da tabela acima e não é arbitrária: `campaign_id` é o id da
 * própria Meta, então quando ele existe a resposta é exata; `utm_campaign` é
 * texto digitado e pode divergir; `ctwa_source_id` só cobre o que o referral
 * mandou.
 */
export function chaveDeOrigem(origem: {
	campaignId?: string | null;
	utmCampaign?: string | null;
	ctwaSourceId?: string | null;
}): ChaveCampanha | null {
	const id = origem.campaignId?.trim();
	if (id) return { tipo: "campaign_id", valor: id };

	const utm = origem.utmCampaign?.trim();
	if (utm) return { tipo: "utm_campaign", valor: utm };

	const ctwa = origem.ctwaSourceId?.trim();
	if (ctwa) return { tipo: "ctwa_source_id", valor: ctwa };

	return null;
}

/**
 * Cache em memória do último estado conhecido, populado pelo ciclo de sync.
 *
 * Existe para a renderização **nunca** chamar a Marketing API: a página lê daqui
 * (síncrono) e o worker é quem fala com a Meta. Chave = `serializarChave()`.
 */
const cache = new Map<string, CampanhaResolvida>();

/** Troca o conteúdo do cache. Chamado pelo ciclo de sync (bloco 1) e pelos testes. */
export function semearCache(entradas: Array<[string, CampanhaResolvida]>): void {
	cache.clear();
	for (const [k, v] of entradas) cache.set(k, v);
}

/**
 * Nome para renderizar — síncrono, do cache. `null` quando não sabemos.
 *
 * **`null` é resposta legítima, não erro**: quem chama mantém o rótulo que já
 * existe hoje (`utm_campaign` ou o id abreviado). É o mesmo raciocínio do
 * `predicadoDeOrigemNaVisita`, que devolve `null` em vez de lista vazia — uma
 * tela que apaga a origem quando não acha é pior que o problema original.
 */
export function nomeCurto(chave: ChaveCampanha): CampanhaResolvida | null {
	return cache.get(serializarChave(chave)) ?? null;
}

/**
 * Resolve em lote, do banco (não da Meta).
 *
 * Para as telas que já sabem todas as chaves da página e querem uma ida só ao
 * banco. Também popula o cache para os renders seguintes. Devolve só o que
 * achou: chave ausente = não resolvida.
 *
 * ── Por que do banco e não da Meta ────────────────────────────────────────
 *
 * A renderização SÍNCRONA (`nomeCurto`) lê do `cache`; quem enche o cache de
 * verdade é esta função, lendo `meta_entities` — o espelho que o ciclo
 * `meta-ads-sync-cycle.ts` mantém. A página do admin NUNCA chama a Marketing
 * API: ela é lenta, tem limite de chamadas e ficaria fora do ar junto com a
 * Meta.
 *
 * ── As duas chaves que têm coluna, e a que não tem ────────────────────────
 *
 * - `campaign_id` casa com `entity_id` (o id da própria Meta: exato).
 * - `utm_campaign` casa com `nome` (é o texto que o anunciante digitou na URL,
 *   e a convenção da casa é digitá-lo igual ao nome da campanha).
 * - `ctwa_source_id` NÃO tem coluna no espelho e por isso não é resolvido: o
 *   contrato já prevê `origemDaResolucao: "desconhecida"`, e inventar um
 *   casamento por proximidade de nome é exatamente o que o PRD §7.2 proíbe
 *   ("nada é deduzido por proximidade de nome").
 *
 * ── Banco fora do ar não derruba a tela ───────────────────────────────────
 *
 * `null` é resposta legítima: quem chama mantém o rótulo antigo. Se a consulta
 * falhar, devolvemos o que o cache já tinha e logamos — a tela mostra o rótulo
 * de antes em vez de estourar.
 */
export async function resolverCampanhas(
	chaves: ChaveCampanha[],
): Promise<Map<string, CampanhaResolvida>> {
	const resultado = new Map<string, CampanhaResolvida>();
	for (const chave of chaves) {
		const achado = cache.get(serializarChave(chave));
		if (achado) resultado.set(serializarChave(chave), achado);
	}

	// Os ids e nomes distintos que faltam resolver (o que já estava no cache não
	// precisa de query de novo).
	const ids = [
		...new Set(
			chaves
				.filter((c) => c.tipo === "campaign_id")
				.map((c) => c.valor)
				.filter((v) => !resultado.has(serializarChave({ tipo: "campaign_id", valor: v }))),
		),
	];
	const nomes = [
		...new Set(
			chaves
				.filter((c) => c.tipo === "utm_campaign")
				.map((c) => c.valor)
				.filter((v) => !resultado.has(serializarChave({ tipo: "utm_campaign", valor: v }))),
		),
	];
	if (ids.length === 0 && nomes.length === 0) return resultado;

	let linhas: Array<{ entityId: string; nome: string; status: string | null }> = [];
	try {
		const { db } = await import("@/db");
		const { metaEntities } = await import("@/db/schema");
		const { and, eq, inArray } = await import("drizzle-orm");

		const porId =
			ids.length > 0
				? await db
						.select({
							entityId: metaEntities.entityId,
							nome: metaEntities.nome,
							status: metaEntities.status,
						})
						.from(metaEntities)
						.where(and(eq(metaEntities.nivel, "campaign"), inArray(metaEntities.entityId, ids)))
				: [];
		const porNome =
			nomes.length > 0
				? await db
						.select({
							entityId: metaEntities.entityId,
							nome: metaEntities.nome,
							status: metaEntities.status,
						})
						.from(metaEntities)
						.where(and(eq(metaEntities.nivel, "campaign"), inArray(metaEntities.nome, nomes)))
				: [];
		linhas = [...porId, ...porNome];
	} catch (err) {
		console.error(
			JSON.stringify({
				level: "error",
				source: "resolver-campanhas",
				error: err instanceof Error ? err.message : String(err),
			}),
		);
		return resultado;
	}

	const porId = new Map<string, CampanhaResolvida>();
	const porNome = new Map<string, CampanhaResolvida>();
	for (const linha of linhas) {
		const resolvida: CampanhaResolvida = {
			nome: linha.nome,
			entityId: linha.entityId,
			// A coluna é texto (a Meta muda esse vocabulário); o contrato só
			// admite ACTIVE/PAUSED. ARCHIVED e desconhecidos caem em `null`.
			status: linha.status === "ACTIVE" || linha.status === "PAUSED" ? linha.status : null,
			origemDaResolucao: "desconhecida",
		};
		porId.set(linha.entityId, { ...resolvida, origemDaResolucao: "id" });
		porNome.set(linha.nome, { ...resolvida, origemDaResolucao: "utm" });
	}

	const novas: Array<[string, CampanhaResolvida]> = [];
	for (const valor of ids) {
		const achado = porId.get(valor);
		if (!achado) continue;
		const chave: ChaveCampanha = { tipo: "campaign_id", valor };
		resultado.set(serializarChave(chave), achado);
		novas.push([serializarChave(chave), achado]);
	}
	for (const valor of nomes) {
		const achado = porNome.get(valor);
		if (!achado) continue;
		const chave: ChaveCampanha = { tipo: "utm_campaign", valor };
		resultado.set(serializarChave(chave), achado);
		novas.push([serializarChave(chave), achado]);
	}

	// Semear MESCLANDO: o cache é do processo e atende páginas concorrentes —
	// `semearCache` troca o conteúdo, então passamos o que já estava mais o novo.
	if (novas.length > 0) semearCache([...cache.entries(), ...novas]);
	return resultado;
}

/**
 * O rótulo de leitura de uma campanha, com o fallback que a tela usa hoje.
 *
 * Mora aqui — e não em cada componente — para os oito pontos que mostram campanha
 * concordarem. `nomeReal` é o que o resolvedor achou; sem ele, cai no valor cru
 * da visita, que é o comportamento atual.
 */
export function rotuloDeCampanha(
	chave: ChaveCampanha | null,
	nomeReal: CampanhaResolvida | null,
	fallback: string | null,
): string | null {
	if (nomeReal?.nome) return nomeReal.nome;
	if (fallback?.trim()) return fallback.trim();
	if (chave) return chave.valor;
	return null;
}
