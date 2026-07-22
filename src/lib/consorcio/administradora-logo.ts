// FIX-222 (Ata 2026-07-04): logo da administradora no card de recomendação
// ("traz confiabilidade e o cara sabe pra onde vai"). PURO e sem I/O — o
// repositório (`administradora-logo-repo.ts`) faz a consulta ao banco e passa
// o Map já resolvido pra este módulo casar por administradora.
//
// Assets reais (arquivos de imagem por administradora) são PENDENTE
// (sourcing/design) — este módulo é o pipeline; sem logo cadastrado, o card
// cai no fallback gracioso (iniciais/nome).

/** Normaliza pra casar administradoras com acento/caixa divergentes entre a
 * Descoberta ("ÂNCORA") e o cadastro (`administradoras.nome`). */
const normalize = (s: string): string =>
	s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

/** Constrói o índice normalizado a partir das linhas de `administradoras`
 * (nome + logo_url). Linhas sem `logoUrl` (ainda não cadastrado) ficam FORA
 * do índice — nunca fabrica um logo que não existe. */
export function buildAdministradoraLogoMap(
	rows: Array<{ nome: string; logoUrl: string | null }>,
): Map<string, string> {
	const map = new Map<string, string>();
	for (const row of rows) {
		if (row.logoUrl) map.set(normalize(row.nome), row.logoUrl);
	}
	return map;
}

/** Casa o nome da administradora do grupo (Descoberta) contra o índice de
 * logos. Sem índice, sem nome, ou sem match → `undefined` (o card cai no
 * fallback — nunca inventa um logo). */
export function matchAdministradoraLogo(
	logos: ReadonlyMap<string, string> | undefined,
	administradora: string | undefined,
): string | undefined {
	if (!logos || !administradora) return undefined;
	return logos.get(normalize(administradora));
}
