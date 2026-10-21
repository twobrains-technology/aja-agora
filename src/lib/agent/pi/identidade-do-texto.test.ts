// A captura de CPF/telefone é o que impede PII em claro no banco, no log e no
// provedor do modelo. Estes testes mordem: sem a máscara, o número viaja.
import { describe, expect, it } from "vitest";
import { capturarIdentidadeDoTexto } from "./turno-livre";

const CPF = "11144477735";
const CPF_MASCARADO = "111.444.777-35";

describe("capturarIdentidadeDoTexto", () => {
	it("CPF sozinho: guarda o número na hora (celular pode vir depois) e tira do texto", () => {
		const r = capturarIdentidadeDoTexto(`meu cpf é ${CPF_MASCARADO}`, null);
		expect(r.recebeuCpf).toBe(true);
		// CPF parcial VALE e é persistido: o celular chega na mensagem seguinte e o
		// servidor precisa lembrar do CPF entre turnos.
		expect(r.identidade).toEqual({ cpf: CPF, celular: "" });
		expect(r.textoLimpo).not.toContain("444");
		expect(r.textoLimpo).toContain("[CPF recebido e guardado]");
	});

	it("celular solto de 11 dígitos NÃO é confundido com CPF", () => {
		const r = capturarIdentidadeDoTexto("meu numero é 11987654321", null);
		expect(r.recebeuCpf).toBe(false);
		expect(r.recebeuCelular).toBe(true);
		expect(r.identidade).toBeNull();
		expect(r.textoLimpo).not.toContain("987654321");
	});

	it("CPF + celular: devolve a identidade completa e some com os dois números", () => {
		const r = capturarIdentidadeDoTexto(`cpf ${CPF} e celular 11 98888-7777`, null);
		expect(r.identidade).toEqual({ cpf: CPF, celular: "11988887777" });
		expect(r.textoLimpo).not.toContain("98888");
		expect(r.textoLimpo).not.toContain("444");
	});

	it("celular depois, com CPF já guardado: completa a identidade", () => {
		const r = capturarIdentidadeDoTexto("meu número é (11) 97777-6666", { cpf: CPF, celular: "" });
		expect(r.identidade).toEqual({ cpf: CPF, celular: "11977776666" });
	});

	it("CPF inválido não vira identidade, mas sai do texto mesmo assim", () => {
		const r = capturarIdentidadeDeTextoInvalido();
		expect(r).toBeNull();
	});

	it("texto sem número não é tocado", () => {
		const r = capturarIdentidadeDoTexto("quero um carro de 80 mil", null);
		expect(r.textoLimpo).toBe("quero um carro de 80 mil");
		expect(r.recebeuCpf).toBe(false);
		expect(r.identidade).toBeNull();
	});
});

/** CPF com dígito trocado: continua PII, então tem que sair do texto — mas não
 * pode virar identidade, senão a proposta sai com número errado. */
function capturarIdentidadeDeTextoInvalido() {
	const r = capturarIdentidadeDoTexto("cpf 111.444.777-36", null);
	expect(r.identidade).toBeNull();
	expect(r.textoLimpo).not.toContain("444");
	return null;
}
