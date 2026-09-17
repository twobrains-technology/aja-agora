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
 */
export async function resolverCampanhas(
	chaves: ChaveCampanha[],
): Promise<Map<string, CampanhaResolvida>> {
	const resultado = new Map<string, CampanhaResolvida>();
	for (const chave of chaves) {
		const achado = cache.get(serializarChave(chave));
		if (achado) resultado.set(serializarChave(chave), achado);
	}
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
