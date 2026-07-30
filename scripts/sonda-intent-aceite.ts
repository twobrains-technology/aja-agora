// FIX-387 — sonda do ANALYZER REAL: "faz sentido" é aceite?
//
// Por que existe: o fix do `detectYesNoText` (yes-no.ts) só resolve metade do
// bug. Ele passou a aceitar quando o intent é `ready_to_proceed` — mas quem
// produz esse intent é o analyzer (Haiku), e a spec dele descrevia `neutral`
// como "afirmação curta de acolhimento" ('entendi', 'legal', 'show'), que é
// exatamente onde "faz sentido" caía. Sem medir o classificador REAL, o fix
// ficaria verde no teste e quebrado em produção.
//
// O teste determinístico (`cenario-embutido-faz-sentido.fix-387.test.ts`) prova
// a CONSEQUÊNCIA do intent. Esta sonda prova a CLASSIFICAÇÃO. São coisas
// diferentes e as duas precisam existir.
//
// Uso (precisa do gateway local de pé — ver skill local-dev §5.5):
//   LITELLM_BASE_URL=http://litellm.orb.local LITELLM_API_KEY=sk-local-dev \
//   AI_ANALYZER_MODEL=claude-haiku-4-5 pnpm sonda:intent
//
// Trocar `AI_ANALYZER_MODEL` compara modelos (claude-haiku-4-5, qwen3.6-flash).

// Precisa ser o PRIMEIRO import: carrega .env e traduz DNS de container→host.
import "./_env-host";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { analyzeTurn } from "@/lib/agent/turn-analyzer";

/** A pergunta REAL que o agente fez ao Bernardo em 28/07 16:07 (print
 * `2807-1607-bernardo-06-nao-apresentou-carta-1-milhao.jpg`). */
const PERGUNTA_DO_AGENTE =
	"Boa ideia! Com lance embutido você usa parte da própria carta como lance — mas tem um detalhe importante: o crédito que você recebe diminui nessa proporção. Se você quer R$ 700 mil no final (para pagar o apartamento), e usar lance embutido, a gente precisa buscar uma carta MAIOR — tipo R$ 1 milhão — pra que depois de descontar o embutido, você fique com os R$ 700 mil que precisa. Faz sentido pra você?";

/** Meta no ponto do print: reveal feito, gate do embutido aberto. */
const META: Partial<ConversationMetadata> = {
	desireAsked: true,
	identityCollected: true,
	currentCategory: "imovel",
	searchDispatched: true,
	revealCompleted: true,
	experiencePrev: "returning",
	qualifyAnswers: { creditMax: 700_000, prazoMeses: 12, hasLance: "yes", lanceValue: 200_000 },
};

/** Cada caso diz qual intent é ACEITÁVEL. Mais de um valor = tolerância
 * consciente: o que o produto precisa é que o aceite NÃO caia em `neutral`
 * (que devolve `null` no detectYesNoText e reabre o gate). */
const CASOS: Array<{ fala: string; aceitaveis: string[]; nota: string }> = [
	{ fala: "faz sentido", aceitaveis: ["ready_to_proceed"], nota: "as palavras do Bernardo" },
	{ fala: "faz total sentido", aceitaveis: ["ready_to_proceed"], nota: "variação" },
	{ fala: "concordo", aceitaveis: ["ready_to_proceed"], nota: "variação" },
	{ fala: "por mim tá ótimo", aceitaveis: ["ready_to_proceed"], nota: "variação" },
	{ fala: "perfeito", aceitaveis: ["ready_to_proceed"], nota: "variação" },
	{ fala: "é isso aí", aceitaveis: ["ready_to_proceed"], nota: "variação" },
	{ fala: "sim, vamos assim", aceitaveis: ["ready_to_proceed"], nota: "controle: já funcionava" },
	// Contraprova: recusa e dúvida NÃO podem virar avanço.
	// FIX-396: recusa agora tem rótulo. A contraprova deixou de tolerar
	// "qualquer coisa menos avanço" e passou a exigir o rótulo CERTO — é o que
	// torna a negativa um dado utilizável em vez de ausência de sinal.
	{
		fala: "não, prefiro usar só o meu dinheiro",
		aceitaveis: ["declines"],
		nota: "CONTRAPROVA — recusa COM 'não'",
	},
	{
		fala: "prefiro usar só o meu dinheiro",
		aceitaveis: ["declines"],
		nota: "CONTRAPROVA — recusa SEM 'não' (o P0 da revisão)",
	},
	{ fala: "de jeito nenhum", aceitaveis: ["declines"], nota: "CONTRAPROVA — recusa sem 'não'" },
	{ fala: "achei caro", aceitaveis: ["declines"], nota: "CONTRAPROVA — recusa por preço" },
	{
		fala: "deixa eu pensar",
		aceitaveis: ["expressing_doubt"],
		nota: "CONTRAPROVA — hesitação não é avanço",
	},
	{
		fala: "não entendi essa parte do embutido",
		aceitaveis: ["confused", "asking_question"],
		nota: "CONTRAPROVA — confusão não é avanço",
	},
];

