// @vitest-environment happy-dom
// @vitest-environment-options { "url": "http://localhost/admin/performance" }

// O chip é a leitura em uma linha do período em vigor.
//
// Dois defeitos que ele existe para impedir: (1) o operador não ter onde conferir
// qual janela está vendo quando o período atravessa a navegação; (2) uma tela que
// IGNORA o período parecer recortada como as outras — por isso ela diz "Sem
// filtro de período" em vez de esconder o chip.

import { cleanup, render, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChipDePeriodo } from "./chip-de-periodo";
import { PeriodoProvider } from "./periodo-provider";

const { usePathnameMock } = vi.hoisted(() => ({
	usePathnameMock: vi.fn(() => "/admin/performance"),
}));

vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

const HOJE = "2026-08-19";
const TRINTA_DIAS_DE = "2026-07-21";

function montar(searchParams = "") {
	render(
		<NuqsTestingAdapter searchParams={searchParams} hasMemory>
			<PeriodoProvider de={HOJE} ate={HOJE}>
				<ChipDePeriodo />
			</PeriodoProvider>
		</NuqsTestingAdapter>,
	);
}

describe("o chip de período", () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		vi.setSystemTime(new Date("2026-08-19T18:00:00Z"));
		usePathnameMock.mockReturnValue("/admin/performance");
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	it("lê a janela da URL e nomeia o preset ativo", () => {
		montar(`?from=${TRINTA_DIAS_DE}&to=${HOJE}`);

		expect(screen.getByText(/21\/07 – 19\/08/)).toBeTruthy();
		expect(screen.getByText(/30 dias/)).toBeTruthy();
	});

	it("mostra o preset por extenso quando o intervalo casa com um", () => {
		montar("?from=2026-08-18&to=2026-08-19");

		expect(screen.getByText(/Desde o início/)).toBeTruthy();
	});

	it("numa tela que ignora o período, diz 'Sem filtro de período'", () => {
		usePathnameMock.mockReturnValue("/admin/attendants");
		montar(`?from=${TRINTA_DIAS_DE}&to=${HOJE}`);

		expect(screen.getByText("Sem filtro de período")).toBeTruthy();
	});

	it("reconhece a tela de Conversas como recortada por período", () => {
		usePathnameMock.mockReturnValue("/admin/conversations");
		montar(`?from=${TRINTA_DIAS_DE}&to=${HOJE}`);

		expect(screen.queryByText("Sem filtro de período")).toBeNull();
		expect(screen.getByText(/21\/07 – 19\/08/)).toBeTruthy();
	});
});
