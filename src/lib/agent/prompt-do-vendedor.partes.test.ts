import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectarPromessaDeContemplacao } from "@/lib/playground/detector-de-promessa";
import {
	BASE_DO_VENDEDOR,
	compor,
	ORDEM_DE_COMPOSICAO,
	PARTES_NA_TELA,
	PARTES_PADRAO,
	PROMPT_DO_VENDEDOR,
} from "./prompt-do-vendedor";

// O legado foi extraído do HEAD antes da repartição (59b98e24). É referência, não mais lei:
// por decisão do dono (04/11) a base ganhou as premissas e a igualdade byte a byte caiu.
const legado = readFileSync(join(__dirname, "__fixtures__/prompt-do-vendedor.legado.txt"), "utf8");

const normaliza = (t: string) => t.replace(/\s+/g, " ");

describe("repartição do prompt em partes (base e partes)", () => {
	it("T2.4 todo bloco operacional do legado segue presente em alguma parte (exceto os movidos para a base)", () => {
		const noPerfil = normaliza(Object.values(PARTES_PADRAO).join("\n\n"));
		const naBase = normaliza(`${BASE_DO_VENDEDOR.prefixo}\n\n${BASE_DO_VENDEDOR.sufixo}`);
		// Movidos para a base por decisão do dono (04/11): premissas do agente.
		const MOVIDOS = ["É honesto sobre como o consórcio funciona.", "Só afirma o que sabe."];
		// Reescritos nesta costura: o legado dizia o mesmo com outras palavras ou nomes de ferramenta.
		const REESCRITOS = [
			"Chama gente quando é a hora.",
			"Mostra número cedo.",
			"Na comparação, não ponha duas cartas iguais",
			"A primeira coisa é o nome.",
			"Se a busca falhar",
			"Opção que cabe em um toque",
			"Escuta antes de oferecer.",
			"O cliente não tem formulário.",
			"Pergunta o mínimo antes de mostrar.",
			"O contato é o que salva a conversa.",
			"Faça no máximo UMA pergunta por mensagem.",
			"Uma pergunta por mensagem, sempre",
			"Quando chamar falar_com_humano",
			"Se a pergunta tem alternativas",
		];
		const pulados = [...MOVIDOS, ...REESCRITOS];
		const operacionais = legado
			.split("\n\n")
			.filter((b) => !pulados.some((m) => b.startsWith(m)))
			.slice(1) // abertura do prefixo
			.filter((b) => !b.startsWith("Como um bom vendedor") && !b.startsWith("Fala como gente"));
		expect(operacionais.length).toBeGreaterThan(10);
		for (const bloco of operacionais) {
			expect(noPerfil, bloco.slice(0, 50)).toContain(normaliza(bloco));
		}
		// Cada bloco movido foi dividido: o fato fica na base, o comportamento vai para uma parte.
		const naBaseFrases = [
			"Não tem juros, tem taxa de administração e fundo de reserva.",
			"Ninguém sabe o mês da contemplação: ela vem por sorteio ou por lance.",
			"O lance embutido usa parte da própria carta e diminui o crédito que a pessoa recebe.",
			"Nunca prometa data de contemplação.",
			"Valores, parcelas, prazos e nomes de administradora vêm das ferramentas.",
			"Se você não tem o número, diga que vai buscar ou que não sabe.",
			"Nunca estime nem invente.",
		];
		for (const f of naBaseFrases) {
			expect(naBase, f).toContain(f);
			expect(noPerfil, f).not.toContain(f);
		}
		const nasPartesFrases = [
			"Explique com palavras simples quando fizer diferença para a decisão dela, sem aula.",
			"fale como vendedor, numa bolha só (um parágrafo, sem quebra de linha, mesmo que o resto da conduta peça bolhas)",
			"responda em uma frase DIFERENTE — o aviso já foi dado.",
			"De madrugada ninguém atende: diga isso e combine o retorno.",
		];
		for (const f of nasPartesFrases) {
			expect(noPerfil, f).toContain(normaliza(f));
			expect(naBase, f).not.toContain(normaliza(f));
		}
		// Os blocos originais do legado já não existem inteiros em lugar nenhum.
		for (const m of MOVIDOS) {
			const original = legado.split("\n\n").find((x) => x.startsWith(m)) as string;
			expect(naBase).not.toContain(normaliza(original));
		}
	});

	it("T2.7 a base traz as premissas do agente", () => {
		const t = normaliza(BASE_DO_VENDEDOR.prefixo);
		expect(t).toMatch(/Vender é o seu trabalho/);
		expect(t).toMatch(/não desiste do lead/);
		expect(t).toMatch(/A conversa não morre/);
		expect(t).toMatch(/próximo passo/);
		expect(t).toMatch(/truncada/);
		expect(t).toMatch(/beco sem saída/);
		expect(t).toMatch(/quando a busca falha/);
		expect(t).toMatch(/recusa um dado/);
		expect(t).toMatch(/ninguém da fila atende/);
		expect(t).toMatch(/entregue valor antes de pedir dado/);
		expect(t).toMatch(/Atenda o que a pessoa pediu/);
		expect(t).toMatch(/Não peça de novo o que ela já respondeu nem o que o canal já entregou/);
		expect(t).toMatch(/Ninguém é empurrado para o fechamento/);
		expect(t).toMatch(/só recebe a pessoa quando ela pede para fechar ou já gerou a proposta/);
		expect(t).toMatch(/A fila de vendedores não é a mesa/);
		expect(t).toMatch(/não silencia/);
		expect(t).toMatch(/sem prometer\s+prazo/);
		expect(t).toMatch(/hora do fato/);
		expect(t).toMatch(/você se cala/);
		expect(t).toMatch(/Só afirma o que sabe/);
		expect(t).toMatch(/vêm das ferramentas/);
		expect(t).toMatch(/Não tem juros, tem taxa de administração/);
		expect(t).toMatch(/sorteio ou por lance/);
		expect(t).toMatch(/Nunca prometa data de contemplação/);
		expect(t).toMatch(/Nunca estime nem invente/);
		expect(t).not.toMatch(/\bP\d{1,2}\b|Bruna|Kairo|Bernardo|Eduardo/);
	});

	it("T2.8 as ferramentas citadas nas partes existem com o nome do código", () => {
		const cartas = normaliza(PARTES_PADRAO["cartas-e-cards"]);
		expect(cartas).toMatch(/buscar_cartas/);
		expect(cartas).toMatch(/mostrar_card/);
		expect(cartas).toMatch(/comparison_table/);
		expect(cartas).toMatch(/DEPOIS que a busca responder[^.]*não no\s+mesmo lote/);
		expect(normaliza(PARTES_PADRAO["atendimento-humano"])).toMatch(/falar_com_humano/);
		const todas = normaliza(Object.values(PARTES_PADRAO).join(" "));
		expect(todas).not.toMatch(/ferramenta de atendimento/);
	});

	it("T2.1 atendimento-humano diz quando chamar; a premissa da fila está na base", () => {
		const t = normaliza(PARTES_PADRAO["atendimento-humano"]);
		expect(t).toMatch(/pedir atendente/i);
		expect(t).toMatch(/para se perder/i);
		expect(t).toMatch(/transferir/i);
		expect(t).toMatch(/pede atendente/i);
		expect(t).toMatch(/de madrugada ninguém atende/i);
		expect(t).toMatch(/acalm/i);
		expect(t).toMatch(/Dúvida sobre contemplação, lance, taxa ou segurança dos dados é conversa/);
		expect(t).not.toMatch(/(duas|três|2|3) vezes/i);
		expect(t).not.toMatch(/garant\w+ (o )?prazo/i);
		const base = normaliza(BASE_DO_VENDEDOR.prefixo);
		expect(base).toMatch(/não\s+silencia/);
		expect(base).not.toMatch(/(duas|três|2|3) vezes/i);
	});

	it("T2.2 cartas-e-cards mantém duas a quatro, ids, não repetir e variar a administradora", () => {
		const t = normaliza(PARTES_PADRAO["cartas-e-cards"]);
		expect(t).toMatch(/duas a quatro/);
		expect(t).toMatch(/\bids\b/);
		expect(t).toMatch(/duas cartas iguais|nunca repita (a )?(mesma )?carta/i);
		expect(t).toMatch(/administradora/i);
		expect(t).toMatch(/varie|variar/i);
	});

	it("T2.2b contato manda pedir o celular uma vez, só na proposta, no site", () => {
		const t = normaliza(PARTES_PADRAO.contato);
		expect(t).toMatch(/uma [úu]nica vez/i);
		expect(t).toMatch(/proposta/i);
	});

	it("T2.5 nenhuma parte padrão é acusada pelo detector", () => {
		const acusadas = Object.entries(PARTES_PADRAO)
			.filter(([, texto]) => !detectarPromessaDeContemplacao(texto).ok)
			.map(([id]) => id);
		expect(acusadas).toEqual([]);
	});

	it("T2.9 a base proíbe número sem lastro, nem como exemplo ou aproximado", () => {
		const base = normaliza(BASE_DO_VENDEDOR.prefixo);
		expect(base).toContain("não veio de ferramenta nem da própria pessoa");
		expect(base).toContain(
			"nem como exemplo, ilustração, faixa sugerida ou valor aproximado entre parênteses",
		);
		expect(base).toContain("use os números das cartas que a busca devolveu, ou fale sem número");
	});

	it("T2.10 a regra de número sem lastro não se repete nas partes", () => {
		for (const [id, texto] of Object.entries(PARTES_PADRAO)) {
			const t = normaliza(texto);
			expect(t, id).not.toContain("faixa em reais como exemplo");
			expect(t, id).not.toContain("valor aproximado entre parênteses");
		}
	});

	it("T2.6 limite de conduta segue folgado", () => {
		expect(PROMPT_DO_VENDEDOR.length).toBeLessThan(20_000);
	});
});

