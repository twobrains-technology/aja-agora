/**
 * Fragmento de JSON nunca vira balão na tela do cliente.
 *
 * Encontrado por uma revisão adversarial exercitando o app, e **persistido no
 * banco** — o que é pior, porque o modelo relê a própria transcrição nos turnos
 * seguintes:
 *
 *   assistant | Já busco as melhores opções de consórcio pra um carro até R$ 80 mil.
 *             |   "category": "veiculo",
 *             |   "max_value": 80000,
 *             |   "client_profile": "default"
 *             | }
 *
 * Duas coisas erradas de uma vez: "já busco" com a busca já feita, e a mecânica
 * escancarada. O guard já existente (`isInternalToolLeak`) pega o NOME de uma
 * tool ("vou chamar recommend_groups") — não pega o CORPO dos argumentos, que
 * não cita tool nenhuma.
 *
 * Por que isto é código e não Langfuse: o `CLAUDE.md` manda tratar fala ruim —
 * tom, repetição, "soou robótico" — com juiz sobre volume, e proíbe transformar
 * frase feia em regex. Isto não é uma frase: é uma classe ESTRUTURAL. Um bloco
 * `"chave": valor` não é português, não é opinião e não tem paráfrase — é
 * pipeline vazando. O teste de decisão do projeto ("existe um FATO do servidor
 * que a fala contradiz?") responde sozinho: o servidor sabe que aquilo é
 * argumento de tool, não conversa.
 *
 * O guard é deliberadamente estreito, e os casos negativos abaixo são a parte
 * que importa: fala legítima com aspas, dois-pontos ou chaves NÃO pode sumir.
 */
import { describe, expect, it } from "vitest";
import { EphemeralTextFilter, isJsonFragmentLeak } from "./sanitizer";

describe("isJsonFragmentLeak — o que É vazamento", () => {
	it("linha de par chave:valor no formato de argumento", () => {
		expect(isJsonFragmentLeak('  "category": "veiculo",')).toBe(true);
		expect(isJsonFragmentLeak('"max_value": 80000,')).toBe(true);
		expect(isJsonFragmentLeak('  "client_profile": "default"')).toBe(true);
	});

	it("chave solta fechando ou abrindo o objeto", () => {
		expect(isJsonFragmentLeak("}")).toBe(true);
		expect(isJsonFragmentLeak("  {")).toBe(true);
		expect(isJsonFragmentLeak("},")).toBe(true);
	});

	it("bloco inteiro colado num segmento só", () => {
		expect(isJsonFragmentLeak('{\n  "category": "auto",\n  "max_value": 80000\n}')).toBe(true);
	});

	it("objeto inteiro numa LINHA só", () => {
		expect(isJsonFragmentLeak('{"category": "auto", "max_value": 80000}')).toBe(true);
	});

	it("dentro de bloco markdown, que é como o modelo às vezes emite", () => {
		expect(isJsonFragmentLeak('```json\n{"category": "auto"}\n```')).toBe(true);
		expect(isJsonFragmentLeak('```\n{"category": "auto"}\n```')).toBe(true);
	});

	it("chave com hífen e fechamento de array", () => {
		expect(isJsonFragmentLeak('  "max-value": 80000,')).toBe(true);
		expect(isJsonFragmentLeak("  ]")).toBe(true);
		expect(isJsonFragmentLeak("  [")).toBe(true);
	});
});

describe("isJsonFragmentLeak — o que NÃO é (e não pode ser podado)", () => {
	it("fala normal do agente passa", () => {
		expect(isJsonFragmentLeak("Encontrei 4 opções ótimas pra você.")).toBe(false);
		expect(isJsonFragmentLeak("Qual delas chamou sua atenção?")).toBe(false);
	});

	it("fala com dois-pontos passa — é pontuação comum em português", () => {
		expect(isJsonFragmentLeak("Olha só: a do Itaú contempla mais rápido.")).toBe(false);
		expect(isJsonFragmentLeak("Resumindo: são 48 meses, R$ 1.992 por mês.")).toBe(false);
	});

	it("fala com aspas passa", () => {
		expect(isJsonFragmentLeak('Você disse "quero algo mais barato", então filtrei por isso.')).toBe(
			false,
		);
	});

	it("valor monetário com chaves ou cifrão passa", () => {
		expect(isJsonFragmentLeak("A carta é de R$ 81.973 (crédito), com taxa de 13,73%.")).toBe(false);
	});

	it("frase com chaves em texto corrido passa", () => {
		// Não é linha-de-JSON: é fala com pontuação.
		expect(isJsonFragmentLeak("O grupo {ITAÚ} tem 7 contemplados por mês.")).toBe(false);
	});

	it("bloco markdown com TEXTO (não JSON) passa", () => {
		expect(isJsonFragmentLeak("```\nEncontrei 4 opções pra você.\n```")).toBe(false);
	});

	it("string vazia não é vazamento", () => {
		expect(isJsonFragmentLeak("")).toBe(false);
		expect(isJsonFragmentLeak("   ")).toBe(false);
	});
});

describe("o FILTRO real — o único caminho que a fala percorre em produção", () => {
	// Esta suíte substitui uma anterior que se chamava "o PIPELINE real" e chamava
	// `stripProcessPreamble`. Uma revisão adversarial provou que aquela função
	// **não tem call site de produção**: quem filtra a fala é o
	// `EphemeralTextFilter` (`converse.ts`, `filter.push(delta)`), e o vazamento
	// continuava atravessando byte a byte.
	//
	// Foi a TERCEIRA vez, nesta mesma entrega, que um "corrigido" se apoiou num
	// artefato que o sistema não executa — antes foi a constante de prompt errada
	// e o fixture já resolvido. Por isso este teste empurra DELTAS, como o modelo
	// faz, e chama `flush()` no fim: se um dia alguém mover o filtro de novo, é
	// aqui que quebra.
	const FALA_DO_INCIDENTE = [
		"Já busco as melhores opções de consórcio pra um carro até R$ 80 mil.",
		'  "category": "veiculo",',
		'  "max_value": 80000,',
		'  "client_profile": "default"',
		"}",
	].join("\n");

	/** Empurra o texto em pedaços, como o streaming entrega. */
	function pelosDeltas(texto: string, tamanho: number): string {
		const filter = new EphemeralTextFilter();
		let saida = "";
		for (let i = 0; i < texto.length; i += tamanho) {
			saida += filter.push(texto.slice(i, i + tamanho));
		}
		return saida + filter.flush();
	}

	for (const tamanho of [texto_len(), 8, 3]) {
		it(`texto do incidente em deltas de ${tamanho} chars sai SEM o JSON`, () => {
			const saida = pelosDeltas(FALA_DO_INCIDENTE, tamanho);

			expect(saida).not.toContain('"category"');
			expect(saida).not.toContain("max_value");
			expect(saida).not.toContain("client_profile");
			// O `}` solto também não é fala.
			expect(saida.trim().endsWith("}")).toBe(false);
		});
	}

	function texto_len() {
		return 4096; // delta único: o texto inteiro de uma vez
	}

	it("a frase em português SOBREVIVE — o guard não come o balão", () => {
		expect(pelosDeltas(FALA_DO_INCIDENTE, 8)).toContain("consórcio");
	});

	it("fala normal com dois-pontos atravessa o filtro intacta", () => {
		const fala = "Olha só: encontrei 4 opções pra você. Qual delas te chamou atenção?";

		const saida = pelosDeltas(fala, 8);

		expect(saida).toContain("Olha só");
		expect(saida).toContain("4 opções");
	});
});
