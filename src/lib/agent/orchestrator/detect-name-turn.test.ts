import { describe, expect, it } from "vitest";
import { isLikelyNameResponse } from "./detect-name-turn";

/**
 * Camada 1 — unit puro do detector de "user respondeu com nome".
 *
 * Esse detector é o gate do NÍVEL 1 do fix BUG-SHORT-GREETING-NO-TOOL:
 * quando true, o orchestrator força `toolChoice: { type: 'tool',
 * toolName: 'save_contact_name' }` pro streamText. Tem que ser preciso —
 * falso positivo força tool em mensagem que não é nome (UX quebra),
 * falso negativo deixa o bug passar.
 */

describe("isLikelyNameResponse — happy paths (DEVE retornar true)", () => {
	const previousAsk =
		"Boa, carro novo abre muitas portas! Aqui é a Helena, antes de eu te ajudar a achar a opção certa, como posso te chamar?";

	it("nome único, ≤4 palavras, sem contactName, com pergunta de nome no turn anterior", () => {
		expect(
			isLikelyNameResponse({
				previousAssistantText: previousAsk,
				currentUserText: "Paulo",
				conversationContactName: null,
			}),
		).toBe(true);
	});

	it("nome com acentos (Mônica)", () => {
		expect(
			isLikelyNameResponse({
				previousAssistantText: previousAsk,
				currentUserText: "Mônica",
				conversationContactName: null,
			}),
		).toBe(true);
	});

	it("nome composto curto (Marina Magalhães)", () => {
		expect(
			isLikelyNameResponse({
				previousAssistantText: previousAsk,
				currentUserText: "Marina Magalhães",
				conversationContactName: null,
			}),
		).toBe(true);
	});

	it("frase curta 'Pode me chamar de Marina' (≤4 palavras)", () => {
		// "Pode" "me" "chamar" "de" "Marina" = 5 palavras → reprovado.
		// Mas "Me chamo Marina" = 3 palavras, passa.
		expect(
			isLikelyNameResponse({
				previousAssistantText: previousAsk,
				currentUserText: "Me chamo Marina",
				conversationContactName: null,
			}),
		).toBe(true);
	});

	it("variação de pergunta no turno anterior ('qual seu nome?')", () => {
		expect(
			isLikelyNameResponse({
				previousAssistantText: "Antes de prosseguir, qual seu nome?",
				currentUserText: "Kairo",
				conversationContactName: null,
			}),
		).toBe(true);
	});

	it("variação 'como se chama?'", () => {
		expect(
			isLikelyNameResponse({
				previousAssistantText: "Boa! Como você se chama?",
				currentUserText: "Alan",
				conversationContactName: null,
			}),
		).toBe(true);
	});

	it("nome com apóstrofo (D'Avila)", () => {
		expect(
			isLikelyNameResponse({
				previousAssistantText: previousAsk,
				currentUserText: "D'Avila",
				conversationContactName: null,
			}),
		).toBe(true);
	});

	it("nome com hífen (Maria-Clara)", () => {
		expect(
			isLikelyNameResponse({
				previousAssistantText: previousAsk,
				currentUserText: "Maria-Clara",
				conversationContactName: null,
			}),
		).toBe(true);
	});
});

describe("isLikelyNameResponse — bloqueios corretos (DEVE retornar false)", () => {
	const previousAsk = "Como posso te chamar?";

	it("contactName já capturado — NÃO força (evita re-chamar tool idempotente)", () => {
		expect(
			isLikelyNameResponse({
				previousAssistantText: previousAsk,
				currentUserText: "Paulo",
				conversationContactName: "Paulo",
			}),
		).toBe(false);
	});

	it("turn anterior NÃO perguntou nome (ex: perguntou sobre objetivo) — NÃO força", () => {
		expect(
			isLikelyNameResponse({
				previousAssistantText: "O que você quer comprar?",
				currentUserText: "Paulo",
				conversationContactName: null,
			}),
		).toBe(false);
	});

	it("user disse algo que não parece nome (frase de objetivo) — NÃO força mesmo com pergunta anterior", () => {
		expect(
			isLikelyNameResponse({
				previousAssistantText: previousAsk,
				currentUserText: "Quero comprar carro",
				conversationContactName: null,
			}),
		).toBe(false);
	});

	it("user mandou mais de 4 palavras — NÃO força (frase longa, provavelmente não é só nome)", () => {
		expect(
			isLikelyNameResponse({
				previousAssistantText: previousAsk,
				currentUserText: "Pode me chamar de Marina, prazer",
				conversationContactName: null,
			}),
		).toBe(false);
	});

	it("user mandou string vazia — NÃO força", () => {
		expect(
			isLikelyNameResponse({
				previousAssistantText: previousAsk,
				currentUserText: "",
				conversationContactName: null,
			}),
		).toBe(false);
	});

	it("user mandou string longa (>50 chars) — NÃO força", () => {
		expect(
			isLikelyNameResponse({
				previousAssistantText: previousAsk,
				currentUserText: "Eu sou alguém com um nome muito muito longo de verdade",
				conversationContactName: null,
			}),
		).toBe(false);
	});

	it("user mandou número (e.g. CPF colado) — NÃO força", () => {
		expect(
			isLikelyNameResponse({
				previousAssistantText: previousAsk,
				currentUserText: "12345678901",
				conversationContactName: null,
			}),
		).toBe(false);
	});

	it("user mandou com símbolo (e.g. URL/email) — NÃO força", () => {
		expect(
			isLikelyNameResponse({
				previousAssistantText: previousAsk,
				currentUserText: "paulo@gmail.com",
				conversationContactName: null,
			}),
		).toBe(false);
	});

	it("previousAssistantText undefined (primeiro turn) — NÃO força (sem âncora)", () => {
		expect(
			isLikelyNameResponse({
				previousAssistantText: undefined,
				currentUserText: "Paulo",
				conversationContactName: null,
			}),
		).toBe(false);
	});
});
