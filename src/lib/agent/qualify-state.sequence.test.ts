import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { decideShowGate, type Gate, nextGate } from "./qualify-state";

// ============================================================================
// Sequência canônica COMPLETA do funil (jornada-canonica.md passo 2 + FIX-53
// + FIX-215/Refino Ata 2026-07-04 + FIX-233/handoff agente-vendas-consorcio,
// 2026-07-09). Encadeia nextGate respondendo cada gate como o usuário faria,
// e prova a ORDEM real ponta-a-ponta — o que faltava: os testes existentes
// cobrem cada transição isolada, não a progressão inteira.
//
// Ordem ATUAL (FIX-233, ADR 2026-07-09-agente-vendas-consorcio.md D1/D2):
// gate `desire` (não bloqueante) entra logo após o nome; `experience` DESCE
// pra depois do reveal; `timeframe` REINTRODUZ pós-recomendação (reverte o
// FIX-103) — ponte pro simulador de contemplação. FIX-53 (revisão 2):
// identidade (CPF+celular) ANTES do valor. FIX-215 moveu lance/lance-value/
// lance-embutido do PRÉ-search (entre credit e search) pro PÓS-reveal.
// ============================================================================

/** Percorre o funil do zero até `decision`, respondendo cada gate. */
function walkFunnel(opts: { hasLance: "yes" | "no" }): Gate[] {
	let meta: ConversationMetadata = {};
	let hasName = false;
	const seq: Gate[] = [];

	for (let i = 0; i < 24; i++) {
		const gate = nextGate(meta, { hasContactName: hasName });
		seq.push(gate);
		const q = meta.qualifyAnswers ?? {};
		switch (gate) {
			case "name":
				hasName = true;
				break;
			case "desire":
				meta = { ...meta, desireAsked: true };
				break;
			case "consent":
				meta = { ...meta, qualifyConsented: true };
				break;
			case "identify":
				meta = { ...meta, identityCollected: true };
				break;
			case "credit":
				meta = { ...meta, qualifyAnswers: { ...q, creditMax: 80_000 } };
				break;
			case "search":
				meta = { ...meta, searchDispatched: true, revealCompleted: true };
				break;
			case "experience":
				meta = { ...meta, experiencePrev: "first" };
				break;
			case "timeframe":
				meta = { ...meta, qualifyAnswers: { ...q, prazoMeses: 6 } };
				break;
			case "lance":
				meta = { ...meta, qualifyAnswers: { ...q, hasLance: opts.hasLance } };
				break;
			case "lance-value":
				meta = { ...meta, qualifyAnswers: { ...q, lanceValue: 8_000 } };
				break;
			case "lance-embutido":
				meta = { ...meta, qualifyAnswers: { ...q, lanceEmbutido: false } };
				break;
			case "simulator-offer":
				meta = { ...meta, simulatorOfferDispatched: true };
				break;
			case "decision":
				return seq; // terminal
			default:
				return seq;
		}
	}
	return seq;
}

describe("funil — sequência canônica completa (docx passo 2 + FIX-53 + FIX-215 + FIX-233)", () => {
	it("sem lance: desire→consent→identify→credit→search→experience→timeframe→lance→lance-embutido→simulator-offer→decision", () => {
		const seq = walkFunnel({ hasLance: "no" });
		expect(seq).toEqual([
			"name",
			"desire",
			"consent",
			"identify",
			"credit",
			"search",
			"experience",
			"timeframe",
			"lance",
			"lance-embutido",
			"simulator-offer",
			"decision",
		]);
	});

	it("com lance: lance-value entra logo após lance, ambos pós-timeframe", () => {
		const seq = walkFunnel({ hasLance: "yes" });
		expect(seq).toEqual([
			"name",
			"desire",
			"consent",
			"identify",
			"credit",
			"search",
			"experience",
			"timeframe",
			"lance",
			"lance-value",
			"lance-embutido",
			"simulator-offer",
			"decision",
		]);
	});

	it("INVARIANTE FIX-53/FIX-215/FIX-233: identify < credit < search < experience < timeframe < lance", () => {
		const seq = walkFunnel({ hasLance: "no" });
		const idx = (g: Gate) => seq.indexOf(g);
		// identidade antes do valor (FIX-53)
		expect(idx("identify")).toBeLessThan(idx("credit"));
		// valor antes da busca/reveal (Ata 2026-07-04: busca direto após o valor)
		expect(idx("credit")).toBeLessThan(idx("search"));
		// FIX-233 (D2): experience roda DEPOIS do reveal, não antes
		expect(idx("search")).toBeLessThan(idx("experience"));
		// FIX-233 (D1): timeframe reintroduzido, pós-experience e antes do lance
		expect(idx("experience")).toBeLessThan(idx("timeframe"));
		expect(idx("timeframe")).toBeLessThan(idx("lance"));
	});
});

