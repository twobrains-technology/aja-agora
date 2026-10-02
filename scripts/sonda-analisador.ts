// FIX-435 (D5/D6) — sonda do ANALYZER REAL no modelo do agente.
//
// Por que existe: o analyzer deixou de rodar no `claude-haiku-4-5` e passou a
// usar o MESMO `AI_MODEL` do agente (hoje `qwen3.8-flash`). Duas coisas nunca
// foram provadas nesse caminho:
//
//   1. o qwen extrai os campos de dinheiro do funil (parcela × valor do bem)?
//   2. o structured output passa pelo client OpenAI-compatível do gateway
//      (`/v1/chat/completions`)? O `json_schema` estrito não está provado pra ele.
//
// O teste determinístico prova a DEGRADAÇÃO (`analyze.indisponivel.test.ts`);
// esta sonda prova a CLASSIFICAÇÃO. São coisas diferentes e as duas precisam
// existir — o mesmo raciocínio de `sonda-intent-aceite.ts`.
//
// Uso (precisa do gateway de pé — skill local-dev §5.5):
//   LITELLM_BASE_URL=http://litellm.orb.local LITELLM_API_KEY=sk-local-dev \
//   AI_MODEL=qwen3.8-flash pnpm tsx scripts/sonda-analisador.ts
//
// Sem gateway a sonda NÃO estoura: `analyzeTurn` engole o erro e devolve o
// fallback neutro. Aí cada caso sai como "~ sem resposta" (falha de INFRA, não
// de classificação) e o exit code continua 0 — a sonda mede o modelo, não a rede.

// Precisa ser o PRIMEIRO import: carrega .env e traduz DNS de container→host.
import "./_env-host";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { analyzeTurn, type TurnAnalysis } from "@/lib/agent/turn-analyzer";
import { modeloDoAnalisador } from "@/lib/llm/model-provider";

type Campo = "detectedCategory" | "creditMin" | "creditMax" | "parcelaMensal" | "isExplicitSwitch";

/** Cada caso crava os campos que o funil USA. Frase fixa e verificação campo a
 * campo — sonda que "avalia" não vira gate. */
type Caso = {
	fala: string;
	nota: string;
	esperado: Partial<Pick<TurnAnalysis, Campo>>;
	/** A pergunta que o agente acabou de fazer (a âncora do classificador). */
	ultimaFalaDoAgente: string;
	gateAtivo: string;
};

const PERGUNTA_DA_PARCELA = "Quanto você pretende pagar por mês?";
const PERGUNTA_DO_VALOR = "Quanto custa, mais ou menos, o bem que você tem em mente?";

const CASOS: Caso[] = [
	// ── PARCELA × VALOR DO BEM: a separação que a degradação de 01/10 quebrou ──
	{
		fala: "Consigo pagar R$ 680/mês",
		nota: "parcela com /mês (o 8b64899b)",
		esperado: { parcelaMensal: 680 },
		ultimaFalaDoAgente: PERGUNTA_DA_PARCELA,
		gateAtivo: "credit",
	},
	{
		fala: "cabe uns 900/mês no meu bolso",
		nota: "parcela com /mês",
		esperado: { parcelaMensal: 900 },
		ultimaFalaDoAgente: PERGUNTA_DA_PARCELA,
		gateAtivo: "credit",
	},
	{
		fala: "só consigo 200 por mês",
		nota: "parcela sem barra",
		esperado: { parcelaMensal: 200 },
		ultimaFalaDoAgente: PERGUNTA_DA_PARCELA,
		gateAtivo: "credit",
	},
	{
		fala: "essa parcela ta alta, no máximo 800 mensais",
		nota: "parcela por extenso",
		esperado: { parcelaMensal: 800 },
		ultimaFalaDoAgente: PERGUNTA_DA_PARCELA,
		gateAtivo: "credit",
	},
	// ── VALOR DO BEM ──
	{
		fala: "quero um carro de 80 mil",
		nota: "valor do bem em mil",
		esperado: { detectedCategory: "auto", creditMax: 80_000 },
		ultimaFalaDoAgente: PERGUNTA_DO_VALOR,
		gateAtivo: "credit",
	},
	{
		fala: "um carro de R$ 80.000",
		nota: "valor do bem em R$",
		esperado: { creditMax: 80_000 },
		ultimaFalaDoAgente: PERGUNTA_DO_VALOR,
		gateAtivo: "credit",
	},
	{
		fala: "uns 200 mil",
		nota: "valor isolado",
		esperado: { creditMax: 200_000 },
		ultimaFalaDoAgente: PERGUNTA_DO_VALOR,
		gateAtivo: "credit",
	},
	{
		fala: "de 100 a 200 mil",
		nota: "faixa (piso e teto)",
		esperado: { creditMin: 100_000, creditMax: 200_000 },
		ultimaFalaDoAgente: PERGUNTA_DO_VALOR,
		gateAtivo: "credit",
	},
	// ── CATEGORIA E TROCA ──
	{
		fala: "quero um apartamento",
		nota: "categoria",
		esperado: { detectedCategory: "imovel" },
		ultimaFalaDoAgente: "O que você tem em mente?",
		gateAtivo: "desire",
	},
	{
		fala: "na verdade prefiro uma moto",
		nota: "troca explícita de categoria",
		esperado: { detectedCategory: "moto", isExplicitSwitch: true },
		ultimaFalaDoAgente: "Qual categoria combina com o que você procura?",
		gateAtivo: "desire",
	},
];

