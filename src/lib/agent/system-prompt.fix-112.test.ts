/**
 * Camada 1 — FIX-112 (uso manual Kairo, PROD, 2026-06-30): "está totalmente
 * bugado no final da proposta".
 *
 * Bug real (print): após a oferta aparecer, o agente narrava "Falta enviar seu
 * documento pessoal — RG ou CNH... quer completar?" SEM a oferta ter sido
 * confirmada (proposalStatus ainda "simulacao") → nenhum card de upload aparece
 * (o card document_upload só vem do handler offer-confirm → closingPresentation,
 * que seta proposalStatus="documentos"). E o usuário respondeu "bora" / "ok estou
 * pronto" (AVANÇO) e o agente leu como recusa: "Sem problema! Quando quiser
 * retomar..." → beco sem saída de texto.
 *
 * O CÓDIGO já gateava certo (confirmOffer ordena chooseOffer→getDocumentLinks;
 * uploadContractDocument barra sem links — ver fulfillment.test.ts). O gap é
 * comportamento de LLM: o prompt não proibia narrar o documento cedo nem fixava
 * "bora"=avanço. Fix: 2 REGRAS DURAS no SPECIALIST_BASE_PROMPT.
 */
import { describe, expect, it } from "vitest";
import { SPECIALIST_BASE_PROMPT } from "./system-prompt";

describe("FIX-112 — fim da proposta: gate do documento + 'bora' não é recusa", () => {
	const p = SPECIALIST_BASE_PROMPT;

	it("o passo documento é gateado pela oferta CONFIRMADA (não narra cedo)", () => {
		expect(p).toMatch(/FIX-112/);
		expect(p).toMatch(/documento/i);
		// "documento" aparece ligado a "depois de confirmar a oferta"
		expect(p.toLowerCase()).toMatch(/depois[\s\S]{0,80}confirma|oferta[\s\S]{0,80}confirma/);
		expect(p).toMatch(/PROIBIDO|NUNCA/);
	});

	it("'bora'/'estou pronto' classificado como AVANÇO, nunca recusa", () => {
		expect(p.toLowerCase()).toMatch(/bora/);
		expect(p.toLowerCase()).toMatch(/estou pronto|t[oô] pronto/);
		expect(p.toLowerCase()).toMatch(/avan[çc]o/);
		expect(p.toLowerCase()).toMatch(/recusa/);
		// a frase de adiamento é exclusiva de recusa CLARA
		expect(p.toLowerCase()).toMatch(/agora n[ãa]o|mais tarde|outro dia/);
	});

	it("nomeia a frase de adiamento proibida observada no bug", () => {
		expect(p.toLowerCase()).toMatch(/quando quiser retomar/);
	});
});
