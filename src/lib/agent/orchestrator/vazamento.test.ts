import { describe, expect, it } from "vitest";
import { NOMES_DAS_TOOLS_LIVRES } from "@/lib/agent/pi/tools-livres";
import { maskCpf } from "@/lib/conversation/identity";
import { comprovanteDeAceite, isInternalToolLeak, passaFinal, scrubCpf } from "./vazamento";

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

// P288 (reauditorias 13 e 14) — `scrubCpf` só mascara o que VALIDA como CPF, e só o que é
// uma janela de 11 dígitos. O candidato antigo era guloso: engolia o CPF E o telefone ditado na
// sequência, perdia o DV e o texto saía com o CPF em claro — no WhatsApp é justamente o que
// `aceiteDoDisparo` persiste em `lgpdAceite.fala`.
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
			// mudou — inclusive que a saída de `maskCpf` não voltou a ser mascarada.
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

	it("a saída de maskCpf não casar de novo como CPF válido", () => {
		// Se o texto mascarado pudesse ser relido como candidato de 11 dígitos, o
		// comprovante virava ***.***.***-** (maskCpf de um candidato que não valida).
		const mascarado = scrubCpf("111.444.777-35 11 99999-9999");
		expect(mascarado).toBe(`${maskCpf("11144477735")} 11 99999-9999`);
		expect(scrubCpf(mascarado)).toBe(mascarado);
	});

	it("a janela não começa dentro de outro número", () => {
		// A janela sempre começa na fronteira de um grupo e consome exatamente 11 dígitos. Sem
		// isso, a janela deslocada `01234567890` dentro de um número longo bate no DV por acaso e
		// um número que não é CPF do cliente sai mascarado. Assim, só o CPF é tocado — telefone e
		// valor continuam intactos.
		expect(scrubCpf("12345678901234567890 111.444.777-35 11 99999-9999")).toBe(
			"12345678901234567890 ***.***.777-35 11 99999-9999",
		);
	});

	it("os separadores estranhos continuam cobertos, sem engolir o telefone", () => {
		// O caso que o molde por formato não alcançava (espaço em volta do traço): a conta por
		// grupos é o que mascara aqui.
		expect(scrubCpf("cpf 111.444.777 - 35 e cel 11 99999-9999")).toBe(
			`cpf ${maskCpf("11144477735")} e cel 11 99999-9999`,
		);
	});
});

// P288 (reauditoria 14, rodada 14) — o remendo por formato parou. As duas passadas por regex
// não fecham o caso: o molde canônico não admite espaço em volta do hífen, e a passada gulosa
// junta o CPF ao telefone vizinho (`529.982.247 - 25 11` = 13 dígitos) e devolve o trecho em
// claro. O molde agora é o FATO do número: o texto é cortado em TRECHOS NUMÉRICOS por fronteira
// de dígito; dentro de cada trecho, a janela de grupos que soma exatamente 11 dígitos e valida
// no DV é mascarada, e o resto do trecho fica intacto. Isso não depende de quais separadores
// aparecem — telefone, valor e data continuam legíveis.
describe("P288 (rodada 14) — scrubCpf por janela de 11 dígitos, por fronteira de grupo", () => {
	const CPF = maskCpf("52998224725"); // ***.***.247-25

	const casos: { fala: string; esperado: string }[] = [
		{ fala: "529.982.247-25 11 98765-4321", esperado: `${CPF} 11 98765-4321` },
		// O contraexemplo da rodada 14: espaço em volta do hífen, telefone na sequência.
		{ fala: "529.982.247 - 25 11 98765-4321", esperado: `${CPF} 11 98765-4321` },
		{ fala: "529 . 982 . 247 - 25 11987654321", esperado: `${CPF} 11987654321` },
		{ fala: "52998224725 11987654321", esperado: `${CPF} 11987654321` },
		// Telefone antes do CPF: a janela de 11 dígitos do telefone não valida no DV, então
		// passa intacta — quem muda é só o CPF.
		{ fala: "11 98765-4321 529.982.247-25", esperado: `11 98765-4321 ${CPF}` },
		{ fala: "cpf 529/982/247-25", esperado: `cpf ${CPF}` },
		// O que não é CPF passa intacto, incluindo o número colado: sem separador ele não é
		// uma janela de grupo, e a borda de dígito é o que impede mascarar um número que não
		// é o CPF do cliente (a mesma garantia da borda esquerda, acima).
		{
			fala: "R$ 60.000 em 114 meses, parcela 1.038,61",
			esperado: "R$ 60.000 em 114 meses, parcela 1.038,61",
		},
		{ fala: "11 98765-4321", esperado: "11 98765-4321" },
		{ fala: "26/10/2026", esperado: "26/10/2026" },
		{ fala: "11987654321529.982.247-25", esperado: "11987654321529.982.247-25" },
	];

	for (const { fala, esperado } of casos) {
		it(`mascara o CPF e mantém o resto em ${fala}`, () => {
			expect(scrubCpf(fala)).toBe(esperado);
		});
	}
});

