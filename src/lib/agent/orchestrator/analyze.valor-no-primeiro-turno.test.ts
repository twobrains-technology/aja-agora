/**
 * O valor que o cliente diz de cara vale desde o primeiro turno.
 *
 * Este teste existe porque um anterior mentiu por omissão. Ao tirar o gate
 * `name` da frente de quem já trouxe o alvo de busca
 * (`qualify-state.carta-antes-do-cpf.test.ts`), o fixture entregava
 * `creditMax: 80_000` já resolvido no estado — então provava a cascata do
 * `nextGate` e nunca o caminho que ESCREVE aquele valor. Verde, e sem valor
 * nenhum.
 *
 * Ao exercitar a API do app rodando, o buraco apareceu:
 *
 *   👤 Sou o Paulo, quero um carro de 80 mil
 *   [analyzer] cat=auto credit=null-80000 intent=providing_info   ← entendeu
 *   banco:      contact_name=(vazio)  qualifyAnswers.creditMax=(vazio)
 *   [route]     gate=name   (nos quatro turnos seguidos)
 *
 * O deadlock, em quatro elos:
 *
 *   1. sem nome, `nextGate` devolve `name` — a menos que haja alvo de busca;
 *   2. haver alvo de busca depende de `creditMax` estar no estado;
 *   3. `creditMax` só era promovido depois do gate `desire` ter sido respondido;
 *   4. o gate `desire` só é emitido depois do `name`.
 *
 * Circular: o bypass do nome dependia exatamente do dado que o outro guard
 * impedia de existir. O funil ficava pedindo o nome para sempre, e o valor que
 * o cliente já tinha dito morria em `creditMentionedAtDesire`, que ninguém lê.
 *
 * O guard que bloqueava (FIX-279/296/306) tem razão de ser: impedir que um
 * valor solto de qualquer turno preencha `creditMax` e faça a pergunta dedicada
 * do valor nunca aparecer. Ele continua valendo para tudo — menos para o caso em
 * que a pergunta dedicada não teria o que perguntar: o cliente ABRIU dizendo o
 * valor. Perguntar "quanto custa?" a quem acabou de escrever "de 80 mil" é o
 * defeito que estamos consertando, não um a preservar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { analyzeTurnMock } = vi.hoisted(() => ({ analyzeTurnMock: vi.fn() }));

vi.mock("@/lib/agent/turn-analyzer", async (original) => {
	const real = (await original()) as Record<string, unknown>;
	return { ...real, analyzeTurn: analyzeTurnMock };
});

import type { ConversationMetadata } from "@/lib/agent/personas";
import { nextGate } from "@/lib/agent/qualify-state";
import type { TurnAnalysis } from "@/lib/agent/turn-analyzer";
import { analyzeAndMerge } from "./analyze";

function analise(campos: Partial<TurnAnalysis>): TurnAnalysis {
	return {
		reasoning: "teste",
		detectedCategory: null,
		detectedSubTopic: null,
		isExplicitSwitch: false,
		expertiseLevel: "neutro",
		experiencePrev: null,
		creditMin: null,
		creditMax: null,
		parcelaMensal: null,
		prazoMeses: null,
		hasLance: null,
		desiredItem: null,
		motivation: null,
		monthlySavings: null,
		fgtsValue: null,
		userIntent: "providing_info",
		...campos,
	};
}

/** A conversa recém-nascida: nada respondido, nada coletado. */
function conversaNova(): ConversationMetadata {
	return { currentPersona: "helena-auto", qualifyAnswers: {} } as ConversationMetadata;
}

const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
	analyzeTurnMock.mockReset();
	process.env.VITRINE_CPF = "11144477735";
	process.env.VITRINE_CELULAR = "62992496793";
});

// O env é global do worker: sem restaurar, `VITRINE_*` vaza para todos os
// arquivos seguintes e vira explicação silenciosa para falha alheia.
afterEach(() => {
	process.env = { ...ENV_ORIGINAL };
});

