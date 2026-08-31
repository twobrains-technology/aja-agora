/**
 * O gate `name` na posição nova tem as três redes que gate do meio do funil
 * precisa ter.
 *
 * ── Por que este arquivo existe ─────────────────────────────────────────────
 *
 * Em 30/08/2026 o `name` deixou de ser o primeiro gate da conversa e passou a
 * viver entre o valor do bem e o pedido de documento. A mudança está certa — é
 * o que tira a pergunta do turno em que 49% das conversas morrem —, mas ela
 * mudou a NATUREZA do gate sem, na primeira versão, mudar nada em volta.
 *
 * No primeiro contato, `name` não precisava de rede nenhuma: era o único gate
 * na mesa, e quem não respondia simplesmente não tinha conversa. No meio do
 * funil ele vira um portão bloqueante — e portão bloqueante sem escape, sem
 * reengajamento e insistindo sobre quem recusou é como um funil fecha.
 *
 * O agravante é o segmento: quem chega aqui já escolheu a categoria e arrastou
 * a agulha até o valor. Medido em produção (16–30/08), é a população em que
 * **86% entrega o CPF**. Travar justamente ela seria trocar 49% de perda no
 * começo por perda no ponto de maior conversão marginal.
 *
 * As três redes, e o que cada uma cobre:
 *
 *   1. **escape** — o cliente responde algo que `extractName` recusa ("prefiro
 *      não dizer", "depois"). Sem teto de tentativas, `nextGate` devolveria
 *      `name` para sempre.
 *   2. **reengajamento** — o cliente simplesmente some. O watchdog
 *      (`gate-reengage-poll`) pulava este gate porque ele estava em
 *      `NON_REENGAGE_GATES`, herança do tempo em que ele era o 1º contato.
 *   3. **recusa** — "prefiro não passar meu nome" devolvia o card de novo,
 *      contra o que o próprio FIX-399c estabelece para o resto do funil.
 *
 * E uma regra que atravessa as três: **o escape nunca fabrica um nome.** Nome
 * assumido chega à mesa como se o cliente o tivesse dito, e o agente passa a
 * chamá-lo assim — é a mesma linha que `dinheiroDeclaradoPeloCliente` traça
 * para o lance.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O classificador é dublado: o que estes casos provam é a CADEIA
// `analyzeAndMerge → nextGate(hasContactName real) → registerGateStuckTurn`,
// não a qualidade da classificação (que tem arquivo próprio). Sem o dublê cada
// caso levava ~8 s batendo no modelo, e teste lento é teste que alguém desliga.
vi.mock("@/lib/agent/turn-analyzer", async (importOriginal) => {
	const real = await importOriginal<typeof import("@/lib/agent/turn-analyzer")>();
	return {
		...real,
		analyzeTurn: vi.fn(async () => ({ intent: "neutral" as const, extracted: {} })),
	};
});

import { NON_REENGAGE_GATES, pendingGateAfterTurn, SPECIALIST_EXIT_OFFER } from "./gate-reengage";
import type { ConversationMetadata } from "./personas";
import { GATE_STUCK_ESCAPE_THRESHOLD, nextGate, STUCK_ESCAPE_GATES } from "./qualify-state";

const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
	process.env.VITRINE_CPF = "";
	process.env.VITRINE_CELULAR = "";
});

afterEach(() => {
	process.env = { ...ENV_ORIGINAL };
});

const SEM_NOME = { hasContactName: false };

/** Quem informou categoria e valor e ainda não se apresentou. */
function noGateDoNome(extra: Partial<ConversationMetadata> = {}): ConversationMetadata {
	return {
		currentCategory: "imovel",
		qualifyAnswers: { creditMax: 400_000 },
		...extra,
	} as ConversationMetadata;
}

