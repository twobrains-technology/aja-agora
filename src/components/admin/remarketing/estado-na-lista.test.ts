/**
 * FIX-441 (D12b) — a CÉLULA da lista não pode mentir sobre a régua encerrada pela META.
 *
 * O B11 encerra a régua quando a Meta recusa a entrega (131050/131026) com
 * `status=ESGOTADO` + `motivo_saida=recusado_pela_meta`. A célula dizia "Esgotou
 * os 3 toques" — falso, porque não saíram três toques. Aqui a mesma lista de
 * Conversas/Percurso passa a mostrar o FATO (texto + ícone, nunca só cor).
 */

import { describe, expect, it } from "vitest";
import { MOTIVO_SAIDA_META } from "@/lib/remarketing/status-do-toque";
import { estadoNaLista } from "./estado-na-lista";

const AGORA = new Date("2026-09-14T15:00:00Z");

function esgotado(motivoSaida: string | null) {
	return estadoNaLista({
		regua: { status: "ESGOTADO", step: 1, nextTouchAt: null, ultimoToqueEm: null, motivoSaida },
		motivo: null,
		agora: AGORA,
	});
}

describe("FIX-441 — a Meta recusou o toque, e a célula diz isso", () => {
	it("ESGOTADO + recusado_pela_meta mostra a recusa da META, nunca 'Esgotou os 3 toques'", () => {
		const estado = esgotado(MOTIVO_SAIDA_META);
		expect(estado.rotulo).toBe("A Meta recusou a entrega");
		expect(estado.rotulo).not.toBe("Esgotou os 3 toques");
		// Estado nunca só por cor: ícone + texto juntos, com tooltip do fato.
		expect(estado.icone).toBeTruthy();
		expect(estado.tooltip).toContain("Meta");
	});

	it("ESGOTADO sem o motivo da META segue 'Esgotou os 3 toques'", () => {
		expect(esgotado(null).rotulo).toBe("Esgotou os 3 toques");
		expect(esgotado("tres_toques_sem_resposta").rotulo).toBe("Esgotou os 3 toques");
	});
});
