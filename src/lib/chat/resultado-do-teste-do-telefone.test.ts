/**
 * FIX-397 — agregação PURA do resultado do teste do telefone.
 *
 * A regra que este teste trava é a do bloco: **sem dado ⇒ "não calculável",
 * nunca zero.** Num teste de ~60 pessoas, um lado vazio e um lado com zero
 * conversões parecem o mesmo número na tela e significam coisas opostas.
 */

import { describe, expect, it } from "vitest";
import {
	agregarResultadoDoTesteDoTelefone,
	type LinhaDoTesteDoTelefone,
	totalDoTesteDoTelefone,
} from "./resultado-do-teste-do-telefone";

const linha = (
	variante: "B" | "C",
	telefone = false,
	comparacao = false,
): LinhaDoTesteDoTelefone => ({ variante, telefone, comparacao });

describe("agregarResultadoDoTesteDoTelefone (FIX-397)", () => {
	it("sempre devolve as DUAS variantes, na ordem canônica B, C", () => {
		const r = agregarResultadoDoTesteDoTelefone([linha("B")]);
		expect(r.map((v) => v.variante)).toEqual(["B", "C"]);
	});

	it("variante sem visita ⇒ 'não calculável' (null), nunca zero", () => {
		const r = agregarResultadoDoTesteDoTelefone([linha("B", true, true)]);
		const c = r.find((v) => v.variante === "C");
		expect(c?.visitas).toBeNull();
		expect(c?.telefones).toBeNull();
		expect(c?.naComparacao).toBeNull();
		expect(c?.taxaDeTelefone).toBeNull();

		// e a B, que tem dado, NÃO é null
		const b = r.find((v) => v.variante === "B");
		expect(b?.visitas).toBe(1);
	});

	it("separa a contagem por variante e soma o total", () => {
		const r = agregarResultadoDoTesteDoTelefone([
			linha("B", true, true),
			linha("B", false, true),
			linha("B", true, false),
			linha("C", true, true),
			linha("C", false, false),
		]);
		const b = r.find((v) => v.variante === "B");
		const c = r.find((v) => v.variante === "C");
		expect(b?.visitas).toBe(3);
		expect(b?.telefones).toBe(2);
		expect(b?.naComparacao).toBe(2);
		expect(c?.visitas).toBe(2);
		expect(c?.telefones).toBe(1);

		const total = totalDoTesteDoTelefone(r);
		expect(total).toEqual({ visitas: 5, telefones: 3, naComparacao: 3 });
	});

	it("taxa de telefone por variante (é o número que decide o vencedor)", () => {
		const r = agregarResultadoDoTesteDoTelefone([
			linha("B", true),
			linha("B", true),
			linha("B", false),
			linha("B", false),
		]);
		expect(r.find((v) => v.variante === "B")?.taxaDeTelefone).toBe(0.5);
	});

	it("nenhuma visita ⇒ total 'não calculável'", () => {
		const r = agregarResultadoDoTesteDoTelefone([]);
		expect(totalDoTesteDoTelefone(r)).toBeNull();
	});

	it("variante desconhecida numa linha ⇒ erro alto (dado corrompido)", () => {
		expect(() =>
			agregarResultadoDoTesteDoTelefone([
				// @ts-expect-error — contrato em runtime, testado de propósito
				{ variante: "A", telefone: false, comparacao: false },
			]),
		).toThrow(/variante desconhecida/i);
	});
});