describe("FIX-233 — gate `desire` não bloqueia", () => {
	it("usuário pula (nunca preenche desiredItem/motivation) → funil segue normal pro consent", () => {
		const meta: ConversationMetadata = { desireAsked: true };
		expect(nextGate(meta, { hasContactName: true })).toBe("consent");
	});

	it("sem desireAsked, é o próximo gate logo após o nome (antes do consent)", () => {
		expect(nextGate({}, { hasContactName: true })).toBe("desire");
	});
});

describe("FIX-233 — 3ª saída do gate lance ('só a parcela') pula lance-value/lance-embutido/simulator-offer", () => {
	const postReveal = (over: Partial<ConversationMetadata> = {}): ConversationMetadata => ({
		desireAsked: true,
		currentCategory: "auto",
		qualifyConsented: true,
		identityCollected: true,
		experiencePrev: "first",
		qualifyAnswers: { creditMax: 80_000, prazoMeses: 6 },
		searchDispatched: true,
		revealCompleted: true,
		...over,
	});

	it("hasLance='so_parcela' → decision DIRETO (nunca lance-value/lance-embutido/simulator-offer)", () => {
		const meta = postReveal({
			qualifyAnswers: { creditMax: 80_000, prazoMeses: 6, hasLance: "so_parcela" },
		});
		const gate = nextGate(meta, { hasContactName: true });
		expect(gate).toBe("decision");
		expect(gate).not.toBe("lance-value");
		expect(gate).not.toBe("lance-embutido");
		expect(gate).not.toBe("simulator-offer");
	});

	it("hasLance='so_parcela' + decisionDispatched=true → terminal (search, sem re-disparar decision)", () => {
		const meta = postReveal({
			qualifyAnswers: { creditMax: 80_000, prazoMeses: 6, hasLance: "so_parcela" },
			decisionDispatched: true,
		});
		expect(nextGate(meta, { hasContactName: true })).toBe("search");
	});
});

describe("FIX-233 — lead que responde tudo numa frase não vê cards redundantes (decideShowGate)", () => {
	// "Quero um Corolla de uns 120 mil, já fiz consórcio antes" — o analyzer
	// extrai credit + experience (e potencialmente desiredItem) NUM turno só,
	// ANTES de qualquer card ter sido disparado. O funil não pode re-exibir os
	// gates cujo dado já veio por texto livre — nextGate PULA direto pra frente,
	// e decideShowGate só interrompe no PRÓXIMO gate realmente pendente.
	it("credit + experience já preenchidos por texto livre → nextGate pula direto pro identify (nunca credit/experience de novo)", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			qualifyConsented: true,
			qualifyAnswers: { creditMax: 120_000 },
		};
		const gate = nextGate(meta, { hasContactName: true });
		expect(gate).toBe("identify");
		expect(gate).not.toBe("credit");
	});

	it("desire+consent+identify+credit todos resolvidos num só turno → nextGate vai direto pra search, sem re-emitir nenhum gate de coleta", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			qualifyConsented: true,
			identityCollected: true,
			qualifyAnswers: { creditMax: 120_000 },
		};
		const gate = nextGate(meta, { hasContactName: true });
		expect(gate).toBe("search");
		expect(["desire", "consent", "identify", "credit"]).not.toContain(gate);
	});

	it("decideShowGate não reabre gate resolvido: turno de usuário com intent providing_info sobre um dado NOVO não força o card de um gate já satisfeito", () => {
		// O ponto de decideShowGate é decidir SE interrompe com UI no gate atual
		// retornado por nextGate — como nextGate já pulou os gates satisfeitos
		// (provado acima), decideShowGate nunca é chamado pra um gate redundante;
		// aqui confirmamos que ele libera normalmente o PRÓXIMO gate real (search).
		const meta: ConversationMetadata = {
			desireAsked: true,
			qualifyConsented: true,
			identityCollected: true,
			qualifyAnswers: { creditMax: 120_000 },
		};
		expect(
			decideShowGate({ gate: "search", intent: "providing_info", meta, isUserTurn: true }),
		).toBe(true);
	});
});
