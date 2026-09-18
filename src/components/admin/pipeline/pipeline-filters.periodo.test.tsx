// @vitest-environment happy-dom
// @vitest-environment-options { "url": "http://localhost/admin/pipeline" }

// O Pipeline passou a usar o MESMO filtro de período do resto do painel.
//
// Antes ele mantinha o par De/Até próprio (dois dias soltos, sem cookie), então
// a janela escolhida em outra tela não chegava aqui. Agora o período vem do
// `<DateRangeFilter/>`, que escreve URL e cookie; o recorte de data continua
// filtrando os leads no cliente, pelos mesmos `from`/`to` da querystring.

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeriodoProvider } from "@/components/admin/dashboard/periodo-provider";
import { COOKIE_DO_PERIODO } from "@/lib/admin/periodo";
import { PipelineFilters, useLeadFilters } from "./pipeline-filters";

const HOJE = "2026-08-19";
const TRINTA_DIAS_DE = "2026-07-21";

function Harness() {
	const filters = useLeadFilters();
	return <PipelineFilters filters={filters} />;
}

function montar({ veioDoCookie = false }: { veioDoCookie?: boolean } = {}) {
	render(
		<NuqsTestingAdapter hasMemory searchParams="" resetUrlUpdateQueueOnMount={false}>
			<PeriodoProvider
				de={veioDoCookie ? TRINTA_DIAS_DE : HOJE}
				ate={HOJE}
				veioDoCookie={veioDoCookie}
			>
				<Harness />
			</PeriodoProvider>
		</NuqsTestingAdapter>,
	);
}

describe("Pipeline usa o filtro de período compartilhado", () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		vi.setSystemTime(new Date("2026-08-19T18:00:00Z"));
		// biome-ignore lint/suspicious/noDocumentCookie: limpeza do cookie de teste, não é o código de produção.
		document.cookie = `${COOKIE_DO_PERIODO}=; path=/; max-age=0`;
	});

	afterEach(() => {
		cleanup();
		// A URL que o Pipeline hidrata fica num throttle GLOBAL do nuqs; sem
		// esvaziar a fila, o update de um teste é replayado no mount do seguinte e
		// 18/08 vaza por cima do cookie. `runOnlyPendingTimers` emite o pendente
		// antes de descartar o relógio falso.
		vi.runOnlyPendingTimers();
		vi.useRealTimers();
	});

	it("oferece os presets do painel, inclusive 'Desde o início'", () => {
		montar();

		expect(screen.getByRole("button", { name: "30 dias" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Desde o início" })).toBeTruthy();
	});

	it("não tem mais o par De/Até próprio", () => {
		montar();

		expect(screen.queryByRole("button", { name: /^De$/ })).toBeNull();
		expect(screen.queryByRole("button", { name: /^Até$/ })).toBeNull();
	});

	it("reidrata o período do cookie quando o menu navega com href puro", async () => {
		// biome-ignore lint/suspicious/noDocumentCookie: o teste planta o cookie que o componente deve achar.
		document.cookie = `${COOKIE_DO_PERIODO}=${TRINTA_DIAS_DE}_${HOJE}; path=/`;

		montar({ veioDoCookie: false });

		await waitFor(() => expect(screen.getByText("21/07/2026")).toBeTruthy());
		expect(screen.getByRole("button", { name: "30 dias" }).getAttribute("aria-pressed")).toBe(
			"true",
		);
	});

	it('sem URL nem cookie abre "Desde o início" e leva o dia para a URL', async () => {
		montar();

		// 18/08 é o primeiro dia do coletor, não "hoje": o Kanban abrir vazio se lê
		// como tela quebrada. O preset ativo prova que a janela também chegou à URL
		// (é de lá que o chip do cabeçalho a lê).
		await waitFor(() => expect(screen.getByText("18/08/2026")).toBeTruthy());
		// A outra ponta é hoje: 19/08/2026 (o relógio está fixado no `beforeEach`).
		expect(screen.getByText("19/08/2026")).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Desde o início" }).getAttribute("aria-pressed"),
		).toBe("true");
	});
});
