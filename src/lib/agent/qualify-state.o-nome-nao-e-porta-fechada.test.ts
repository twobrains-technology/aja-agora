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

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NON_REENGAGE_GATES, pendingGateAfterTurn } from "./gate-reengage";
import type { ConversationMetadata } from "./personas";
import {
	GATE_STUCK_ESCAPE_THRESHOLD,
	nextGate,
	registerGateStuckTurn,
	STUCK_ESCAPE_GATES,
} from "./qualify-state";

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

	it("depois do teto, o funil DESISTE da pergunta e segue", () => {
		let meta = noGateDoNome();
		expect(nextGate(meta, SEM_NOME)).toBe("name");

		for (let i = 0; i < GATE_STUCK_ESCAPE_THRESHOLD; i++) {
			const patch = registerGateStuckTurn(meta, "name");
			expect(patch).not.toBeNull();
			meta = { ...meta, ...patch } as ConversationMetadata;
		}

		expect(meta.nomeDispensado).toBe(true);
		// E o funil anda: o próximo passo é o documento, não a mesma pergunta.
		expect(nextGate(meta, SEM_NOME)).toBe("identify");
	});

	it("o escape NÃO inventa um nome", () => {
		let meta = noGateDoNome();
		for (let i = 0; i < GATE_STUCK_ESCAPE_THRESHOLD; i++) {
			meta = { ...meta, ...registerGateStuckTurn(meta, "name") } as ConversationMetadata;
		}
		// Nada em `qualifyAnswers` que pareça um nome, e nenhum campo de nome
		// gravado: desistir da pergunta é diferente de responder por ele.
		expect(JSON.stringify(meta.qualifyAnswers ?? {})).not.toMatch(/nome|name/i);
	});

	it("antes do teto ele ainda insiste — o escape é última saída, não a primeira", () => {
		const meta = noGateDoNome();
		const patch = registerGateStuckTurn(meta, "name");
		expect(patch?.nomeDispensado).toBeUndefined();
		expect(nextGate({ ...meta, ...patch } as ConversationMetadata, SEM_NOME)).toBe("name");
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
	it("recusa + teto de tentativas → `identify`, sem nome inventado", () => {
		let meta = noGateDoNome();

		// Três turnos em que a resposta não é um nome.
		for (let i = 0; i < GATE_STUCK_ESCAPE_THRESHOLD; i++) {
			meta = { ...meta, ...registerGateStuckTurn(meta, "name") } as ConversationMetadata;
		}

		expect(nextGate(meta, SEM_NOME)).toBe("identify");
		// E o funil segue inteiro a partir dali.
		const comIdentidade = { ...meta, identityCollected: true } as ConversationMetadata;
		expect(nextGate(comIdentidade, SEM_NOME)).toBe("search");
	});
});