describe("repartição do prompt em partes (estrutura)", () => {
	it("T1.2 PROMPT_DO_VENDEDOR é compor(PARTES_PADRAO)", () => {
		expect(compor(PARTES_PADRAO)).toBe(PROMPT_DO_VENDEDOR);
	});

	it("T1.3 as 7 partes existem e as duas ordens têm o mesmo conjunto", () => {
		const chaves = Object.keys(PARTES_PADRAO).sort();
		expect(chaves).toHaveLength(7);
		expect([...PARTES_NA_TELA].sort()).toEqual(chaves);
		expect([...ORDEM_DE_COMPOSICAO].sort()).toEqual(chaves);
		for (const texto of Object.values(PARTES_PADRAO)) expect(texto.length).toBeGreaterThan(0);
	});

	it("T1.4 o legado tem 27 blocos e base + partes os reproduz na ordem", () => {
		// Os blocos 3..27 do texto atual: só os três trechos da U2 diferem do legado.
		// 28 parágrafos de leitura; os dois primeiros da abertura ("A primeira coisa é o nome" e
		// "Se o nome ainda falta") não têm linha em branco entre si, então são um bloco.
		const blocos = legado.split("\n\n");
		expect(blocos).toHaveLength(27);
		const remontado = [
			BASE_DO_VENDEDOR.prefixo,
			...ORDEM_DE_COMPOSICAO.map((id) => PARTES_PADRAO[id]),
			BASE_DO_VENDEDOR.sufixo,
		].join("\n\n");
		expect(remontado).toBe(PROMPT_DO_VENDEDOR);
		expect(PROMPT_DO_VENDEDOR.split("\n\n").length).toBeGreaterThanOrEqual(blocos.length);
	});

	it("T1.5 trocar uma parte altera só o trecho dela", () => {
		const trocado = compor({ ...PARTES_PADRAO, abertura: "X" });
		expect(trocado).not.toBe(PROMPT_DO_VENDEDOR);
		expect(trocado).toContain("X");
		expect(trocado).not.toContain(PARTES_PADRAO.abertura);
		for (const id of ORDEM_DE_COMPOSICAO) {
			if (id !== "abertura") expect(trocado).toContain(PARTES_PADRAO[id]);
		}
		expect(trocado).toBe(PROMPT_DO_VENDEDOR.replace(PARTES_PADRAO.abertura, "X"));
	});
});
