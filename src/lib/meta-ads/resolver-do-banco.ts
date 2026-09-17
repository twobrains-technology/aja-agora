// src/lib/meta-ads/resolver-do-banco.ts
//
// A METADE QUE FALA COM O BANCO do resolvedor de campanha.
//
// Vive em arquivo separado de `resolver.ts` por uma razão de BUNDLE, não de
// gosto: `resolver.ts` é importado por componente de CLIENTE (o filtro de
// conversas chama `nomeCurto` para escrever o rótulo na tela). Se a consulta ao
// banco morasse lá, o `@/db` — e com ele o driver `pg` — entraria no bundle do
// navegador e o `next build` quebraria com "Module not found: Can't resolve
// 'fs'". Não é hipótese: foi exatamente o erro que este arquivo corrige.
//
// A regra, então: **`resolver.ts` é puro; quem precisa do banco importa daqui.**
// As duas metades compartilham o mesmo cache em memória através de
// `nomeCurto`/`entradasDoCache`/`semearCache`.

import {
	type CampanhaResolvida,
	type ChaveCampanha,
	entradasDoCache,
	nomeCurto,
	semearCache,
	serializarChave,
} from "@/lib/meta-ads/resolver";

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
		const achado = nomeCurto(chave);
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
	if (novas.length > 0) semearCache([...entradasDoCache(), ...novas]);
	return resultado;
}
