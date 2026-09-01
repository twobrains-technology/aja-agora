// FIX-222 (Ata 2026-07-04): logo da administradora no card de recomendação
// ("traz confiabilidade e o cara sabe pra onde vai"). PURO e sem I/O — o
// repositório (`administradora-logo-repo.ts`) faz a consulta ao banco e passa
// o Map já resolvido pra este módulo casar por administradora.
//
// Os assets deixaram de ser PENDENTE em 31/08/2026: os 7 SVGs das
// administradoras que a Bevi opera estão versionados em
// `public/administradoras/`, normalizados por PESO ÓPTICO (ver o README de lá).
//
// Por que asset no repo e não só a coluna `logo_url`: a rota que cadastra
// administradora (`POST /api/admin/administradoras`) nunca aceitou `logoUrl` —
// o pipeline do FIX-222 existia e não havia caminho para alimentá-lo. O banco
// segue com PRECEDÊNCIA (troca de arte sem deploy, administradora nova); o
// asset versionado é o piso. Nome fora das duas fontes → `undefined` → fallback
// de iniciais. A regra não mudou: nunca fabrica um logo que não existe.

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

/** As 7 administradoras que a Bevi opera (beviconsorcio.com.br/administradoras,
 * conferido em 31/08/2026), com os apelidos pelos quais o nome chega.
 *
 * O nome varia por fonte — a Descoberta devolve "ITAÚ" e "BANCO DO BRASIL", o
 * cadastro da Bevi usa "Itaú Consórcio" e "BB Consórcios" —, então o casamento é
 * por TOKEN distintivo e não por igualdade. Cada token casa como PALAVRA
 * INTEIRA: "BB" não pode casar dentro de "ABBCON". */
const ASSETS_LOCAIS: ReadonlyArray<{ arquivo: string; tokens: readonly string[] }> = [
	{ arquivo: "itau", tokens: ["ITAU"] },
	{ arquivo: "ancora", tokens: ["ANCORA"] },
	{ arquivo: "banco-do-brasil", tokens: ["BANCO DO BRASIL", "BB"] },
	{ arquivo: "rodobens", tokens: ["RODOBENS"] },
	{ arquivo: "canopus", tokens: ["CANOPUS"] },
	{ arquivo: "tradicao", tokens: ["TRADICAO"] },
	{ arquivo: "servopa", tokens: ["SERVOPA"] },
];

/** O logo versionado em `public/administradoras/`, ou `undefined` para
 * administradora fora da lista — nunca devolve um path que não existe no
 * bundle (404 no card é pior que o fallback de iniciais). */
export function logoLocalDaAdministradora(administradora: string | undefined): string | undefined {
	if (!administradora) return undefined;
	const nome = normalize(administradora);
	if (!nome) return undefined;
	const achado = ASSETS_LOCAIS.find(({ tokens }) =>
		tokens.some((t) => new RegExp(`\\b${t}\\b`).test(nome)),
	);
	return achado ? `/administradoras/${achado.arquivo}.svg` : undefined;
}

/** Casa o nome da administradora do grupo (Descoberta) contra o logo — o
 * cadastro do banco primeiro, o asset versionado como piso. Sem nenhum dos
 * dois → `undefined` (o card cai no fallback — nunca inventa um logo). */
export function matchAdministradoraLogo(
	logos: ReadonlyMap<string, string> | undefined,
	administradora: string | undefined,
): string | undefined {
	if (!administradora) return undefined;
	return logos?.get(normalize(administradora)) ?? logoLocalDaAdministradora(administradora);
}
