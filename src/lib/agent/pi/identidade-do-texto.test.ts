// A captura de CPF/telefone é o que impede PII em claro no banco, no log e no
// provedor do modelo. Estes testes mordem: sem a máscara, o número viaja.
import { describe, expect, it } from "vitest";
import { pedidoDeCpfNoUltimoBalao } from "@/lib/conversation/telefone-ou-cpf";
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

	it("celular solto de 11 dígitos NÃO é confundido com CPF — e fica retido", () => {
		const r = capturarIdentidadeDoTexto("meu numero é 11987654321", null);
		expect(r.recebeuCpf).toBe(false);
		expect(r.recebeuCelular).toBe(true);
		// Número dito ANTES do CPF não se perde: fica guardado com `cpf` vazio até o
		// CPF chegar no turno seguinte.
		expect(r.identidade).toEqual({ cpf: "", celular: "11987654321" });
		expect(r.textoLimpo).not.toContain("987654321");
	});

	it("DDD do RJ e do ES (21, 22, 24, 27, 28) é telefone válido", () => {
		for (const ddd of ["21", "22", "24", "27", "28"]) {
			const r = capturarIdentidadeDoTexto(`meu número é (${ddd}) 98888-7777`, {
				cpf: CPF,
				celular: "",
			});
			expect(r.recebeuCelular).toBe(true);
			expect(r.identidade).toEqual({ cpf: CPF, celular: `${ddd}988887777` });
		}
	});

	it("DDD que não existe (20, 26, 30, 36) não vira telefone", () => {
		for (const ddd of ["20", "26", "30", "36"]) {
			const r = capturarIdentidadeDoTexto(`meu número é (${ddd}) 98888-7777`, null);
			expect(r.recebeuCelular).toBe(false);
			expect(r.identidade).toBeNull();
		}
	});

	it("um SEGUNDO CPF diferente também sai do texto", () => {
		const r = capturarIdentidadeDoTexto(
			`meu cpf é ${CPF_MASCARADO} e o da minha esposa é 529.982.247-25`,
			null,
		);
		expect(r.identidade).toEqual({ cpf: CPF, celular: "" });
		expect(r.textoLimpo).not.toContain("444");
		expect(r.textoLimpo).not.toContain("529");
	});

	it("celular dito ANTES do CPF fica retido na identidade", () => {
		const primeiro = capturarIdentidadeDoTexto("meu número é (11) 97777-6666", null);
		expect(primeiro.identidade).toEqual({ cpf: "", celular: "11977776666" });
		const depois = capturarIdentidadeDoTexto(`e meu cpf é ${CPF_MASCARADO}`, primeiro.identidade);
		expect(depois.identidade).toEqual({ cpf: CPF, celular: "11977776666" });
	});

	it("TODO número repetido sai do texto, não só o primeiro", () => {
		const r = capturarIdentidadeDoTexto(
			`cpf ${CPF_MASCARADO}, repetindo ${CPF_MASCARADO}, tel (11) 97777-6666 e de novo (11) 97777-6666`,
			null,
		);
		expect(r.identidade).toEqual({ cpf: CPF, celular: "11977776666" });
		expect(r.textoLimpo).not.toContain("444");
		expect(r.textoLimpo).not.toContain("97777");
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

	// Celular que também passa no DV do CPF: quem desempata é o CONTEXTO do
	// pedido, a mesma regra do capturador do WhatsApp (L11/P188/P263).
	it("número ambíguo sem pedido de CPF é telefone; com o pedido, é CPF", () => {
		const AMBIGUO = "11900000083";

		const telefone = capturarIdentidadeDoTexto(AMBIGUO, null, { pedidoDeCpf: false });
		expect(telefone.recebeuCpf).toBe(false);
		expect(telefone.identidade).toEqual({ cpf: "", celular: AMBIGUO });

		const cpf = capturarIdentidadeDoTexto(AMBIGUO, null, { pedidoDeCpf: true });
		expect(cpf.recebeuCpf).toBe(true);
		expect(cpf.recebeuCelular).toBe(false);
		expect(cpf.identidade).toEqual({ cpf: AMBIGUO, celular: "" });
	});

	// P263: o CPF já está guardado e o agente pede o CELULAR. O balão dele fala do
	// CPF ("já recebi seu CPF") sem pedi-lo, e é esse balão que o Pi entrega como
	// `contexto.pedidoDeCpf` (`turno-livre.ts:599`). Lido como pedido de CPF, o
	// celular ambíguo sobrescreve o CPF guardado e o telefone se perde.
	it("CPF guardado + agente pede o celular: o número ambíguo é o celular, não um novo CPF", () => {
		const AMBIGUO = "11900000083";
		const pedidoDeCpf = pedidoDeCpfNoUltimoBalao({
			role: "assistant",
			content: "Já recebi seu CPF. Qual é seu celular?",
		});

		const r = capturarIdentidadeDoTexto(AMBIGUO, { cpf: CPF, celular: "" }, { pedidoDeCpf });
		expect(r.recebeuCpf).toBe(false);
		expect(r.recebeuCelular).toBe(true);
		expect(r.identidade).toEqual({ cpf: CPF, celular: AMBIGUO });
	});

	// Rodada 4 da auditoria (P188/P263): a menção EXPLICATIVA ao CPF — "já
	// expliquei como funciona a consulta do CPF" — passava pelo detector por
	// causa do "como", e o pedido de celular que vinha depois era lido como pedido
	// de CPF. O número ambíguo então sobrescrevia o CPF guardado.
	it("CPF guardado + explicação com 'como' + pedido de celular: CPF preservado, celular capturado", () => {
		const AMBIGUO = "11900000083";
		const pedidoDeCpf = pedidoDeCpfNoUltimoBalao({
			role: "assistant",
			content: "Já expliquei como funciona a consulta do CPF. Qual é seu celular?",
		});
		expect(pedidoDeCpf).toBe(false);

		const r = capturarIdentidadeDoTexto(AMBIGUO, { cpf: CPF, celular: "" }, { pedidoDeCpf });
		expect(r.recebeuCpf).toBe(false);
		expect(r.recebeuCelular).toBe(true);
		expect(r.identidade).toEqual({ cpf: CPF, celular: AMBIGUO });
	});

	// P263 (rodada 6): o pedido NEGADO. "Não preciso do seu CPF agora." era lido
	// como pedido (o verbo `preciso` sem a negação), e o celular ambíguo que o
	// cliente mandava em seguida entrava como CPF: sobrescrevia o CPF guardado e
	// apagava o telefone antes da captura telefônica.
	it("CPF guardado + pedido de CPF NEGADO: CPF preservado, celular capturado", () => {
		const AMBIGUO = "11900000083";
		const pedidoDeCpf = pedidoDeCpfNoUltimoBalao({
			role: "assistant",
			content: "Não preciso do seu CPF agora.",
		});
		expect(pedidoDeCpf).toBe(false);

		const r = capturarIdentidadeDoTexto(AMBIGUO, { cpf: CPF, celular: "" }, { pedidoDeCpf });
		expect(r.recebeuCpf).toBe(false);
		expect(r.recebeuCelular).toBe(true);
		expect(r.identidade).toEqual({ cpf: CPF, celular: AMBIGUO });
	});

	it("pedido de CPF de verdade: o mesmo número ambíguo é o CPF", () => {
		const AMBIGUO = "11900000083";
		const pedidoDeCpf = pedidoDeCpfNoUltimoBalao({
			role: "assistant",
			content: "qual seu CPF?",
		});

		const r = capturarIdentidadeDoTexto(AMBIGUO, { cpf: "", celular: "" }, { pedidoDeCpf });
		expect(r.recebeuCpf).toBe(true);
		expect(r.identidade).toEqual({ cpf: AMBIGUO, celular: "" });
	});

	// P188 (rodada 5): a constatação cadastral ISOLADA. "Seu CPF já está
	// cadastrado." era lida como pedido por causa do prefixo `cadastra`, e o
	// celular ambíguo que o cliente mandava em seguida sobrescrevia o CPF guardado.
	it("CPF guardado + constatação cadastral isolada: o número ambíguo é o celular", () => {
		const AMBIGUO = "11900000083";
		const pedidoDeCpf = pedidoDeCpfNoUltimoBalao({
			role: "assistant",
			content: "Seu CPF já está cadastrado.",
		});
		expect(pedidoDeCpf).toBe(false);

		const r = capturarIdentidadeDoTexto(AMBIGUO, { cpf: CPF, celular: "" }, { pedidoDeCpf });
		expect(r.recebeuCpf).toBe(false);
		expect(r.recebeuCelular).toBe(true);
		expect(r.identidade).toEqual({ cpf: CPF, celular: AMBIGUO });
	});

	// P263 (rodada 5): o agente pede o CPF e, na frase seguinte, ensina o formato
	// ("envie só os números"). A instrução não repete a palavra "CPF" e o pedido
	// inteiro se perdia: o CPF que chegava era guardado como telefone e a
	// identidade ficava incompleta.
	it("pedido de CPF + instrução de formato: o número é CPF, não telefone", () => {
		const AMBIGUO = "11900000083";
		const pedidoDeCpf = pedidoDeCpfNoUltimoBalao({
			role: "assistant",
			content: "Qual é seu CPF? Envie só os números.",
		});
		expect(pedidoDeCpf).toBe(true);

		const r = capturarIdentidadeDoTexto(AMBIGUO, { cpf: "", celular: "" }, { pedidoDeCpf });
		expect(r.recebeuCpf).toBe(true);
		expect(r.recebeuCelular).toBe(false);
		expect(r.identidade).toEqual({ cpf: AMBIGUO, celular: "" });
		expect(r.textoLimpo).not.toContain(AMBIGUO);
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
