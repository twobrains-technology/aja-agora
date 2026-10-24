// A CAIXA — a conduta do agente num lugar só, versionada, sem serviço externo.
//
// Antes (até 19/10/2026) a caixa morava no prompt management do Langfuse. Dois
// defeitos medidos derrubaram aquele arranjo: a label do prompt era compartilhada
// entre prod, dev e local (publicar para testar em dev mudava a conduta de
// produção — 17/10, três versões publicadas e revertidas) e o turno do cliente
// dependia de um serviço externo para ler o system prompt.
//
// Agora: tabela `caixa_de_prompt` no próprio banco, uma linha por VERSÃO, e a
// leitura pega a maior versão da label do ambiente. O texto do código
// (`SYSTEM_PROMPT`) é o fallback — banco fora do ar não derruba turno, e o
// mesmo texto continua servindo de semente.
//
// O que NÃO muda: os blocos de FATO (gate, trava do telefone, cards,
// persistência) continuam código. Só a CONDUTA vem daqui.
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { caixaDePrompt } from "@/db/schema";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";

/** O mesmo nome que o prompt tinha no Langfuse — mantido para rastrear histórico. */
export const NOME_DA_CAIXA = "aja-system-prompt";

export type Caixa = {
	nome: string;
	label: string;
	/** 0 = veio do código (fallback), não de uma linha publicada. */
	versao: number;
	texto: string;
	origem: "banco" | "codigo";
};

/** Linha da tabela, como a leitura devolve (sem o `id`/`criado_em`, que não pesam). */
export type LinhaDaCaixa = { versao: number; texto: string };

const TTL_MS = 60_000;

let cache: { valor: Caixa; quando: number } | null = null;

/** A label é POR AMBIENTE. `CAIXA_LABEL` manda; sem ela, produção é o default
 * (mesmo comportamento do `LANGFUSE_PROMPT_LABEL` que existia antes). */
export function labelDaCaixa(env: NodeJS.ProcessEnv = process.env): string {
	return env.CAIXA_LABEL?.trim() || "production";
}

/** O texto que sempre existe: a constante do código. */
export function caixaDoCodigo(label = labelDaCaixa()): Caixa {
	return {
		nome: NOME_DA_CAIXA,
		label,
		versao: 0,
		texto: SYSTEM_PROMPT,
		origem: "codigo",
	};
}

/** A maior versão vence. Texto vazio é descartado — versão publicada em branco
 * seria um turno sem conduta nenhuma, pior que o fallback. */
export function escolherLinha(linhas: readonly LinhaDaCaixa[]): LinhaDaCaixa | null {
	let melhor: LinhaDaCaixa | null = null;
	for (const l of linhas) {
		if (!l.texto?.trim()) continue;
		if (!melhor || l.versao > melhor.versao) melhor = l;
	}
	return melhor;
}

/** Monta a Caixa a partir das linhas do banco; cai no código quando não há
 * versão válida. É a decisão inteira, isolada para poder ser testada sem banco. */
export function decidirCaixa(linhas: readonly LinhaDaCaixa[], label = labelDaCaixa()): Caixa {
	const linha = escolherLinha(linhas);
	if (!linha) return caixaDoCodigo(label);
	return {
		nome: NOME_DA_CAIXA,
		label,
		versao: linha.versao,
		texto: linha.texto,
		origem: "banco",
	};
}

/** Lê a caixa do banco. Nunca lança: qualquer falha (tabela ausente, banco fora)
 * devolve a versão do código. */