describe("valor declarado na abertura", () => {
	it("PROMOVE o creditMax quando o cliente abre dizendo o valor", async () => {
		analyzeTurnMock.mockResolvedValue(
			analise({ detectedCategory: "auto", creditMax: 80_000, desiredItem: "um carro" }),
		);

		const meta = conversaNova();
		await analyzeAndMerge("Quero um carro ate R$ 80 mil", "helena-auto", meta);

		expect(meta.qualifyAnswers?.creditMax).toBe(80_000);
	});

	it("e com isso o funil vai BUSCAR, em vez de pedir o nome de novo", async () => {
		// O elo que fechava o círculo. Sem a promoção acima, `temAlvoDeBusca` é
		// false e `nextGate` devolve `name` para sempre — foi o `gate=name` nos
		// quatro turnos observados no app.
		//
		// `currentCategory` já vem preenchida porque quem a escreve é o roteador de
		// persona, que roda ANTES deste merge (é o `data-transition` do stream).
		// Alvo de busca é valor E segmento — sem os dois a Bevi não simula.
		analyzeTurnMock.mockResolvedValue(
			analise({ detectedCategory: "auto", creditMax: 80_000, desiredItem: "um carro" }),
		);

		const meta = { ...conversaNova(), currentCategory: "auto" } as ConversationMetadata;
		await analyzeAndMerge("Quero um carro ate R$ 80 mil", "helena-auto", meta);

		expect(nextGate(meta, { hasContactName: false })).toBe("search");
	});

	it("funciona quando o nome vem junto do valor, na mesma frase", async () => {
		analyzeTurnMock.mockResolvedValue(
			analise({ detectedCategory: "auto", creditMax: 80_000, desiredItem: "um carro" }),
		);

		const meta = conversaNova();
		await analyzeAndMerge("Sou o Paulo, quero um carro de 80 mil", "helena-auto", meta);

		expect(meta.qualifyAnswers?.creditMax).toBe(80_000);
	});

	it("[caracterização] a PARCELA declarada na abertura já era aceita antes", async () => {
		// ⚠️ Este caso NÃO cobre a mudança: a promoção de `parcelaAlvo`
		// (`analyze.ts`, bloco da parcela) não foi tocada, e ele passa com o código
		// revertido. Fica como caracterização — o caminho por parcela ("Me mostra
		// as opções primeiro" → "2000", conv aebac770) precisa continuar
		// funcionando agora que ele também leva à busca sem CPF.
		analyzeTurnMock.mockResolvedValue(analise({ detectedCategory: "auto", parcelaMensal: 2_000 }));

		const meta = conversaNova();
		await analyzeAndMerge("consigo pagar 2000 por mês", "helena-auto", meta);

		expect(meta.qualifyAnswers?.parcelaAlvo).toBe(2_000);
	});

	it("NÃO inventa valor quando o cliente não disse nenhum", async () => {
		// O guard original (FIX-279) existe para isto e continua de pé: sem valor
		// na fala, nada é promovido e a pergunta dedicada segue viva.
		analyzeTurnMock.mockResolvedValue(analise({ detectedCategory: "auto" }));

		const meta = conversaNova();
		await analyzeAndMerge("quero comprar um carro", "helena-auto", meta);

		expect(meta.qualifyAnswers?.creditMax).toBeUndefined();
		expect(nextGate(meta, { hasContactName: false })).toBe("name");
	});

	it("número que NÃO é preço não vira faixa de busca", async () => {
		// O risco de promover cedo: o texto tem um número, mas ele não é o valor do
		// bem. `escalaImplicita` (que multiplica "238" por mil) é do turno em que a
		// pergunta do valor foi feita — `valor-declarado.ts:87-89` diz isso com
		// todas as letras. Usá-la na abertura transformaria "tenho 2 filhos" em
		// R$ 2.000 e "nasci em 1990" em R$ 1.990.000.
		analyzeTurnMock.mockResolvedValue(analise({ detectedCategory: "auto", creditMax: 2_000_000 }));

		const meta = { ...conversaNova(), currentCategory: "auto" } as ConversationMetadata;
		await analyzeAndMerge("quero um carro, tenho 2 filhos", "helena-auto", meta);

		expect(meta.qualifyAnswers?.creditMax).toBeUndefined();
	});

	it("não promove valor solto DEPOIS que a busca já rodou", async () => {
		// A exceção é da ABERTURA. Passada a busca, o caminho normal (troca de
		// faixa pós-reveal) é quem manda, com os guards dele.
		analyzeTurnMock.mockResolvedValue(analise({ detectedCategory: "auto", creditMax: 250_000 }));
		const jaBuscou = {
			currentPersona: "helena-auto",
			currentCategory: "auto",
			searchDispatched: true,
			qualifyAnswers: {},
		} as ConversationMetadata;

		await analyzeAndMerge("meu vizinho pagou 250 mil no dele", "helena-auto", jaBuscou);

		expect(jaBuscou.qualifyAnswers?.creditMax).toBeUndefined();
	});

	it("o valor promovido tem que estar ANCORADO na fala — não na cabeça do analyzer", async () => {
		// Este é o risco real de abrir o guard no primeiro turno. O analyzer é um
		// LLM: ele às vezes devolve um número que o cliente não disse (é o FIX-378,
		// "valor que o cliente não disse não entra no funil"). Promover cedo não
		// pode virar promover no escuro — senão o funil busca uma faixa inventada
		// e o cliente recebe cartas que não pediu.
		analyzeTurnMock.mockResolvedValue(analise({ detectedCategory: "auto", creditMax: 250_000 }));

		const meta = conversaNova();
		await analyzeAndMerge("quero um carro pra família", "helena-auto", meta);

		expect(meta.qualifyAnswers?.creditMax).toBeUndefined();
	});
});