describe("rede 1 — o gate tem escape, e ele não fabrica nome", () => {
	it("`name` está no conjunto que ganha default por teto de tentativas", () => {
		expect(STUCK_ESCAPE_GATES.has("name")).toBe(true);
	});

	it("depois do teto, o funil DESISTE da pergunta e segue", async () => {
		// ⚠️ ATRAVÉS DE `analyzeAndMerge`, não chamando `registerGateStuckTurn`
		// direto — e essa diferença é o item inteiro.
		//
		// A primeira versão deste teste alimentava o contador na mão, em laço. Ele
		// ficava verde enquanto o escape era CÓDIGO MORTO em produção: o único
		// chamador de `registerGateStuckTurn` passava `hasContactName: true` fixo,
		// então `nextGate` nunca lhe entregava `name`, o contador nunca subia e
		// `nomeDispensado` nunca era gravado. O teste fornecia o input que o
		// caminho real não conseguia produzir — o anti-padrão que o CLAUDE.md
		// nomeia, aplicado ao conserto de um P0.
		//
		// Passando pelo caminho de verdade, se o escape voltar a ser inalcançável
		// este arquivo fica vermelho.
		const { analyzeAndMerge } = await import("./orchestrator/analyze");
		const meta = noGateDoNome();
		expect(nextGate(meta, SEM_NOME)).toBe("name");

		for (let i = 0; i < GATE_STUCK_ESCAPE_THRESHOLD; i++) {
			// Turno sem progresso: o cliente responde algo que não é um nome.
			await analyzeAndMerge("prefiro não dizer", "consultor" as never, meta, null, false);
		}

		expect(meta.nomeDispensado).toBe(true);
		// E o funil anda: o próximo passo é o documento, não a mesma pergunta.
		expect(nextGate(meta, SEM_NOME)).toBe("identify");
	});

	it("o escape NÃO inventa um nome", async () => {
		const { analyzeAndMerge } = await import("./orchestrator/analyze");
		const meta = noGateDoNome();
		for (let i = 0; i < GATE_STUCK_ESCAPE_THRESHOLD; i++) {
			await analyzeAndMerge("depois eu falo", "consultor" as never, meta, null, false);
		}
		// Nada em `qualifyAnswers` que pareça um nome, e nenhum campo de nome
		// gravado: desistir da pergunta é diferente de responder por ele.
		expect(JSON.stringify(meta.qualifyAnswers ?? {})).not.toMatch(/nome|name/i);
	});

	it("antes do teto ele ainda insiste — o escape é última saída, não a primeira", async () => {
		const { analyzeAndMerge } = await import("./orchestrator/analyze");
		const meta = noGateDoNome();
		await analyzeAndMerge("prefiro não dizer", "consultor" as never, meta, null, false);

		expect(meta.nomeDispensado).toBeUndefined();
		expect(nextGate(meta, SEM_NOME)).toBe("name");
	});

	it("e com o nome conhecido, o contador nem começa", async () => {
		// O `hasContactName` real é o que faz o escape existir. Se ele voltar a ser
		// um `true` fixo, este caso continua verde e o de cima fica vermelho — é o
		// par que denuncia a regressão.
		const { analyzeAndMerge } = await import("./orchestrator/analyze");
		const meta = noGateDoNome();
		for (let i = 0; i < GATE_STUCK_ESCAPE_THRESHOLD + 1; i++) {
			await analyzeAndMerge("prefiro não dizer", "consultor" as never, meta, null, true);
		}
		expect(meta.gateStuckTurns?.name ?? 0).toBe(0);
	});
});