export async function lerCaixa(opts?: {
	label?: string;
	/** Injetável para teste — por padrão consulta o banco. */
	buscarLinhas?: (nome: string, label: string) => Promise<LinhaDaCaixa[]>;
	agora?: number;
}): Promise<Caixa> {
	const label = opts?.label ?? labelDaCaixa();
	const agora = opts?.agora ?? Date.now();
	if (cache && cache.valor.label === label && agora - cache.quando < TTL_MS) {
		return cache.valor;
	}

	let linhas: LinhaDaCaixa[] = [];
	try {
		const buscar = opts?.buscarLinhas ?? buscarLinhasNoBanco;
		linhas = await buscar(NOME_DA_CAIXA, label);
	} catch (erro) {
		console.error(
			`[caixa] leitura do banco falhou, usando o texto do código: ${
				erro instanceof Error ? erro.message : String(erro)
			}`,
		);
	}

	const valor = decidirCaixa(linhas, label);
	cache = { valor, quando: agora };
	return valor;
}

/** Uma versão publicada, com autor e data — o que a tela do admin mostra. */
export type VersaoDaCaixa = {
	versao: number;
	texto: string;
	publicadoPor: string | null;
	criadoEm: Date;
};

/**
 * O histórico da label, da MAIOR versão para a menor.
 *
 * Sempre a label pedida — nunca "a última de todas": o histórico de dev não pode
 * se misturar com o de produção (foi assim que se publicou em prod sem querer em
 * 17/10). Não corta aqui: quantas versões a resposta carrega é decisão da rota.
 */
export async function listarVersoes(
	nome: string,
	label: string,
	opts?: {
		/** Injetável para teste — por padrão consulta o banco. */
		buscarLinhas?: (nome: string, label: string) => Promise<VersaoDaCaixa[]>;
	},
): Promise<VersaoDaCaixa[]> {
	const buscar = opts?.buscarLinhas ?? buscarVersoesNoBanco;
	const linhas = await buscar(nome, label);
	return [...linhas].sort((a, b) => b.versao - a.versao);
}

async function buscarVersoesNoBanco(nome: string, label: string): Promise<VersaoDaCaixa[]> {
	const linhas = await db
		.select({
			versao: caixaDePrompt.versao,
			texto: caixaDePrompt.texto,
			publicadoPor: caixaDePrompt.publicadoPor,
			criadoEm: caixaDePrompt.criadoEm,
		})
		.from(caixaDePrompt)
		.where(and(eq(caixaDePrompt.nome, nome), eq(caixaDePrompt.label, label)))
		.orderBy(desc(caixaDePrompt.versao));
	return linhas;
}

async function buscarLinhasNoBanco(nome: string, label: string): Promise<LinhaDaCaixa[]> {
	const linhas = await db
		.select({ versao: caixaDePrompt.versao, texto: caixaDePrompt.texto })
		.from(caixaDePrompt)
		.where(and(eq(caixaDePrompt.nome, nome), eq(caixaDePrompt.label, label)))
		.orderBy(desc(caixaDePrompt.versao));
	return linhas;
}

/** Publica uma versão nova. A versão é a próxima da label — nunca há update de
 * texto, o que torna a auditoria trivial: cada linha é o que foi publicado um dia. */
export async function publicarCaixa(args: {
	texto: string;
	label?: string;
	publicadoPor?: string | null;
}): Promise<{ versao: number; label: string }> {
	const label = args.label ?? labelDaCaixa();
	const texto = args.texto?.trim();
	if (!texto) throw new Error("[caixa] texto vazio não é publicado");
	const [ultima] = await db
		.select({ versao: caixaDePrompt.versao })
		.from(caixaDePrompt)
		.where(and(eq(caixaDePrompt.nome, NOME_DA_CAIXA), eq(caixaDePrompt.label, label)))
		.orderBy(desc(caixaDePrompt.versao))
		.limit(1);
	const versao = (ultima?.versao ?? 0) + 1;
	await db.insert(caixaDePrompt).values({
		nome: NOME_DA_CAIXA,
		label,
		versao,
		texto,
		publicadoPor: args.publicadoPor ?? null,
	});
	limparCacheDaCaixa();
	return { versao, label };
}

/** Só para teste e para o caminho de publicação. */
export function limparCacheDaCaixa(): void {
	cache = null;
}
