import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { shouldEmitWhatsappOptin } from "./whatsapp-optin-guard";

// BUG-OPTIN-ENGOLE-GATES (2026-06-04, E2E real, achado 1): no turno de "Sim,
// tenho reserva" o agente disparou present_whatsapp_optin por conta própria —
// o artifact ativou o guard anti-atropelo e SUPRIMIU os gates lance-value/
// lance-embutido/identify (o funil do docx morria ali, intermitente). A regra
// de produto sempre foi "optin APÓS apresentar a recomendação" — agora é
// DETERMINÍSTICA: pré-reveal o optin é suprimido, não importa o que o modelo
// alucine. Pós-reveal vale o dedupe PF-07 de sempre.
//
// Todos os testes deste bloco/dos dois seguintes exercitam o canal WEB
// (único canal onde o optin pode legitimamente emitir) — FIX-338 abaixo cobre
// o canal WhatsApp separadamente.

describe("shouldEmitWhatsappOptin — pré-reveal NUNCA (BUG-OPTIN-ENGOLE-GATES)", () => {
	it("NÃO emite durante a qualificação (revealCompleted ausente)", () => {
		expect(shouldEmitWhatsappOptin({}, "web")).toBe(false);
		expect(
			shouldEmitWhatsappOptin(
				{
					qualifyAnswers: { hasLance: "yes" },
				} as ConversationMetadata,
				"web",
			),
		).toBe(false);
	});

	it("NÃO emite com revealCompleted=false explícito", () => {
		expect(shouldEmitWhatsappOptin({ revealCompleted: false }, "web")).toBe(false);
	});

	it("emite no FECHO, quando reveal+contractFormDispatched e ainda não mostrado", () => {
		expect(
			shouldEmitWhatsappOptin({ revealCompleted: true, contractFormDispatched: true }, "web"),
		).toBe(true);
		expect(
			shouldEmitWhatsappOptin(
				{
					revealCompleted: true,
					contractFormDispatched: true,
					whatsappOptinShown: false,
				},
				"web",
			),
		).toBe(true);
	});
});

// FIX-303 (rodada r10 onda 2, 2026-07-12): "Continua o WhatsApp... Anotei seu
// WhatsApp" aparecia logo após o reveal, sem o usuário ter pedido e ANTES de
// qualquer proposta apresentada. A regra de produto é "optin no FECHO" (depois
// do present_contract_form, passo 5) — revealCompleted sozinho não basta mais.
describe("shouldEmitWhatsappOptin — FIX-303 só no FECHO (pós-proposta), nunca só pós-reveal", () => {
	it("NÃO emite com revealCompleted=true mas SEM contractFormDispatched (bug original)", () => {
		expect(shouldEmitWhatsappOptin({ revealCompleted: true }, "web")).toBe(false);
		expect(
			shouldEmitWhatsappOptin({ revealCompleted: true, contractFormDispatched: false }, "web"),
		).toBe(false);
	});

	it("NÃO emite com contractFormDispatched=true mas SEM revealCompleted (ordem inválida)", () => {
		expect(
			shouldEmitWhatsappOptin({ revealCompleted: false, contractFormDispatched: true }, "web"),
		).toBe(false);
	});
});

describe("shouldEmitWhatsappOptin — PF-07 guard de duplicação (pós-fecho)", () => {
	it("NÃO emite quando meta.whatsappOptinShown é true", () => {
		const meta: ConversationMetadata = {
			revealCompleted: true,
			contractFormDispatched: true,
			whatsappOptinShown: true,
		};
		expect(shouldEmitWhatsappOptin(meta, "web")).toBe(false);
	});

	it("NÃO emite mesmo se user já recusou (declined → shown=true)", () => {
		const meta: ConversationMetadata = {
			revealCompleted: true,
			contractFormDispatched: true,
			whatsappOptinShown: true,
			whatsappOptinDeclined: true,
		};
		expect(shouldEmitWhatsappOptin(meta, "web")).toBe(false);
	});
});

// FIX-338 (bloco-c-whatsapp-invariantes) — o opt-in pede "seu WhatsApp" pra
// continuar o atendimento; no canal WhatsApp isso é um absurdo de contexto
// (o número JÁ é conhecido, é o próprio waId). Dossiê rodada 1: "me
// compartilha seu WhatsApp?" seguido, no MESMO turno, de "já que você está no
// WhatsApp...". `shouldEmitWhatsappOptin` não checava `channel` em nenhum
// ponto — agora é o PRIMEIRO guard, antes de qualquer outra condição.
describe("shouldEmitWhatsappOptin — FIX-338 canal whatsapp NUNCA emite", () => {
	it("canal whatsapp → sempre false, mesmo com todas as outras condições satisfeitas", () => {
		expect(
			shouldEmitWhatsappOptin({ revealCompleted: true, contractFormDispatched: true }, "whatsapp"),
		).toBe(false);
	});

	it("canal whatsapp → false mesmo pré-reveal (a checagem de canal vem antes de tudo)", () => {
		expect(shouldEmitWhatsappOptin({}, "whatsapp")).toBe(false);
	});

	it("mesmo meta, só o canal muda: web emite, whatsapp não", () => {
		const meta: ConversationMetadata = { revealCompleted: true, contractFormDispatched: true };
		expect(shouldEmitWhatsappOptin(meta, "web")).toBe(true);
		expect(shouldEmitWhatsappOptin(meta, "whatsapp")).toBe(false);
	});
});