describe("rede 2 — o watchdog enxerga quem some neste gate", () => {
	it("`name` saiu da lista de gates não-reengajáveis", () => {
		expect(NON_REENGAGE_GATES.has("name")).toBe(false);
	});

	it("a conversa que parou no nome fica marcada para o watchdog", () => {
		// É o lead mais valioso do funil: escolheu a categoria, informou o valor,
		// e parou na pergunta seguinte.
		expect(
			pendingGateAfterTurn({
				meta: noGateDoNome(),
				gateFired: false,
				isUserTurn: true,
				hasContactName: false,
			}),
		).toBe("name");
	});

	it("quem já se apresentou continua sendo reengajado no gate seguinte", () => {
		expect(
			pendingGateAfterTurn({
				meta: noGateDoNome(),
				gateFired: false,
				isUserTurn: true,
				hasContactName: true,
			}),
		).toBe("identify");
	});

	it("a cobrança EXISTE nos dois canais — inclusive na web, onde a mudança vive", async () => {
		// O buraco que a revisão pegou: `gateQuestion("name", …, "web")` devolve
		// null por design (na web o card É a pergunta), então a re-cobrança saía
		// vazia. O poll fazia `continue` DEPOIS de já ter apagado o marcador e
		// ANTES do bump de tentativa — o lead ficava preso em 1 para sempre e a
		// 4ª cobrança, que oferece o especialista, nunca chegava.
		//
		// E era o canal que importa: a agulha com estimativa é web-only, e as 71
		// conversas medidas são web.
		const { reengageQuestionForGate } = await import("./gate-reengage");

		for (const canal of ["web", "whatsapp"] as const) {
			expect(
				reengageQuestionForGate("name", "imovel", 1, undefined, undefined, canal),
				`${canal} · 1ª cobrança`,
			).toContain("como posso te chamar");
			// A escada sobe.
			expect(
				reengageQuestionForGate("name", "imovel", 2, undefined, undefined, canal),
				`${canal} · 2ª`,
			).toContain("rapidinho");
			// E o teto oferece a saída em vez de perguntar de novo.
			expect(
				reengageQuestionForGate("name", "imovel", 4, undefined, undefined, canal),
				`${canal} · teto`,
			).toBe(SPECIALIST_EXIT_OFFER);
		}
	});

	it("mas no PRIMEIRO contato o reengajamento não inventa pergunta", async () => {
		// Sem categoria é o começo da conversa, onde o directive de abertura já
		// pergunta o nome. Duplicar ali é o que o FIX-17 evitou.
		const { reengageQuestionForGate } = await import("./gate-reengage");
		expect(reengageQuestionForGate("name", null, 1, undefined, undefined, "web")).toBeNull();
	});

	it("e o guard de turno-mudo do WhatsApp passa a re-cobrar o nome", async () => {
		// Sem isto, um turno que fecha mudo no WhatsApp deixa a conversa parada com
		// o cliente esperando uma pergunta que ninguém repete.
		const { isMandatoryCollectionGate } = await import("./gate-reengage");
		expect(isMandatoryCollectionGate("name")).toBe(true);
	});
});

describe("rede 3 — recusar o nome não devolve a mesma pergunta", () => {
	it("o card do nome não reaparece para quem recusou", async () => {
		const { decideShowGate } = await import("./qualify-state");
		expect(
			decideShowGate({
				gate: "name",
				intent: "declines",
				meta: noGateDoNome(),
				isUserTurn: true,
			}),
		).toBe(false);
	});

	it("nem para quem pediu mais opções — o card do nome não rouba a resposta", async () => {
		// Com a vitrine ligada, o `name` também acontece no FECHO. Ali "quero ver
		// todas" devolveria o card do nome no lugar das opções — o FIX-183 já
		// proíbe isso para o resto do funil.
		const { decideShowGate } = await import("./qualify-state");
		expect(
			decideShowGate({
				gate: "name",
				intent: "wants_more_options",
				meta: noGateDoNome(),
				isUserTurn: true,
			}),
		).toBe(false);
	});

	it("mas continua aparecendo para quem só respondeu outra coisa", () => {
		// A recusa é o único caso novo — o resto do comportamento fica igual, senão
		// o gate voltaria a ser invisível como era antes de 30/08.
		return (async () => {
			const { decideShowGate } = await import("./qualify-state");
			for (const intent of ["neutral", "providing_info", "ready_to_proceed"] as const) {
				expect(
					decideShowGate({ gate: "name", intent, meta: noGateDoNome(), isUserTurn: true }),
					intent,
				).toBe(true);
			}
		})();
	});

	it("e o gate de COLETA obrigatória continua não cedendo a quem recusa", async () => {
		// `identify` é outra coisa: sem CPF a Bevi não simula nem contrata. A
		// distinção é o ponto — o nome ajuda a vender, o documento é pré-requisito.
		const { decideShowGate } = await import("./qualify-state");
		expect(
			decideShowGate({
				gate: "identify",
				intent: "declines",
				meta: noGateDoNome({ nomeDispensado: true }),
				isUserTurn: true,
			}),
		).toBe(true);
	});
});

describe("a jornada de quem recusa o nome chega ao documento do mesmo jeito", () => {
	it("recusa + teto de tentativas → `identify`, sem nome inventado", async () => {
		const { analyzeAndMerge } = await import("./orchestrator/analyze");
		const meta = noGateDoNome();

		// Três turnos em que a resposta não é um nome.
		for (let i = 0; i < GATE_STUCK_ESCAPE_THRESHOLD; i++) {
			await analyzeAndMerge("prefiro não passar meu nome", "consultor" as never, meta, null, false);
		}

		expect(nextGate(meta, SEM_NOME)).toBe("identify");
		// E o funil segue inteiro a partir dali.
		const comIdentidade = { ...meta, identityCollected: true } as ConversationMetadata;
		expect(nextGate(comIdentidade, SEM_NOME)).toBe("search");
	});
});
