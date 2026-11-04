import { describe, expect, it } from "vitest";
import {
	adapterDoCatalogo,
	CATALOGO_IDS,
	numerosDoCatalogo,
	ofertasDoCatalogo,
	rotuloDoCatalogo,
} from "./catalogos";
import { FIXTURE_OFFERS } from "./fixture-discovery-adapter";

describe("catálogos do dublê", () => {
	it("padrao devolve FIXTURE_OFFERS sem mudança", () => {
		expect(ofertasDoCatalogo("padrao")).toEqual(FIXTURE_OFFERS);
	});
	it("grande: >4 cartas, ≥4 bancos, quotaIds únicos, faixa 50–120 mil", () => {
		const o = ofertasDoCatalogo("grande");
		expect(o.length).toBeGreaterThan(4);
		expect(new Set(o.map((x) => x.bank)).size).toBeGreaterThanOrEqual(4);
		expect(new Set(o.map((x) => x.quotaId)).size).toBe(o.length);
		expect(new Set(o.map((x) => x.ofertaId)).size).toBe(o.length);
		for (const x of o) {
			expect(x.finalValue).toBeGreaterThanOrEqual(50000);
			expect(x.finalValue).toBeLessThanOrEqual(120000);
		}
	});
	it("canopus-quase-iguais: duas CANOPUS 977/80 mil com parcelas diferentes", () => {
		const o = ofertasDoCatalogo("canopus-quase-iguais").filter(
			(x) => x.bank === "CANOPUS" && x.group === "977" && x.finalValue === 80000,
		);
		expect(o).toHaveLength(2);
		expect(o.every((x) => x.term === 80)).toBe(true);
		expect(o[0]?.installmentValue).not.toBe(o[1]?.installmentValue);
		expect(o.map((x) => x.embeddedVariant).sort()).toEqual(["com", "sem"]);
		expect(new Set(ofertasDoCatalogo("canopus-quase-iguais").map((x) => x.quotaId)).size).toBe(
			ofertasDoCatalogo("canopus-quase-iguais").length,
		);
	});
	it("é determinístico", () => {
		for (const id of CATALOGO_IDS) {
			expect(JSON.stringify(ofertasDoCatalogo(id))).toBe(JSON.stringify(ofertasDoCatalogo(id)));
			expect(rotuloDoCatalogo(id).length).toBeGreaterThan(0);
		}
	});
	it("numerosDoCatalogo sem NaN e com 1012.12 e 1012.4", () => {
		for (const id of CATALOGO_IDS) {
			expect(numerosDoCatalogo(id).every((n) => Number.isFinite(n))).toBe(true);
		}
		const n = numerosDoCatalogo("canopus-quase-iguais");
		expect(n).toContain(1012.12);
		expect(n).toContain(1012.4);
		expect(n).toContain(1012);
	});
	it("adapter do grande devolve mais de 4 grupos", async () => {
		const grupos = await adapterDoCatalogo("grande").searchGroups({
			category: "auto",
			creditMax: 80000,
		});
		expect(grupos.length).toBeGreaterThan(4);
	});
	it("adapter do canopus-quase-iguais mantém os grupos do grande e devolve o par CANOPUS 977", async () => {
		const grupos = await adapterDoCatalogo("canopus-quase-iguais").searchGroups({
			category: "auto",
			creditMax: 80000,
		});
		expect(grupos.length).toBeGreaterThan(4);
		const canopus = grupos.filter(
			(g) => g.administradora === "CANOPUS" && (g as { grupo?: string }).grupo === "977",
		);
		expect(canopus.length).toBeGreaterThanOrEqual(2);
	});
});