/** A conversa no ponto do funil em que esses turnos acontecem: categoria
 *  definida e o gate do valor ativo. */
function meta(): ConversationMetadata {
	return {
		currentPersona: "helena-auto",
		currentCategory: "auto",
		desireAsked: true,
		desireAnswered: true,
		qualifyAnswers: {},
	} as ConversationMetadata;
}

type Resultado = "ok" | "erro-classificacao" | "sem-resposta";

function campos(r: TurnAnalysis): string {
	return `cat=${r.detectedCategory} credit=${r.creditMin}-${r.creditMax} parcela=${r.parcelaMensal} troca=${r.isExplicitSwitch} intent=${r.userIntent}`;
}

function confere(r: TurnAnalysis, esperado: Caso["esperado"]): boolean {
	return (Object.keys(esperado) as Campo[]).every((campo) => r[campo] === esperado[campo]);
}

/** Percentil por posto (nearest-rank) — com 10 casos o interpolado só inventaria
 *  precisão que a amostra não tem. */
function percentil(ordenados: number[], p: number): number {
	if (ordenados.length === 0) return 0;
	const posto = Math.min(ordenados.length, Math.max(1, Math.ceil(p * ordenados.length)));
	return ordenados[posto - 1];
}

async function main() {
	console.log(`\nSonda do analyzer — modelo = ${modeloDoAnalisador()} · ${CASOS.length} casos\n`);

	const latencias: number[] = [];
	let ok = 0;
	let erros = 0;
	let semResposta = 0;

	for (const caso of CASOS) {
		const start = Date.now();
		const r = await analyzeTurn(caso.fala, "helena-auto", meta(), {
			activeGate: caso.gateAtivo,
			lastAssistantText: caso.ultimaFalaDoAgente,
		});
		const ms = Date.now() - start;
		latencias.push(ms);

		let resultado: Resultado;
		if (confere(r, caso.esperado)) resultado = "ok";
		else if (r.indisponivel === true) resultado = "sem-resposta";
		else resultado = "erro-classificacao";

		if (resultado === "ok") ok++;
		else if (resultado === "sem-resposta") semResposta++;
		else erros++;

		const marca = resultado === "ok" ? "✓" : resultado === "sem-resposta" ? "~" : "✗";
		const esperado = Object.entries(caso.esperado)
			.map(([campo, valor]) => `${campo}=${valor}`)
			.join(" ");
		console.log(`  ${marca} ${JSON.stringify(caso.fala).padEnd(42)} ${`${ms}ms`.padStart(7)}`);
		console.log(`      ${campos(r)}  · esperado: ${esperado} (${caso.nota})`);
	}

	const ordenadas = [...latencias].sort((a, b) => a - b);
	console.log(
		`\n  ${ok}/${CASOS.length} conforme o esperado · p50 = ${percentil(ordenadas, 0.5)}ms · p95 = ${percentil(ordenadas, 0.95)}ms`,
	);
	if (semResposta > 0) {
		console.log(
			`  ~ ${semResposta} sem resposta (timeout/erro → fallback "indisponivel") — falha de INFRA, não de classificação`,
		);
	}
	if (erros > 0) console.log(`  ✗ ${erros} erro(s) REAL(is) de classificação`);
	console.log("");

	// O gate é sobre CLASSIFICAÇÃO. Gateway fora do ar reprova a rede, não o
	// modelo — falhar por isso ensinaria a ignorar a sonda.
	if (erros > 0) process.exitCode = 1;
}

void main();
