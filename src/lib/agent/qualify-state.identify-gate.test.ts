import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { decideShowGate, nextGate } from "./qualify-state";

// Gate "identify" — D1 (docs/jornada/CONTEXT.md): a Bevi exige CPF+celular+LGPD
// ANTES de simular (isso NUNCA mudou — é o invariante real). FIX-296 (rodada
// 10, 2026-07-12) REVERTE conscientemente a POSIÇÃO relativa ao `credit` que o
// FIX-53 havia fixado ("dados antes do valor"): agora o `credit` (valor) vem
// ANTES do `identify`, fiel ao mockup novo ("valor antes dos dados"). A busca
// real continua exigindo identidade (tripwire) — só a ordem de coleta mudou.

// FIX-215 (Ata 2026-07-04): busca/reveal já ocorrem DIRETO após a identidade,
// sem lance como pré-requisito — "qualificação completa" pré-reveal é só
// valor + identidade. hasLance/lanceEmbutido não entram mais aqui (pós-reveal).
const qualifiedBase: ConversationMetadata = {
	desireAsked: true,
	experiencePrev: "first",
	qualifyConsented: true,
	identityCollected: true,
	qualifyAnswers: { creditMax: 80_000, prazoMeses: 12 },
};

// Estado pós-reveal com a conversa de lance JÁ resolvida (lance=no) — usado
// pelos testes que verificam o funil DEPOIS do reveal (simulator-offer/decision).
const postRevealResolved: ConversationMetadata = {
	...qualifiedBase,
	searchDispatched: true,
	revealCompleted: true,
	// FIX-297/FIX-308: reco-consent precisa estar RESPONDIDO pra nextGate
	// cruzar até timeframe/lance/decision (senão fica preso em "reco-consent").
	recoConsentDispatched: true,
	recoConsentAnswered: true,
	qualifyAnswers: { ...qualifiedBase.qualifyAnswers, hasLance: "no", lanceEmbutido: false },
};

describe("nextGate — credit vem ANTES do identify (FIX-296, reversão do FIX-53)", () => {
	it("consent dado, SEM valor nem identidade → credit (antes da identidade)", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			experiencePrev: "first",
			qualifyConsented: true,
		};
		expect(nextGate(meta)).toBe("credit");
	});

	it("valor já dado, sem identidade → identify (identidade segue obrigatória antes do search)", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			experiencePrev: "first",
			qualifyConsented: true,
			qualifyAnswers: { creditMax: 80_000, prazoMeses: 12 },
		};
		expect(nextGate(meta)).toBe("identify");
	});

	it("COM identidade + valor, SEM busca ainda → search (descoberta liberada DIRETO, sem lance)", () => {
		expect(nextGate(qualifiedBase)).toBe("search");
	});

	it("COM identidade, valor já coletado → segue search (NÃO pede lance antes; FIX-215/FIX-103)", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			experiencePrev: "first",
			qualifyConsented: true,
			identityCollected: true,
			qualifyAnswers: { creditMax: 80_000 },
		};
		expect(nextGate(meta)).toBe("search");
	});

	it("FIX-215: pós-reveal, lance=yes SEM lance-embutido respondido → lance-embutido", () => {
		const meta: ConversationMetadata = {
			...postRevealResolved,
			// lanceValue já respondido (gate lance-value tem suite própria)
			qualifyAnswers: {
				...postRevealResolved.qualifyAnswers,
				hasLance: "yes",
				lanceValue: 30_000,
				// sobrepõe o lanceEmbutido:false da base — aqui queremos SEM resposta
				lanceEmbutido: undefined,
			},
		};
		expect(nextGate(meta)).toBe("lance-embutido");
	});

	it("FIX-215: pré-reveal (revealCompleted ausente) NUNCA pede lance, mesmo com hasLance indefinido", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			experiencePrev: "first",
			qualifyConsented: true,
			identityCollected: true,
			qualifyAnswers: { creditMax: 80_000 },
		};
		expect(nextGate(meta)).not.toBe("lance");
		expect(nextGate(meta)).not.toBe("lance-value");
		expect(nextGate(meta)).not.toBe("lance-embutido");
	});

	it("fluxo pós-busca não regride: search dispatched + reveal + lance resolvido → decision", () => {
		const meta: ConversationMetadata = {
			...postRevealResolved,
			simulatorOfferDispatched: true,
		};
		expect(nextGate(meta)).toBe("decision");
	});
});

describe("decideShowGate — identify", () => {
	it("server-authored turn sempre mostra o gate", () => {
		expect(
			decideShowGate({
				gate: "identify",
				intent: "neutral",
				meta: qualifiedBase,
				isUserTurn: false,
			}),
		).toBe(true);
	});

	it("usuário colaborando (providing_info/ready) mostra", () => {
		expect(
			decideShowGate({
				gate: "identify",
				intent: "providing_info",
				meta: qualifiedBase,
				isUserTurn: true,
			}),
		).toBe(true);
		expect(
			decideShowGate({
				gate: "identify",
				intent: "ready_to_proceed",
				meta: qualifiedBase,
				isUserTurn: true,
			}),
		).toBe(true);
	});

	it("usuário perguntando/duvidando NÃO interrompe com o form", () => {
		expect(
			decideShowGate({
				gate: "identify",
				intent: "asking_question",
				meta: qualifiedBase,
				isUserTurn: true,
			}),
		).toBe(false);
		expect(
			decideShowGate({
				gate: "identify",
				intent: "expressing_doubt",
				meta: qualifiedBase,
				isUserTurn: true,
			}),
		).toBe(false);
	});
});
