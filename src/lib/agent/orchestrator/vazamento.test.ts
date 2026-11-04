import { describe, expect, it } from "vitest";
import { NOMES_DAS_TOOLS_LIVRES } from "@/lib/agent/pi/tools-livres";
import { maskCpf } from "@/lib/conversation/identity";
import { extractCpf } from "@/lib/conversation/telefone-ou-cpf";
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
// fala SEM NENHUM dígito: o número do cliente não é o consentimento, e é justamente o que o
// comprovante não pode guardar. O corte de 200 chars vem DEPOIS de mascarar, pra o truncamento
// nunca perder o comprovante.
describe("P288 — comprovanteDeAceite não guarda número", () => {
	// A garantia não é "tem asterisco" nem um limite por tamanho de trecho: é a AUSÊNCIA de
	// dígito. Um limite de 8+ dígitos deixa o CPF com parênteses internos inteiro na fala —
	// `sim (529)(982)(247)(25)` são três trechos de 3 dígitos, e o número continua extraível.
	function semDigito(comprovante: string): void {
		expect(comprovante).not.toMatch(/\d/);
	}

	for (const fala of [
		"sim, 529.982.247 - 25 11 98765-4321",
		"sim, meu CPF é 52998224725 11987654321",
		"11987654321529.982.247-25",
		"cpf 529/982/247-25",
		"sim, 529 . 982 . 247 - 25, pode usar meus dados",
		"sim (529)(982)(247)(25)",
		"529.982.247-25 11 98765-4321",
		"5 2 9 9 8 2 2 4 7 2 5",
	]) {
		it(`comprovante sem número: ${fala}`, () => {
			const comprovante = comprovanteDeAceite(fala);
			// A fala continua legível — só o número sai.
			expect(comprovante).not.toBe("");
			semDigito(comprovante);
			expect(comprovante).not.toContain("529.982.247-25");
			expect(comprovante).not.toContain("529.982.247 - 25");
		});
	}

	it("a fala que não tem número sai igual", () => {
		expect(comprovanteDeAceite("sim pode seguir")).toBe("sim pode seguir");
	});

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

// P288 (reauditoria 15, rodada 15) — os separadores. O guarda delimitava o trecho numérico só
// com ponto, hífen, espaço e barra; o capturador (`telefone-ou-cpf.ts`) aceita parênteses entre
// os dígitos. Um número que o capturador lê como CPF não pode sobreviver legível no comprovante:
// os dois têm que ler o MESMO conjunto de separadores, e a garantia estrutural é que o
// comprovante sai sem dígito nenhum — qualquer que seja o separador.
describe("P288 (rodada 15) — os separadores do guarda são os do capturador", () => {
	const CPF = maskCpf("52998224725"); // ***.***.247-25

	for (const fala of [
		"(529) 982 247 (25)",
		"cpf: (529.982.247-25)",
		"sim, meu CPF é 529.982(247)-25",
		"(529).(982).(247)-(25)",
	]) {
		it(`mascara o CPF com parênteses em ${fala}`, () => {
			expect(scrubCpf(fala)).toContain(CPF);
			expect(scrubCpf(fala)).not.toContain("52998224725");
		});
	}

	// O telefone com parênteses continua telefone: a janela de 11 dígitos dele não fecha no DV,
	// e o que muda é só o CPF.
	it("mantém o telefone com parênteses intacto", () => {
		const fala = "celular (11) 98765-4321";
		expect(scrubCpf(fala)).toBe(fala);
	});

	// O teste que morde a DIVERGÊNCIA entre os dois conjuntos de separadores: os mesmos exemplos
	// passam pelo reconhecedor compartilhado (`extractCpf`, em `telefone-ou-cpf.ts`) e pelo guarda.
	// O conjunto do guarda é o do reconhecedor mais a barra — ele pode ler mais, nunca menos. Se o
	// guarda deixar de ler um separador que o capturador aceita, o número é capturado e continua
	// legível no comprovante, e este teste fica vermelho.
	const mesmosExemplos = [
		"sim, meu CPF é 529.982.247-25",
		"sim, meu CPF é 529.982(247)-25",
		"sim, meu CPF é (529) 982 247 (25)",
		"sim, meu CPF é 529-982-247-25",
		"sim, meu CPF é 5 2 9 9 8 2 2 4 7 2 5",
		"sim, meu CPF é (529)982(247)(25)",
		"sim, meu CPF é 529.982.247-25 e o celular é 11 98765-4321",
	];

	for (const fala of mesmosExemplos) {
		it(`captura e mascara o mesmo número em ${fala}`, () => {
			const capturado = extractCpf(fala);
			expect(capturado).toBe("52998224725");
			if (!capturado) throw new Error(`o capturador não leu CPF em ${fala}`);
			// O que o capturador lê como CPF tem que ser o que o guarda mascara: se os dois
			// conjuntos de separadores divergem, o número é capturado e o comprovante continua com
			// ele em claro (mascarado ou não), e esta linha fica vermelha.
			expect(scrubCpf(fala)).toContain(maskCpf(capturado));
			const comprovante = comprovanteDeAceite(fala);
			expect(comprovante).not.toMatch(/\d/);
			expect(comprovante).not.toContain(capturado);
		});
	}
});

// MEDIDO no chat web (mesma conversa do print 10, 3 mensagens `assistant` seguidas): a PRIMEIRA
// fala do turno foi o plano interno do modelo, impresso para o cliente —
//
//   "Show-me-the-price: a faixa está na tela. Pergunto o valor. Boa!"
//
// Não é tom, é máquina: linha de raciocínio (rótulo em inglês de planejamento, passo narrado em
// 1ª pessoa, interjeição solta de fim de passo) não é fala de vendedor. A guarda da narração
// (`pi/narracao.ts`) não pega porque ela compara o balão inteiro com o VOCABULÁRIO FECHADO de
// anúncio de ferramenta: basta uma palavra de fora ("price", "Boa") para o balão passar. Quem
// corta é este pacote, no mesmo lugar onde já caem JSON de argumento e nome de tool.
describe("plano interno do modelo não chega ao cliente", () => {
	const VAZAMENTO = "Show-me-the-price: a faixa está na tela. Pergunto o valor. Boa!";

	it("derruba a string exata que apareceu na tela", () => {
		expect(passaFinal(VAZAMENTO)).toBe("");
	});

	it("derruba o plano escrito em três linhas", () => {
		expect(passaFinal("Show-me-the-price: a faixa está na tela.\nPergunto o valor.\nBoa!")).toBe(
			"",
		);
	});

	// Cada forma de plano, uma por teste: rótulo em inglês de planejamento, passo em 1ª pessoa e
	// interjeição solta de fim de passo.
	for (const plano of [
		"Step 2: agora pergunto o valor do bem.",
		"Plan: mostrar a Canopus e perguntar o valor.",
		"Reasoning: ele pediu 90 mil, a faixa cobre.",
		"Thought: já viu a oferta, falta o valor.",
		"Action: abrir a busca de cartas.",
		"Observation: duas cartas na faixa.",
		"Pergunto o valor.",
		"Busco as cartas.",
	]) {
		it(`derruba o plano: ${plano}`, () => {
			expect(passaFinal(plano)).toBe("");
		});
	}

	// O QUE NÃO PODE CAIR — fala real do produto. O filtro olha o COMEÇO da linha e o vocabulário
	// de planejamento; nome próprio, número, pergunta e "deixa eu" continuam na tela.
	for (const fala of [
		"Deixa eu buscar as cartas.",
		"Olha, eu escolheria a CANOPUS de 90 mil.",
		"Quer seguir com ela ou prefere comparar outra?",
		"Boa, Marcos! A Canopus tem a parcela mais leve do grupo.",
	]) {
		it(`mantém a fala legítima intacta: ${fala}`, () => {
			expect(passaFinal(fala)).toBe(fala);
		});
	}

	it("o turno do print 10 continua inteiro, balão por balão", async () => {
		const { picarEmBaloes } = await import("@/lib/agent/pi/baloes");
		const texto =
			"Olha, eu escolheria a CANOPUS de 90 mil. Ela tem a parcela mais leve entre as de 90 mil e sorteia 3 cartas por mês, mais que as outras do grupo. Quer seguir com ela ou prefere comparar outra?";
		const baloes = picarEmBaloes(texto);
		expect(baloes).toHaveLength(3);
		expect(baloes.map((b) => passaFinal(b))).toEqual(baloes);
	});
});

describe("o id interno da carta não vai para a fala (conversa de teste, 28/10)", () => {
	it("a fala medida: o id e a etiqueta saem, o resto fica", async () => {
		const { passaFinal } = await import("./vazamento");
		const medida = "A de menor prazo é a da ÂNCORA, id 6abfaec94c0ff2a8453a73a0, com 94 meses.";
		expect(passaFinal(medida)).toBe("A de menor prazo é a da ÂNCORA, com 94 meses.");
	});

	it("id solto, entre parênteses e UUID também saem", async () => {
		const { passaFinal } = await import("./vazamento");
		expect(passaFinal("É a carta 6abfaec94c0ff2a8453a73a0 que eu recomendo.")).toBe(
			"É a carta que eu recomendo.",
		);
		expect(passaFinal("Use o grupo (id: 6abfaec94c0ff2a8453a73a0) na proposta.")).toBe(
			"Use o grupo na proposta.",
		);
		expect(passaFinal("O código 123e4567-e89b-12d3-a456-426614174000 não vai ao cliente.")).toBe(
			"O código não vai ao cliente.",
		);
	});

	it("número de fala legítima não é tocado", async () => {
		const { passaFinal } = await import("./vazamento");
		const fala = "Parcela de R$ 1.176,39 em 96 meses, carta de R$ 90.000 (grupo 1234).";
		expect(passaFinal(fala)).toBe(fala);
	});
});
