/**
 * SONDA DE VARIÂNCIA DE FALA — a medida que separa "desengessamos o agente" de
 * opinião.
 *
 * O agente já foi engessado uma vez e virou "bitolado, respondia sempre a mesma
 * coisa" (ADR 2026-07-13). Todo o expurgo de 2026-07-20 (prompt, sanitizer,
 * directives, testes de copy) foi feito para desfazer isso — mas NENHUM teste
 * media o sintoma. Contagem de `NUNCA` no prompt não é comportamento; byte-
 * igualdade entre duas respostas é.
 *
 * O que esta sonda prova, de forma determinística:
 *   (a) REPETIÇÃO — o cliente diz "não entendi" duas vezes seguidas; as duas
 *       respostas do agente NÃO podem ser iguais byte a byte. Repetir a mesma
 *       frase é o sintoma clínico do agente bitolado.
 *   (b) VARIÂNCIA — a mesma entrada, em N execuções independentes, tem que
 *       produzir fraseados distintos. Medimos por similaridade de Jaccard sobre
 *       bigramas de palavras; acima do teto = fala decorada.
 *
 * Roda com um modelo MAIS FRACO que o de produção (Haiku por padrão): se a
 * latitude sobrevive ao modelo fraco, sobrevive ao forte. O contrário não vale.
 *
 * Uso:
 *   pnpm tsx scripts/sonda-variancia.ts            # 3 execuções, modelo padrão
 *   AI_MODEL=claude-haiku-4-5-20251001 pnpm tsx scripts/sonda-variancia.ts
 *   SONDA_RUNS=5 pnpm tsx scripts/sonda-variancia.ts
 *
 * Precisa de LLM alcançável (gateway LiteLLM). NÃO entra no gate de merge por
 * isso — é nightly/manual. Sai com código 1 quando reprova, para poder ser
 * plugada num job.
 */

import { SPECIALIST_BASE_PROMPT } from "@/lib/agent/system-prompt";

const RUNS = Number(process.env.SONDA_RUNS ?? 3);
/** Acima disto, duas respostas são "a mesma frase com outra roupa". */
const TETO_SIMILARIDADE = 0.6;

type Resultado = { nome: string; passou: boolean; detalhe: string };

function bigramas(texto: string): Set<string> {
	const palavras = texto
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.split(/\s+/)
		.filter(Boolean);
	const out = new Set<string>();
	for (let i = 0; i < palavras.length - 1; i++) out.add(`${palavras[i]} ${palavras[i + 1]}`);
	return out;
}

/** Jaccard sobre bigramas: 1 = idênticas, 0 = nada em comum. */
function similaridade(a: string, b: string): number {
	const A = bigramas(a);
	const B = bigramas(b);
	if (A.size === 0 && B.size === 0) return 1;
	let inter = 0;
	for (const g of A) if (B.has(g)) inter++;
	const uniao = A.size + B.size - inter;
	return uniao === 0 ? 0 : inter / uniao;
}

async function falar(historico: Array<{ role: "user" | "assistant"; content: string }>) {
	const { generateText } = await import("ai");
	const { createAnthropic } = await import("@ai-sdk/anthropic");
	const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
	const model = anthropic(process.env.AI_MODEL ?? "claude-haiku-4-5-20251001");
	const { text } = await generateText({
		model,
		system: SPECIALIST_BASE_PROMPT,
		messages: historico,
		temperature: 1,
	});
	return text.trim();
}

async function sondaRepeticao(): Promise<Resultado> {
	// O cliente não entende, duas vezes seguidas. A segunda resposta tem que ser
	// uma tentativa DIFERENTE — não a mesma frase de novo.
	const historico: Array<{ role: "user" | "assistant"; content: string }> = [
		{ role: "user", content: "oi" },
	];
	const r1 = await falar([...historico, { role: "user", content: "não entendi" }]);
	const r2 = await falar([
		...historico,
		{ role: "user", content: "não entendi" },
		{ role: "assistant", content: r1 },
		{ role: "user", content: "não entendi" },
	]);
	const iguais = r1 === r2;
	const sim = similaridade(r1, r2);
	return {
		nome: 'REPETIÇÃO — "não entendi" 2x devolve respostas diferentes',
		passou: !iguais && sim < TETO_SIMILARIDADE,
		detalhe: iguais
			? "IDÊNTICAS byte a byte — o agente repetiu a mesma frase"
			: `similaridade=${sim.toFixed(2)} (teto ${TETO_SIMILARIDADE})\n    1: ${r1.slice(0, 120)}\n    2: ${r2.slice(0, 120)}`,
	};
}

async function sondaVariancia(): Promise<Resultado> {
	// A MESMA entrada, N vezes, em execuções independentes.
	const falas: string[] = [];
	for (let i = 0; i < RUNS; i++) {
		falas.push(await falar([{ role: "user", content: "quero um carro" }]));
	}
	const pares: Array<[number, number, number]> = [];
	for (let i = 0; i < falas.length; i++) {
		for (let j = i + 1; j < falas.length; j++) pares.push([i, j, similaridade(falas[i], falas[j])]);
	}
	const pior = pares.reduce((m, p) => (p[2] > m[2] ? p : m), [0, 0, 0]);
	const algumIdentico = pares.some(([i, j]) => falas[i] === falas[j]);
	return {
		nome: `VARIÂNCIA — mesma entrada em ${RUNS} execuções produz fraseados distintos`,
		passou: !algumIdentico && pior[2] < TETO_SIMILARIDADE,
		detalhe: algumIdentico
			? "duas execuções devolveram texto IDÊNTICO"
			: `pior par: ${pior[2].toFixed(2)} (teto ${TETO_SIMILARIDADE})\n${falas.map((f, i) => `    ${i + 1}: ${f.slice(0, 110)}`).join("\n")}`,
	};
}

async function main() {
	console.log(
		`\nSonda de variância — modelo: ${process.env.AI_MODEL ?? "claude-haiku-4-5-20251001"}\n`,
	);
	const resultados: Resultado[] = [];
	try {
		resultados.push(await sondaRepeticao());
		resultados.push(await sondaVariancia());
	} catch (err) {
		console.error("Falha ao falar com o modelo (gateway alcançável?):", err);
		process.exit(2);
	}
	let reprovou = false;
	for (const r of resultados) {
		console.log(`${r.passou ? "PASSOU" : "REPROVOU"}  ${r.nome}`);
		console.log(`    ${r.detalhe}\n`);
		if (!r.passou) reprovou = true;
	}
	console.log(
		reprovou
			? "REPROVADO — o agente está repetindo fala. É o sintoma do engessamento (ADR 2026-07-13).\n"
			: "APROVADO — a fala varia; o modelo está conduzindo, não recitando.\n",
	);
	process.exit(reprovou ? 1 : 0);
}

void main();
