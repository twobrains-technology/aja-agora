// @vitest-environment happy-dom
// Guarda da FONTE ÚNICA de rótulos de raia (`lead-stages.ts`).
//
// Este defeito já apareceu duas vezes com nome próprio: FIX-176 no
// `lead-detail-panel` e o mesmo no `contact-detail-panel` — os dois tinham uma
// cópia local de STAGE_LABELS que não conhecia `em_atendimento` (raia nova do
// FIX-126) e cuspiam o enum cru na tela do operador. `lead-stages.ts` nasceu pra
// acabar com isso, mas o `kanban-column` seguiu com a cópia dele até 2026-08-10.
//
// Diferente dos dois FIX acima, este teste NÃO reproduz um defeito visível hoje
// (a cópia estava sincronizada) — ele é a rede que faltava: percorre TODA a
// STAGE_ORDER, de modo que uma raia nova no enum reprove aqui se algum dia o
// componente voltar a manter tabela própria.

import { DragDropContext } from "@hello-pangea/dnd";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { STAGE_LABELS, STAGE_ORDER } from "@/lib/admin/lead-stages";
import { KanbanColumn } from "./kanban-column";

afterEach(cleanup);

function renderColumn(stage: string) {
	return render(
		<DragDropContext onDragEnd={() => {}}>
			<KanbanColumn stage={stage} leads={[]} />
		</DragDropContext>,
	);
}

describe("cabeçalho da coluna do kanban", () => {
	it.each(STAGE_ORDER)("raia '%s' aparece rotulada, nunca com o enum cru", (stage) => {
		renderColumn(stage);

		expect(screen.getByText(STAGE_LABELS[stage])).toBeDefined();
		// O enum só pode aparecer se por acaso for igual ao rótulo (nenhum é).
		if (STAGE_LABELS[stage] !== stage) {
			expect(screen.queryByText(stage)).toBeNull();
		}
	});

	it("raia desconhecida não quebra a tela — cai no próprio identificador", () => {
		renderColumn("raia_que_ainda_nao_existe");

		expect(screen.getByText("raia_que_ainda_nao_existe")).toBeDefined();
	});
});
