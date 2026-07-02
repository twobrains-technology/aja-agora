// FIX-115 (PROD 2026-06-30) — o gate de valor serve a AGULHA SIMPLES.
//
// Kairo (testando PROD): "isso ai deveria ter aparecido um componente de valor
// SIMPLES". A jornada canônica (§ passo do valor, revisão FIX-104 2026-06-28) diz
// que o componente COMPLEXO ("Planeje sua conquista") saiu e "na web um slider
// simples pode apoiar". Este teste trava o contrato novo: o gate `credit` produz
// a agulha simples (um único campo de VALOR DO BEM em reais), não o picker por
// intenção (term slider + segmented). O valor segue por conversa — a agulha, sem
// onSubmit, manda o valor como TEXTO (integra o backstop parseAssetValue).
import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { gatePartData } from "@/lib/web/adapter";

const metaAuto: ConversationMetadata = { currentCategory: "auto" };

describe("FIX-115 — gate de valor serve a agulha simples (valor do bem)", () => {
	it("gatePartData('credit') é a agulha (kind 'slider'), não o picker por intenção ('plan')", () => {
		const data = gatePartData("credit", metaAuto);
		expect(data?.kind).toBe("slider");
		// não pode voltar a ser o componente complexo por intenção
		expect(data?.kind).not.toBe("plan");
	});

	it("a agulha carrega UM campo de valor do bem em reais (sem prazo/parcela/intenção)", () => {
		const data = gatePartData("credit", metaAuto);
		if (data?.kind !== "slider") throw new Error("credit deveria ser a agulha (slider)");
		expect(data.fields).toHaveLength(1);
		const field = data.fields[0];
		expect(field.id).toBe("credit");
		expect(field.format).toBe("currency");
		expect(field.label).toMatch(/valor do bem/i);
		// campos de prazo/parcela NÃO entram na agulha simples
		expect(data.fields.some((f) => f.format === "months")).toBe(false);
	});

	it("sem categoria não monta card (defensivo — sem faixa de referência)", () => {
		expect(gatePartData("credit", {})).toBeNull();
	});
});
