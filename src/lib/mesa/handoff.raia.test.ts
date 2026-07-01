// FIX-126 — Camada 1 (structural, roda em test:unit). Congela a Decisão 2 do bloco:
// "em atendimento" é raia NOVA (em_atendimento), posicionada ENTRE na_administradora e
// aguardando_pagamento (não antes — senão o claim regride e forward-only vira no-op); e o
// claim MOVE a raia (transitionLeadStage). Lê o source de produção.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STAGE_ORDER } from "@/lib/admin/lead-stages";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("FIX-126 — claim move a raia (structural)", () => {
	it("claimMesaHandoff transiciona a raia ao assumir (transitionLeadStage)", () => {
		const src = read("src/lib/mesa/handoff.ts");
		expect(src).toContain("claimMesaHandoff");
		expect(src).toContain("transitionLeadStage");
		expect(src).toContain("em_atendimento");
	});

	it("leadStageEnum tem a raia em_atendimento", () => {
		const src = read("src/db/schema.ts");
		expect(src).toContain('"em_atendimento"');
	});

	it("STAGE_ORDER posiciona em_atendimento ENTRE na_administradora e aguardando_pagamento", () => {
		const order = STAGE_ORDER as readonly string[];
		const i = order.indexOf("em_atendimento");
		const admin = order.indexOf("na_administradora");
		const pag = order.indexOf("aguardando_pagamento");
		expect(i).toBeGreaterThan(admin); // depois de na_administradora (não regride no claim)
		expect(i).toBeLessThan(pag); // antes de aguardando_pagamento
	});
});
