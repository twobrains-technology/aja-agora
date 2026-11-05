// ESPELHO DE PROMPT — a caixa de prompt é a lei (Postgres), o Langfuse é o espelho.
//
// Cada versão publicada em `caixa_de_prompt` vira um prompt no Langfuse com a
// label `production`, para o prompt aparecer na UI do Langfuse. O espelho nunca
// é dependência do runtime: falha de espelho SÓ loga, a publicação segue igual
// (B13). Sem as envs do Langfuse (mesma régua de `configDoLangfuse`: flag ligada
// E as três chaves), é no-op.
//
// Idempotência: a versão (nome + versão) é a chave. GET com `version=N`:
// existindo, o PUT atualiza só as labels; não existindo (404), o POST cria. Rerodar
// sobre o mesmo estado não cria versão nova nem erra.
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { caixaDePrompt } from "@/db/schema";
import { NOME_DA_CAIXA } from "@/lib/agent/box/caixa";
import { type ConfigDoLangfuse, configDoLangfuse } from "@/lib/agent/pi/langfuse";

export type EspecieDoPrompt = { nome: string; versao: number; texto: string };

/** Resultado do espelho: `desligado` (sem envs), `espelhado`, `sem-versao` (nada
 *  publicado no banco), `falhou` (erro só logado). */
export type ResultadoDoEspelho = "desligado" | "espelhado" | "sem-versao" | "falhou";

function autorizacaoBasica(c: ConfigDoLangfuse): string {
	return `Basic ${Buffer.from(`${c.publicKey}:${c.secretKey}`).toString("base64")}`;
}

/** Cria (POST) ou atualiza as labels (PUT) do prompt no Langfuse. Propaga erro —
 *  quem decide o que fazer com a falha é o chamador (aqui de dentro, loga e
 *  segue). Idempotente: rerodar não cria versão nova. */
export async function espelharPrompt(
	prom: EspecieDoPrompt,
	config: ConfigDoLangfuse,
): Promise<"criado" | "atualizado"> {
	const base = config.baseUrl.replace(/\/+$/, "");
	const headers = {
		Authorization: autorizacaoBasica(config),
		"Content-Type": "application/json",
	};
	const existente = await fetch(
		`${base}/api/public/v2/prompts/${encodeURIComponent(prom.nome)}?version=${prom.versao}`,
		{ headers },
	);
	if (existente.ok) {
		const res = await fetch(`${base}/api/public/v2/prompts/${encodeURIComponent(prom.nome)}`, {
			method: "PUT",
			headers,
			body: JSON.stringify({ name: prom.nome, version: prom.versao, newLabels: ["production"] }),
		});
		if (!res.ok) throw new Error(`[espelho] PUT do prompt falhou: HTTP ${res.status}`);
		return "atualizado";
	}
	if (existente.status !== 404) {
		throw new Error(`[espelho] GET do prompt falhou: HTTP ${existente.status}`);
	}
	const res = await fetch(`${base}/api/public/v2/prompts`, {
		method: "POST",
		headers,
		body: JSON.stringify({
			name: prom.nome,
			prompt: prom.texto,
			type: "text",
			labels: ["production"],
		}),
	});
	if (!res.ok) throw new Error(`[espelho] POST do prompt falhou: HTTP ${res.status}`);
	return "criado";
}

/** Espelha a última versão publicada da caixa (label `production` no banco — o
 *  Postgres é a lei —) no Langfuse. Falha de espelho SÓ loga: nunca derruba a
 *  publicação, nunca estoura. */
export async function espelharCaixaDePrompt(
	env: Record<string, string | undefined> = process.env,
): Promise<ResultadoDoEspelho> {
	const config = configDoLangfuse(env);
	if (!config) return "desligado";
	try {
		const linha = await db
			.select({ versao: caixaDePrompt.versao, texto: caixaDePrompt.texto })
			.from(caixaDePrompt)
			.where(and(eq(caixaDePrompt.nome, NOME_DA_CAIXA), eq(caixaDePrompt.label, "production")))
			.orderBy(desc(caixaDePrompt.versao))
			.limit(1);
		const ultima = linha[0];
		if (!ultima) return "sem-versao";
		await espelharPrompt(
			{ nome: NOME_DA_CAIXA, versao: ultima.versao, texto: ultima.texto },
			config,
		);
		return "espelhado";
	} catch (erro) {
		console.error("[espelho-prompt] espelho da caixa falhou (a publicação segue igual):", erro);
		return "falhou";
	}
}
