// Camada 1 (structural) — FIX-43: raias do funil + máquina forward-only.
//
// Síntese aprovada (proposta-funil-contatos-retorno.md Parte 2, decisão D1 do
// diário /to-saindo): o antigo `fechado_ganho` único vira 3 raias finais
// (na_administradora → aguardando_pagamento → fechado_ganho) refletindo a mesa
// manual + boleto, alimentadas por polling (FIX-44). `perdido` é terminal.

import { describe, expect, it } from "vitest";
import { leadStageEnum } from "@/db/schema";
import { STAGE_ORDER } from "./lead-stages";

const EXPECTED_ORDER = [
	"novo",
	"engajado",
	"qualificado",
	"em_negociacao",
	"proposta_enviada",
	"na_administradora",
	"aguardando_pagamento",
	"fechado_ganho",
	"perdido",
] as const;

describe("FIX-43 — STAGE_ORDER", () => {
	it("contém todas as 8 raias + perdido, na ordem da proposta", () => {
		expect([...STAGE_ORDER]).toEqual([...EXPECTED_ORDER]);
	});

	it("é monotônico (índices estritamente crescentes, sem duplicata)", () => {
		const idxs = STAGE_ORDER.map((s) => STAGE_ORDER.indexOf(s));
		expect(idxs).toEqual(idxs.map((_, i) => i));
		expect(new Set(STAGE_ORDER).size).toBe(STAGE_ORDER.length);
	});

	it("split do fechamento: na_administradora < aguardando_pagamento < fechado_ganho", () => {
		expect(STAGE_ORDER.indexOf("na_administradora")).toBeLessThan(
			STAGE_ORDER.indexOf("aguardando_pagamento"),
		);
		expect(STAGE_ORDER.indexOf("aguardando_pagamento")).toBeLessThan(
			STAGE_ORDER.indexOf("fechado_ganho"),
		);
	});
});

describe("FIX-43 — enum lead_stage no schema", () => {
	it("o enum do banco bate exatamente com STAGE_ORDER", () => {
		// drizzle pgEnum expõe os valores em `.enumValues`.
		expect([...leadStageEnum.enumValues].sort()).toEqual([...EXPECTED_ORDER].sort());
	});
});
