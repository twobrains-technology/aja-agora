// biome-ignore-all lint/suspicious/noTemplateCurlyInString: o `${}` literal é o dado sob teste
// O gate reprovou o produto por um defeito do próprio gate (2026-08-13).
//
// `golden-fecho-nao-anda-pra-tras` manda `"cpf": "${E2E_TEST_CPF}"`. Sem a env,
// o runner expandia para "" e mandava CPF vazio — o funil voltava a pedir
// identidade, como deve, e o eval registrava FAIL apontando para o produto.
// Este teste amarra a regra: variável citada e ausente = cenário PULADO
// (inconclusivo), nunca reprovado.
//
// `noTemplateCurlyInString` está suprimida no arquivo: a regra existe pra pegar
// quem escreveu "${x}" querendo template literal, e aqui é o oposto — o `${}`
// literal é o DADO sob teste, exatamente como ele aparece no JSON do cenário.
// Virar template literal quebraria o que se está verificando.
import { describe, expect, it } from "vitest";
import { envsFaltando, variaveisCitadas } from "./env-do-cenario";

const TURNO_DO_CENARIO = JSON.stringify({
	type: "action",
	action: {
		kind: "gate",
		gate: "identify",
		value: { cpf: "${E2E_TEST_CPF}", celular: "11995432576", lgpd: true },
	},
	label: "Enviei meus dados pra buscar as ofertas",
});

describe("variáveis citadas no cenário", () => {
	it("encontra a env exigida pelo próprio texto, sem precisar de declaração", () => {
		expect(variaveisCitadas(TURNO_DO_CENARIO)).toEqual(["E2E_TEST_CPF"]);
	});

	it("não repete a mesma variável citada duas vezes", () => {
		expect(variaveisCitadas("${A} e ${A} e ${B}")).toEqual(["A", "B"]);
	});

	it("cenário sem variável não exige nada", () => {
		expect(variaveisCitadas('{"text":"oi"}')).toEqual([]);
	});
});

describe("envs que faltam", () => {
	// O caso exato de 2026-08-13.
	it("pega a env citada que ninguém declarou em requiresEnv", () => {
		expect(
			envsFaltando({
				cenarioSerializado: TURNO_DO_CENARIO,
				declaradas: [],
				ambiente: {},
			}),
		).toEqual(["E2E_TEST_CPF"]);
	});

	it("com a env presente, o cenário roda", () => {
		expect(
			envsFaltando({
				cenarioSerializado: TURNO_DO_CENARIO,
				declaradas: [],
				ambiente: { E2E_TEST_CPF: "12345678901" },
			}),
		).toEqual([]);
	});

	// Env declarada mas não citada continua valendo — há pré-requisito que não
	// aparece como `${}` no texto (credencial de conta de teste, por exemplo).
	it("respeita o que o JSON declarou, mesmo sem citação no texto", () => {
		expect(
			envsFaltando({
				cenarioSerializado: '{"text":"oi"}',
				declaradas: ["E2E_TEST_CELULAR"],
				ambiente: {},
			}),
		).toEqual(["E2E_TEST_CELULAR"]);
	});

	// Variável vazia é tão ausente quanto variável inexistente — foi assim que
	// o CPF vazio chegou à administradora.
	it("string vazia conta como ausente", () => {
		expect(
			envsFaltando({
				cenarioSerializado: TURNO_DO_CENARIO,
				ambiente: { E2E_TEST_CPF: "   " },
			}),
		).toEqual(["E2E_TEST_CPF"]);
	});
});