// P288 — o COMPROVANTE do aceite, não o número. O registro persistido (`lgpdAceite.fala`) é a
// fala com o CPF mascarado e todo trecho numérico de 8+ dígitos fora: telefone, valor e prazo
// não são o consentimento, e são justamente os dígitos que a janela de 11 não alcança. O corte
// de 200 chars vem DEPOIS de mascarar, pra o truncamento nunca perder o comprovante.
describe("P288 — comprovanteDeAceite não guarda número", () => {
	// A garantia é POR TRECHO, não pelo total: `R$ 60.000 em 114 meses` tem 12 dígitos somados
	// e nenhum trecho de 8+. Contar digitos soltos deixaria o teste vermelho pelo motivo errado.
	function maiorTrechoNumérico(texto: string): number {
		let max = 0;
		for (const trecho of texto.match(/\d[\d.\-\s/]*\d|\d/g) ?? []) {
			const digitos = [...trecho].filter((c) => c >= "0" && c <= "9").length;
			if (digitos > max) max = digitos;
		}
		return max;
	}

	function semNumeroDe8MaisDigitos(comprovante: string): void {
		expect(maiorTrechoNumérico(comprovante)).toBeLessThan(8);
		expect(comprovante).not.toContain("52998224725");
		expect(comprovante).not.toContain("529.982.247-25");
		expect(comprovante).not.toContain("529.982.247 - 25");
	}

	for (const fala of [
		"sim, 529.982.247 - 25 11 98765-4321",
		"sim, meu CPF é 52998224725 11987654321",
		"11987654321529.982.247-25",
		"cpf 529/982/247-25",
		"sim, 529 . 982 . 247 - 25, pode usar meus dados",
	]) {
		it(`comprovante sem número: ${fala}`, () => {
			const comprovante = comprovanteDeAceite(fala);
			// A fala continua legível — só o número sai.
			expect(comprovante).not.toBe("");
			semNumeroDe8MaisDigitos(comprovante);
		});
	}

	it("mascara antes de cortar em 200 chars", () => {
		const comprovante = comprovanteDeAceite(`sim, ${"a".repeat(250)}`);
		expect(comprovante).toHaveLength(200);
		expect(comprovante).toBe(`sim, ${"a".repeat(195)}`);
	});

	// O corte é DEPOIS do mascaramento, e o teste morde a ordem. Se cortasse antes, entraria o
	// pedaço do número (`529.982.24` — 10 dígitos, não valida no DV) e ele seria mantido em
	// claro, além de o comprovante passar dos 200 chars. mascarando antes, o que passa do corte
	// é a máscara, ainda que o corte trunque a própria máscara.
	it("o CPF que cai depois do corte de 200 chars continua mascarado", () => {
		const comprovante = comprovanteDeAceite(`${"a".repeat(195)} 529.982.247-25`);
		expect(comprovante).toHaveLength(200);
		expect(comprovante).toBe(`${"a".repeat(195)} ***.`);
		expect(comprovante).not.toContain("529.982.247-25");
	});
});
