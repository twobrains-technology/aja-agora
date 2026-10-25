// AS SKILLS DO VENDEDOR — o conhecimento da Bevi, em arquivo, injetado no system.
//
// Por que não usar o `loadSkillsFromDir` do próprio pi: ele vive no pacote ESM do
// harness, que neste server CJS só entra por `import()` dinâmico (o `require`
// estoura `ERR_PACKAGE_PATH_NOT_EXPORTED`, já custou um turno mudo em 19/10).
// Aqui os `.md` são versionados no repo, lidos com `node:fs` e o frontmatter
// é parseado localmente — o texto que chega ao modelo é o mesmo que o SDK
// produziria (`## <name>\n<description>\n<body>`), sem uma dependência a mais no
// caminho quente.
//
// ⚠️ O `.md` precisa existir NA IMAGEM: `outputFileTracingIncludes` no
// `next.config.ts`. Sem isso a skill some em produção sem erro — e o vendedor
// perde o conhecimento da Bevi.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Skill = {
	/** `name` do frontmatter — é o que o modelo cita ao decidir usar. */
	name: string;
	/** `description` do frontmatter — o gatilho de uso. */
	description: string;
	/** Corpo, sem o frontmatter. */
	body: string;
};

const ORDEM: readonly string[] = [
	"buscar-cartas",
	"proposta-com-dados-do-cliente",
	"perguntar-com-opcoes",
];

function diretoriosCandidatos(): string[] {
	const base = process.env.SKILLS_DIR?.trim();
	const cwd = process.cwd();
	const dirs = [
		base ? base : null,
		join(cwd, "src/lib/agent/pi/skills"),
		join(cwd, "lib/agent/pi/skills"),
		join(cwd, ".next/standalone/src/lib/agent/pi/skills"),
	].filter((d): d is string => typeof d === "string");
	return [...new Set(dirs)];
}

/** Frontmatter YAML mínimo: `name:` e `description:` numa linha só. */
export function parseSkillBruto(bruto: string): Skill {
	const limpo = bruto.replace(/^\uFEFF/, "");
	if (!limpo.startsWith("---")) throw new Error("SKILL.md sem frontmatter");
	const fim = limpo.indexOf("\n---", 3);
	if (fim < 0) throw new Error("SKILL.md com frontmatter sem fechamento");
	const cabecalho = limpo.slice(3, fim);
	const body = limpo.slice(fim + 4).trim();
	const campo = (nome: string): string => {
		const m = cabecalho.match(new RegExp(`^${nome}:\\s*(.+)$`, "m"));
		return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
	};
	const name = campo("name");
	const description = campo("description");
	if (!name || !description) throw new Error("SKILL.md precisa de `name` e `description`");
	return { name, description, body };
}

let cache: Skill[] | null = null;

/** Carrega as skills uma vez por processo. Erro de leitura NÃO derruba o turno:
 * devolve o que conseguiu e loga o que faltou (o vendedor fica sem a skill, mas
 * a conversa continua). */
export function carregarSkills(): Skill[] {
	if (cache) return cache;
	const dirs = diretoriosCandidatos();
	const achadas: Skill[] = [];
	for (const nomeDaPasta of ORDEM) {
		let lida: Skill | null = null;
		for (const dir of dirs) {
			try {
				lida = parseSkillBruto(readFileSync(join(dir, nomeDaPasta, "SKILL.md"), "utf8"));
				break;
			} catch {
				// tenta o próximo diretório
			}
		}
		if (lida) achadas.push(lida);
		else console.error(`[skills] não achei ${nomeDaPasta}/SKILL.md em ${dirs.join(", ")}`);
	}
	cache = achadas;
	return achadas;
}

/** O bloco que entra no system, no formato do padrão Agent Skills. */
export function skillsParaPrompt(skills = carregarSkills()): string {
	if (skills.length === 0) return "";
	const corpo = skills
		.map(
			(s) =>
				`<skill name="${s.name}">\n<description>${s.description}</description>\n\n${s.body}\n</skill>`,
		)
		.join("\n\n");
	return `\n\n# Ferramentas de venda\n\nSuas ferramentas de busca, de proposta e os cards da tela têm instruções próprias. Use a que a conversa pedir.\n\n${corpo}`;
}

export function limparCacheDeSkills(): void {
	cache = null;
}
