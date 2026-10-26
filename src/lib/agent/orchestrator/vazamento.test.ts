import { describe, expect, it } from "vitest";
import { NOMES_DAS_TOOLS_LIVRES } from "@/lib/agent/pi/tools-livres";
import { maskCpf } from "@/lib/conversation/identity";
import { isInternalToolLeak, passaFinal, scrubCpf } from "./vazamento";

describe("vazamento — nome de tool na fala não chega ao cliente", () => {
	// L19/P274 — `status_da_proposta` entrou no toolset do vendedor livre e ficou
	// fora do filtro: o modelo podia escrever o nome da tool na fala e o cliente lia.
	it("filtra status_da_proposta", () => {
		expect(isInternalToolLeak("Vou chamar status_da_proposta agora.")).toBe(true);
		expect(passaFinal("Consultando com status_da_proposta.")).toBe("");
	});

	// A lista do filtro é um espelho manual da lista de tools: tool nova em
	// `NOMES_DAS_TOOLS_LIVRES` sem entrada aqui é vazamento silencioso.
	it("cobre TODAS as tools do vendedor livre", () => {
		const faltando = NOMES_DAS_TOOLS_LIVRES.filter(
			(nome) => !isInternalToolLeak(`Vou chamar ${nome}.`),
		);
		expect(faltando).toEqual([]);
	});

	it("não derruba fala normal que só parece técnica", () => {
		expect(isInternalToolLeak("Sua proposta está em análise na administradora.")).toBe(false);
	});
});

// P288 (reauditoria 13) — `scrubCpf` só mascara o que VALIDA como CPF. O candidato
// antigo (`/\d[\d.\-\s]{9,17}\d/g`) era guloso: engolia o CPF E o telefone ditado na
// sequência, virava um candidato de 18 dígitos, perdia o DV e o texto saía com o CPF
// em claro — no WhatsApp é justamente o que `aceiteDoDisparo` persiste em
// `lgpdAceite.fala`. O molde corrigido faz duas passadas: a forma canônica delimitada
// por não-dígito, depois a antiga para separadores estranhos.
//
// Cada teste abaixo exige as DUAS formas do mesmo número ausentes do resultado (com
// pontuação e só dígitos) e o telefone INTACTO — a garantia não é "tem asterisco", é
// que o número dele continua legível.
describe("P288 — scrubCpf não engole o telefone vizinho do CPF", () => {
	const CPF = maskCpf("52998224725"); // ***.***.247-25

	function semCpfEmClaro(resultado: string): void {
		expect(resultado).not.toContain("529.982.247-25");
		expect(resultado).not.toContain("52998224725");
		expect(resultado).not.toContain("529 982 247 25");
	}

	const casos: { fala: string; telefone: string; esperado: string }[] = [
		{
			fala: "529.982.247-25 11 98765-4321",
			telefone: "11 98765-4321",
			esperado: `${CPF} 11 98765-4321`,
		},
		{ fala: "52998224725 11987654321", telefone: "11987654321", esperado: `${CPF} 11987654321` },
		{
			fala: "11 98765-4321 529.982.247-25",
			telefone: "11 98765-4321",
			esperado: `11 98765-4321 ${CPF}`,
		},
		{
			fala: "meu cpf 529 982 247 25 e cel 11987654321",
			telefone: "11987654321",
			esperado: `meu cpf ${CPF} e cel 11987654321`,
		},
		{
			fala: "529.982.247-25, 11 98765-4321",
			telefone: "11 98765-4321",
			esperado: `${CPF}, 11 98765-4321`,
		},
		{
			fala: "sim, meu CPF é 52998224725 11987654321",
			telefone: "11987654321",
			esperado: `sim, meu CPF é ${CPF} 11987654321`,
		},
	];

	for (const { fala, telefone, esperado } of casos) {
		it(`mascara o CPF e mantém o telefone em ${fala}`, () => {
			const resultado = scrubCpf(fala);
			semCpfEmClaro(resultado);
			expect(resultado).toContain(telefone);
			// Igualdade exata: prova que o resultado é o mascaramento do CPF e NADA mais
			// mudou — inclusive que a saída de `maskCpf` não voltou a ser mascarada na 2ª
			// passada, que é o outro lado do molde de duas passadas.
			expect(resultado).toBe(esperado);
		});
	}

	it("deixa valor, prazo e parcela intactos", () => {
		const fala = "R$ 60.000 em 114 meses, parcela 1.038,61";
		expect(scrubCpf(fala)).toBe(fala);
	});

	it("deixa o telefone sozinho intacto", () => {
		const fala = "11 98765-4321";
		expect(scrubCpf(fala)).toBe(fala);
	});

	it("a saída de maskCpf não casar de novo como CPF válido na 2ª passada", () => {
		// Se o texto mascarado pudesse ser relido como candidato de 11 dígitos, o
		// comprovante virava ***.***.***-** (maskCpf de um candidato que não valida).
		const mascarado = scrubCpf("111.444.777-35 11 99999-9999");
		expect(mascarado).toBe(`${maskCpf("11144477735")} 11 99999-9999`);
		expect(scrubCpf(mascarado)).toBe(mascarado);
	});

	it("a borda esquerda da 1ª passada não começa dentro de outro número", () => {
		// Sem `(?<!\d)`, a forma canônica pode começar no meio de um número longo: a janela
		// deslocada `01234567890` bate no dígito verificador por acaso, e um número que não é
		// CPF do cliente sai mascarado. Com a borda, só o CPF é tocado — telefone e valor
		// continuam intactos.
		expect(scrubCpf("12345678901234567890 111.444.777-35 11 99999-9999")).toBe(
			"12345678901234567890 ***.***.777-35 11 99999-9999",
		);
	});

	it("a 2ª passada continua cobrindo separadores estranhos, sem engolir o telefone", () => {
		// O caso que a 1ª passada não alcança (espaço em volta do traço): a passada
		// antiga é o que ainda mascara aqui.
		expect(scrubCpf("cpf 111.444.777 - 35 e cel 11 99999-9999")).toBe(
			`cpf ${maskCpf("11144477735")} e cel 11 99999-9999`,
		);
	});
});
