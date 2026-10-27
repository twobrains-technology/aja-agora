/**
 * O sha do relatório do gate é prova de auditoria: "qual código rodou". Ele já
 * saiu `"sem-git"` em worktree do git — onde `.git` é um ARQUIVO de uma linha,
 * não um diretório — e o relatório ficou sem rastro do commit.
 *
 * Cada caso abaixo é um layout real de checkout que o leitor tem que resolver
 * SEM binário git e SEM shell: diretório `.git`, `.git`-arquivo, worktree com
 * `commondir` (o ref mora no repo principal), ref só em `packed-refs`, e nada.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { shaDoCodigo } from "./eval-sha";

const SHA_40 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SHA_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SHA_C = "cccccccccccccccccccccccccccccccccccccccc";
const SHA_PACKED = "dddddddddddddddddddddddddddddddddddddddd";

const raizes: string[] = [];

function novaRaiz(): string {
	const raiz = mkdtempSync(join(tmpdir(), "eval-sha-"));
	raizes.push(raiz);
	return raiz;
}

function escrever(caminho: string, conteudo: string): void {
	mkdirSync(join(caminho, ".."), { recursive: true });
	writeFileSync(caminho, conteudo);
}

afterEach(() => {
	for (const raiz of raizes.splice(0)) rmSync(raiz, { recursive: true, force: true });
});

describe("shaDoCodigo", () => {
	// (a) checkout normal: `.git` é diretório.
	test("lê o ref quando .git é diretório", () => {
		const raiz = novaRaiz();
		escrever(join(raiz, ".git", "HEAD"), "ref: refs/heads/main\n");
		escrever(join(raiz, ".git", "refs", "heads", "main"), `${SHA_40}\n`);

		expect(shaDoCodigo(raiz)).toBe("aaaaaaaa");
	});

	// (b) worktree (ou submódulo): `.git` é um arquivo `gitdir: <caminho>`.
	test("lê o ref quando .git é arquivo com gitdir absoluto", () => {
		const raiz = novaRaiz();
		const gitdir = join(raiz, "fora", "gitdir-real");
		escrever(join(gitdir, "HEAD"), "ref: refs/heads/topico\n");
		escrever(join(gitdir, "refs", "heads", "topico"), `${SHA_B}\n`);
		writeFileSync(join(raiz, ".git"), `gitdir: ${gitdir}\n`);

		expect(shaDoCodigo(raiz)).toBe("bbbbbbbb");
	});

	test("resolve gitdir relativo contra o diretório do projeto", () => {
		const raiz = novaRaiz();
		escrever(join(raiz, "sub", "gitdir-real", "HEAD"), "ref: refs/heads/topico\n");
		escrever(join(raiz, "sub", "gitdir-real", "refs", "heads", "topico"), `${SHA_B}\n`);
		writeFileSync(join(raiz, ".git"), "gitdir: sub/gitdir-real\n");

		expect(shaDoCodigo(raiz)).toBe("bbbbbbbb");
	});

	// (c) worktree de verdade: HEAD/ref soltos no gitdir do worktree apontam
	// para um ref que SÓ existe no repo principal (`commondir`). É o layout que
	// produziu o `"sem-git"` do relatório.
	test("lê o ref pelo commondir quando ele não está no gitdir do worktree", () => {
		const base = novaRaiz();
		const raiz = join(base, "wt");
		const gitdir = join(base, "principal", ".git", "worktrees", "wt");
		const comum = join(base, "principal", ".git");

		escrever(join(gitdir, "HEAD"), "ref: refs/heads/kairogyn/chefe\n");
		escrever(join(gitdir, "commondir"), "../..\n");
		mkdirSync(join(gitdir, "refs", "heads"), { recursive: true });
		// O ref NÃO está no gitdir do worktree — só no repo principal.
		escrever(join(comum, "refs", "heads", "kairogyn", "chefe"), `${SHA_C}\n`);
		escrever(join(raiz, ".git"), `gitdir: ${join("..", "principal", ".git", "worktrees", "wt")}\n`);

		expect(shaDoCodigo(raiz)).toBe("cccccccc");
	});

	test("cai no packed-refs quando o ref não está solto no disco", () => {
		const base = novaRaiz();
		const raiz = join(base, "wt");
		const gitdir = join(base, "principal", ".git", "worktrees", "wt");
		const comum = join(base, "principal", ".git");

		escrever(join(gitdir, "HEAD"), "ref: refs/heads/kairogyn/chefe\n");
		escrever(join(gitdir, "commondir"), "../..\n");
		escrever(
			join(comum, "packed-refs"),
			`# pack-refs with: peeled fully-peeled sorted\n${SHA_PACKED} refs/heads/kairogyn/chefe\n`,
		);
		escrever(join(raiz, ".git"), `gitdir: ${join("..", "principal", ".git", "worktrees", "wt")}\n`);

		expect(shaDoCodigo(raiz)).toBe("dddddddd");
	});

	// (d) sem git nenhum: o relatório continua gravável, só sem sha.
	test("devolve sem-git quando não há .git", () => {
		expect(shaDoCodigo(novaRaiz())).toBe("sem-git");
	});

	test("devolve sem-git quando o gitdir do .git-arquivo não existe", () => {
		const raiz = novaRaiz();
		writeFileSync(join(raiz, ".git"), "gitdir: /nao/existe/gitdir\n");

		expect(shaDoCodigo(raiz)).toBe("sem-git");
	});
});
