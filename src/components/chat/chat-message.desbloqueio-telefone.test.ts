// @vitest-environment happy-dom
/**
 * FIX-395 — variante B no RENDER: a comparação não aparece antes do telefone.
 *
 * Regressão exigida pelo card: "sem telefone conhecido ⇒ o passo aparece antes
 * da comparação e a comparação só é liberada depois de um telefone válido".
 *
 * O servidor já segura o reveal no stream quando o estado é `pede-antes`, mas os
 * cards foram PERSISTIDOS (é o que permite re-emiti-los depois). Na retomada /
 * histórico, eles voltariam a aparecer — esta é a segunda linha, e é ela que
 * este teste trava.
 */

import { describe, expect, it } from "vitest";
import { CARDS_QUE_REVELAM_OFERTA } from "@/lib/chat/desbloqueio-do-telefone";
import { comDesbloqueioDoTelefone, type RenderablePart } from "./chat-message";

const artefato = (type: string, payload: Record<string, unknown> = {}): RenderablePart => ({
	kind: "artifact",
	id: `p-${type}`,
	// @ts-expect-error — o union de artifacts é amplo; aqui só importa o type/payload
	artifact: { id: `p-${type}`, type, payload },
});

const telefone = (estado: "pede-antes" | "borrado"): RenderablePart =>
	artefato("telefone_do_desbloqueio", { variante: "A", estado });

describe("comDesbloqueioDoTelefone (FIX-395)", () => {
	it("variante B (pede-antes) ⇒ a comparação sai do render", () => {
		const parts = [
			telefone("pede-antes"),
			artefato("comparison_table"),
			artefato("recommendation_card"),
		];
		const saida = comDesbloqueioDoTelefone(parts);
		expect(saida.some((p) => p.kind === "artifact" && p.artifact.type === "comparison_table")).toBe(
			false,
		);
		expect(
			saida.some((p) => p.kind === "artifact" && p.artifact.type === "recommendation_card"),
		).toBe(false);
		// o passo do telefone CONTINUA na tela — é ele que ocupa o lugar
		expect(
			saida.some((p) => p.kind === "artifact" && p.artifact.type === "telefone_do_desbloqueio"),
		).toBe(true);
	});

	it("variante C (borrado) ⇒ a comparação aparece (borrada é render, não remoção)", () => {
		const parts = [
			telefone("borrado"),
			artefato("comparison_table"),
			artefato("recommendation_card"),
		];
		const saida = comDesbloqueioDoTelefone(parts);
		expect(saida).toHaveLength(3);
	});

	it("sem card de telefone ⇒ nada muda (caminho de quem já deu o número)", () => {
		const parts = [artefato("comparison_table"), artefato("recommendation_card")];
		expect(comDesbloqueioDoTelefone(parts)).toHaveLength(2);
	});

	it("não engole outros cards (o card do telefone não esconde o resto)", () => {
		const parts = [telefone("pede-antes"), artefato("contemplation_dial"), artefato("two_paths")];
		const saida = comDesbloqueioDoTelefone(parts);
		expect(saida.filter((p) => p.kind === "artifact")).toHaveLength(3);
	});
});

// FIX-433 (D2) — a segunda linha do cliente usa a MESMA lista do servidor
// (`CARDS_QUE_REVELAM_OFERTA`), e ela cobre os 6 cards que revelam número de
// oferta. Antes a lista local só tinha `comparison_table`/`recommendation_card`,
// e `simulation_result`/`group_card` passavam legíveis no braço A.
describe("comDesbloqueioDoTelefone — cobre TODO card de oferta (FIX-433)", () => {
	it("a lista única tem os 6 tipos que revelam oferta", () => {
		expect([...CARDS_QUE_REVELAM_OFERTA].sort()).toEqual(
			[
				"comparison_table",
				"financing_comparison",
				"group_card",
				"recommendation_card",
				"scenarios",
				"simulation_result",
			].sort(),
		);
	});

	it("braço A ⇒ os 6 saem do render", () => {
		for (const tipo of CARDS_QUE_REVELAM_OFERTA) {
			const saida = comDesbloqueioDoTelefone([telefone("pede-antes"), artefato(tipo)]);
			expect(saida.some((p) => p.kind === "artifact" && p.artifact.type === tipo)).toBe(false);
		}
	});

	it("braço B ⇒ os 6 ganham a marca `embacada` (não somem da tela)", () => {
		for (const tipo of CARDS_QUE_REVELAM_OFERTA) {
			const saida = comDesbloqueioDoTelefone([telefone("borrado"), artefato(tipo)]);
			const card = saida.find((p) => p.kind === "artifact" && p.artifact.type === tipo);
			expect(card).toBeDefined();
			expect(card && card.kind === "artifact" ? card.embacada : false).toBe(true);
		}
	});
});