const modelo = process.env.AI_ANALYZER_MODEL ?? "claude-haiku-4-5";
/** Quantas vezes tentar cada fala antes de contar como erro. O analyzer roda com
 * `ANALYZER_TIMEOUT_MS = 6000` (turn-analyzer.ts) contra latências medidas de
 * 3,2–5,8s: ~8% das chamadas estouram e caem no `NEUTRAL_FALLBACK`. Sem retry, a
 * sonda reportava esse timeout como se o modelo tivesse classificado errado — o
 * que a tornava inútil como gate (a 2ª revisão mediu 12/13, 12/13, 10/13 com
 * ZERO erros reais de classificação). Timeout é falha de INFRA e merece nome
 * próprio. */
const TENTATIVAS = Number(process.env.SONDA_TENTATIVAS ?? 3);

/** `neutral` é ambíguo de propósito no produto: é também o valor do fallback
 * quando o analyzer não responde. Pra sonda, distinguir os dois é o que separa
 * "o modelo errou" de "a rede engasgou". */
const FALLBACK = "neutral";

type Resultado = "ok" | "erro-classificacao" | "sem-resposta";

async function classificar(fala: string): Promise<{ intent: string; tentativas: number }> {
	let ultimo = "(erro)";
	for (let i = 1; i <= TENTATIVAS; i++) {
		try {
			const r = await analyzeTurn(fala, "specialist", META as ConversationMetadata, {
				activeGate: "lance-embutido",
				lastAssistantText: PERGUNTA_DO_AGENTE,
			});
			ultimo = r.userIntent ?? "(null)";
			// Fallback não é resposta: tenta de novo antes de acreditar nele.
			if (ultimo !== FALLBACK) return { intent: ultimo, tentativas: i };
		} catch (e) {
			ultimo = `(erro: ${(e as Error).message.slice(0, 60)})`;
		}
	}
	return { intent: ultimo, tentativas: TENTATIVAS };
}

async function main() {
	console.log(`\nSonda de intent — analyzer = ${modelo} · até ${TENTATIVAS} tentativas por fala`);
	console.log("Âncora: o agente terminou com uma pergunta sim/não.\n");

	let ok = 0;
	let erros = 0;
	let semResposta = 0;

	for (const caso of CASOS) {
		const { intent, tentativas } = await classificar(caso.fala);
		const esperaFallback = caso.aceitaveis.includes(FALLBACK);
		let r: Resultado;
		if (caso.aceitaveis.includes(intent)) r = "ok";
		else if (intent === FALLBACK && !esperaFallback) r = "sem-resposta";
		else r = "erro-classificacao";

		if (r === "ok") ok++;
		else if (r === "sem-resposta") semResposta++;
		else erros++;

		const marca = r === "ok" ? "✓" : r === "sem-resposta" ? "~" : "✗";
		const sufixo = tentativas > 1 ? ` (${tentativas} tentativas)` : "";
		console.log(
			`  ${marca} ${JSON.stringify(caso.fala).padEnd(38)} → ${intent.padEnd(18)} ${caso.nota}${sufixo}`,
		);
	}

	console.log(`\n  ${ok}/${CASOS.length} conforme o esperado`);
	if (semResposta > 0) {
		console.log(
			`  ~ ${semResposta} sem resposta (timeout → fallback "${FALLBACK}") — falha de INFRA, não de classificação`,
		);
	}
	if (erros > 0) console.log(`  ✗ ${erros} erro(s) REAL(is) de classificação`);
	console.log("");

	// O gate é sobre CLASSIFICAÇÃO. Timeout não reprova o modelo — ele reprova a
	// rede, e falhar por isso ensinaria a ignorar a sonda.
	if (erros > 0) process.exitCode = 1;
}

void main();
