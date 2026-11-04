/**
 * Sha do commit que rodou — é o que torna o relatório do gate auditável, e é
 * lido SEM binário git e SEM shell (o container do eval não tem nenhum dos dois).
 *
 * Por que não basta `readFileSync(".git/HEAD")`: este repositório é WORKTREE do
 * git, e em worktree `.git` é um ARQUIVO de uma linha — `gitdir: <caminho>` —
 * não um diretório. O `readFileSync` estourava `ENOTDIR` e o relatório saía com
 * `"sha": "sem-git"`, exatamente o dado que a auditoria cobra.
 *
 * A resolução tem quatro paradas, na ordem em que o git as faz:
 *   1. `.git` diretório → `.git/HEAD` (checkout normal);
 *   2. `.git` arquivo → `gitdir: <caminho>` (relativo ao projeto ou absoluto) →
 *      `<gitdir>/HEAD`;
 *   3. HEAD com `ref: refs/heads/<branch>` → procurar o ref no próprio gitdir e,
 *      via `commondir`, no repositório principal (é lá que o ref do worktree
 *      mora de verdade);
 *   4. `packed-refs` dos dois lados, porque ref recém-criado não é o único caso.
 *
 * Não achou nada → `"sem-git"`: o relatório continua gravável, só sem sha.
 */
import { readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

const SEM_SHA = "sem-git";
const TAMANHO_SHA_CURTO = 8;

function lerLinha(caminho: string): string | null {
	try {
		return readFileSync(caminho, "utf8").trim();
	} catch {
		return null;
	}
}

/** Diretório git real: `.git` pode ser diretório (checkout) ou arquivo (worktree). */
function resolverGitdir(dotGit: string): string | null {
	try {
		if (statSync(dotGit).isDirectory()) return dotGit;
	} catch {
		return null;
	}
	// `.git`-arquivo: uma linha só, `gitdir: <caminho>` (relativo ao projeto).
	const primeira = lerLinha(dotGit)?.split("\n")[0]?.trim();
	if (!primeira?.startsWith("gitdir:")) return null;
	const alvo = primeira.slice("gitdir:".length).trim();
	if (!alvo) return null;
	return isAbsolute(alvo) ? alvo : resolve(dirname(dotGit), alvo);
}

/** Onde procurar o ref: o gitdir do worktree E o repositório principal. */
function basesDoRef(gitdir: string): string[] {
	const bases = [gitdir];
	// `commondir` só existe em worktree; é relativo ao gitdir e pode repetir.
	const comum = lerLinha(join(gitdir, "commondir"));
	if (comum) {
		const resolvido = resolve(gitdir, comum);
		if (!bases.includes(resolvido)) bases.push(resolvido);
	}
	return bases;
}

function shaDoRef(ref: string, bases: string[]): string | null {
	for (const base of bases) {
		const solto = lerLinha(join(base, ref));
		if (solto) return solto;
	}
	for (const base of bases) {
		const packed = lerLinha(join(base, "packed-refs"));
		if (!packed) continue;
		for (const linha of packed.split("\n")) {
			// `<sha> <ref>` — linhas de comentário (`#`) e de tag (`^`) não casam.
			const [sha, refPacked] = linha.trim().split(/\s+/);
			if (refPacked === ref && sha) return sha;
		}
	}
	return null;
}

/** Sha curto (8 chars) do commit de `raiz`, ou `"sem-git"`. */
export function shaDoCodigo(raiz: string = process.cwd()): string {
	const gitdir = resolverGitdir(join(raiz, ".git"));
	if (!gitdir) return SEM_SHA;

	const head = lerLinha(join(gitdir, "HEAD"));
	if (!head) return SEM_SHA;

	// HEAD destacado ( detached) já traz o sha na mão.
	const sha = head.startsWith("ref: ")
		? shaDoRef(head.slice("ref: ".length).trim(), basesDoRef(gitdir))
		: head;

	return sha ? sha.slice(0, TAMANHO_SHA_CURTO) : SEM_SHA;
}
