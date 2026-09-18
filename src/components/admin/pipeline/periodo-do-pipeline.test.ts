import { describe, expect, it } from "vitest";
import { COOKIE_DO_PERIODO, diaComoData, serializarPeriodoDoCookie } from "@/lib/admin/periodo";
import { periodoEfetivoDoPipeline } from "./periodo-do-pipeline";

const HOJE = diaComoData("2026-08-19");
const INICIO = diaComoData("2026-08-18");

function cookie(de: string, ate: string): string {
	return `${COOKIE_DO_PERIODO}=${serializarPeriodoDoCookie(diaComoData(de), diaComoData(ate))}`;
}

describe("periodoEfetivoDoPipeline", () => {
	it("a URL vence o cookie quando as duas pontas vieram no link", () => {
		const efetivo = periodoEfetivoDoPipeline(
			diaComoData("2026-07-21"),
			diaComoData("2026-07-27"),
			cookie("2026-08-01", "2026-08-10"),
			HOJE,
		);

		expect(efetivo.de).toEqual(diaComoData("2026-07-21"));
		expect(efetivo.ate).toEqual(diaComoData("2026-07-27"));
	});

	it("sem URL, respeita o cookie salvo", () => {
		const efetivo = periodoEfetivoDoPipeline(null, null, cookie("2026-08-01", "2026-08-10"), HOJE);

		expect(efetivo.de).toEqual(diaComoData("2026-08-01"));
		expect(efetivo.ate).toEqual(diaComoData("2026-08-10"));
	});

	it('sem URL nem cookie, abre "Desde o início" — não em hoje', () => {
		const efetivo = periodoEfetivoDoPipeline(null, null, null, HOJE);

		expect(efetivo.de).toEqual(INICIO);
		expect(efetivo.ate).toEqual(HOJE);
		// O Kanban não pode abrir com a janela de um dia só: vazio se lê como erro.
		expect(efetivo.de).not.toEqual(HOJE);
	});

	it("cookie malformado cai no mesmo chão do quadro inteiro", () => {
		const efetivo = periodoEfetivoDoPipeline(null, null, `${COOKIE_DO_PERIODO}=lixo`, HOJE);

		expect(efetivo.de).toEqual(INICIO);
		expect(efetivo.ate).toEqual(HOJE);
	});

	it("só uma ponta na URL não apaga a outra do cookie", () => {
		const efetivo = periodoEfetivoDoPipeline(
			diaComoData("2026-08-05"),
			null,
			cookie("2026-08-01", "2026-08-10"),
			HOJE,
		);

		expect(efetivo.de).toEqual(diaComoData("2026-08-05"));
		expect(efetivo.ate).toEqual(diaComoData("2026-08-10"));
	});
});
