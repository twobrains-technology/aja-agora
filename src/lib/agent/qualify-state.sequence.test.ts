import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { decideShowGate, type Gate, nextGate } from "./qualify-state";

// ============================================================================
// Sequência canônica COMPLETA do funil (jornada-canonica.md passo 2 + FIX-53
// + FIX-215/Refino Ata 2026-07-04 + FIX-233/handoff agente-vendas-consorcio,
// 2026-07-09 + FIX-274/remoção do consent, 2026-07-11 + FIX-296/reordena o
// pré-reveal, rodada 10, 2026-07-12). Encadeia nextGate respondendo cada gate
// como o usuário faria, e prova a ORDEM real ponta-a-ponta.
//
// Ordem ATUAL: gate `desire` (não bloqueante) entra logo após o nome; FIX-274
// REMOVEU o gate `consent`. FIX-296 REVERTE conscientemente o FIX-53: `credit`
// (valor do bem) volta pra ANTES do `identify` (CPF+celular) — a palavra nova
// do mockup vence ("rapport antes de dados"); o invariante que não muda é
// identidade SEMPRE antes do `search`. `experience` DESCE pra depois do reveal
// (FIX-233 D2); `timeframe` REINTRODUZ pós-recomendação (D1). FIX-215 moveu
// lance/lance-value/lance-embutido do PRÉ-search pro PÓS-reveal.
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
			case "reco-consent":
				// FIX-308: resolver o gate exige a resposta REAL, não só o dispatch.
				meta = { ...meta, recoConsentDispatched: true, recoConsentAnswered: true };
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

describe("funil — sequência canônica completa (FIX-296 reordena pré-reveal + FIX-215 + FIX-233 + FIX-274 sem consent)", () => {
	it("sem lance: desire→credit→identify→search→experience→timeframe→lance→lance-embutido→simulator-offer→decision", () => {
		const seq = walkFunnel({ hasLance: "no" });
		expect(seq).toEqual([
			"name",
			"desire",
			"credit",
			"identify",
			"search",
			"experience",
			"reco-consent",
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
			"credit",
			"identify",
			"search",
			"experience",
			"reco-consent",
			"timeframe",
			"lance",
			"lance-value",
			"lance-embutido",
			"simulator-offer",
			"decision",
		]);
	});

	it("FIX-274: `consent` NUNCA aparece na sequência", () => {
		expect(walkFunnel({ hasLance: "no" })).not.toContain("consent");
		expect(walkFunnel({ hasLance: "yes" })).not.toContain("consent");
	});

	it("INVARIANTE FIX-296/FIX-297/FIX-215/FIX-233: credit < identify < search < experience < reco-consent < timeframe < lance", () => {
		const seq = walkFunnel({ hasLance: "no" });
		const idx = (g: Gate) => seq.indexOf(g);
		// FIX-296 (reversão consciente do FIX-53): valor antes da identidade
		expect(idx("credit")).toBeLessThan(idx("identify"));
		// identidade SEMPRE antes da busca/reveal — invariante que não mudou
		expect(idx("identify")).toBeLessThan(idx("search"));
		// FIX-233 (D2): experience roda DEPOIS do reveal, não antes
		expect(idx("search")).toBeLessThan(idx("experience"));
		// FIX-297: reco-consent entra entre experience e timeframe
		expect(idx("experience")).toBeLessThan(idx("reco-consent"));
		expect(idx("reco-consent")).toBeLessThan(idx("timeframe"));
		expect(idx("timeframe")).toBeLessThan(idx("lance"));
	});
});

describe("FIX-233/FIX-274 — gate `desire` não bloqueia", () => {
	it("usuário pula (nunca preenche desiredItem/motivation) → funil segue direto pro credit (sem consent, FIX-296)", () => {
		const meta: ConversationMetadata = { desireAsked: true };
		expect(nextGate(meta, { hasContactName: true })).toBe("credit");
	});

	it("sem desireAsked, é o próximo gate logo após o nome", () => {
		expect(nextGate({}, { hasContactName: true })).toBe("desire");
	});
});

describe("FIX-233 — 3ª saída do gate lance ('só a parcela') pula lance-value/lance-embutido/simulator-offer", () => {
	const postReveal = (over: Partial<ConversationMetadata> = {}): ConversationMetadata => ({
		desireAsked: true,
		currentCategory: "auto",
		identityCollected: true,
		experiencePrev: "first",
		// FIX-314: hero/reco-consent viram universais — fixture pós-hero (a 3ª
		// saída do lance só faz sentido depois do reco-consent já resolvido).
		recoConsentAnswered: true,
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

describe("FIX-233/FIX-274 — lead que responde tudo numa frase não vê cards redundantes", () => {
	// "Quero um Corolla de uns 120 mil" — o analyzer extrai credit (e potencialmente
	// desiredItem) NUM turno só, ANTES de qualquer card. O funil não pode re-exibir
	// os gates cujo dado já veio por texto livre — nextGate PULA direto pra frente.
	it("credit já preenchido por texto livre → nextGate pula direto pro identify (nunca credit de novo)", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			qualifyAnswers: { creditMax: 120_000 },
		};
		const gate = nextGate(meta, { hasContactName: true });
		expect(gate).toBe("identify");
		expect(gate).not.toBe("credit");
	});

	it("desire+identify+credit todos resolvidos num só turno → nextGate vai direto pra search", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			identityCollected: true,
			qualifyAnswers: { creditMax: 120_000 },
		};
		const gate = nextGate(meta, { hasContactName: true });
		expect(gate).toBe("search");
		expect(["desire", "consent", "identify", "credit"]).not.toContain(gate);
	});

	it("decideShowGate libera normalmente o próximo gate real (search)", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			identityCollected: true,
			qualifyAnswers: { creditMax: 120_000 },
		};
		expect(
			decideShowGate({ gate: "search", intent: "providing_info", meta, isUserTurn: true }),
		).toBe(true);
	});
});
