// Produção, 2026-08-12 (conv 5f02e068, sonda contra ajaagora.com.br, DEPOIS do
// deploy) — o cliente pediu pra contratar e recebeu:
//
//   "Ótimo, Rafael! Rafael, desculpa, parece que não consigo ver qual cota você
//    está vendo na tela. Pronto, vou processar sua contratação agora."
//
// Quatro defeitos empilhados num turno só. Este arquivo cobre os dois que são
// determinísticos:
//
// 1. NARRAÇÃO DE LIMITAÇÃO DO AGENTE. "não consigo ver o que você está vendo na
//    tela" é o agente contando ao cliente como ele próprio é feito. É irmão do
//    `internal-failure-narration` (a máquina falhou) e do `mechanism-narration`
//    (o mecanismo interno), mas escapava dos dois: não há verbo de falha nem
//    nome de ferramenta, é uma confissão de arquitetura. O juiz adversarial
//    tinha avisado que o guard anterior era blocklist de tempo verbal e que
//    paráfrase passaria — passou.
//
// 2. VOCATIVO REPETIDO. "Ótimo, Rafael! Rafael, desculpa..." — o nome duas vezes
//    em frases coladas. Estava no inventário desde a varredura ("Beleza, Erik.
//    Opa, Erik!") e não tinha reproduzido até agora.
//
// O que estes guards NÃO podem cortar: o agente dizer honestamente que precisa
// que o cliente escolha ("Qual das opções você quer?"). Pedir informação é
// conduzir a venda; explicar por que não enxerga a tela é vazar o encanamento.

import { describe, expect, it } from "vitest";
import {
	EphemeralTextFilter,
	isInternalFailureNarration,
	semVocativoRepetido,
} from "@/lib/agent/orchestrator/sanitizer";

describe("agente não narra a própria limitação", () => {
	it("dropa a frase literal que saiu em produção", () => {
		expect(
			isInternalFailureNarration("parece que não consigo ver qual cota você está vendo na tela"),
		).toBe(true);
	});

	it("dropa as paráfrases da mesma confissão", () => {
		for (const s of [
			"Não consigo ver a sua tela.",
			"Não tenho acesso ao que aparece aí pra você.",
			"Não estou enxergando os cards que você está vendo.",
			"Não consigo visualizar a tela do seu lado.",
		]) {
			expect(isInternalFailureNarration(s), s).toBe(true);
		}
	});

	it("NÃO dropa o agente conduzindo a venda — pedir escolha é trabalho dele", () => {
		for (const s of [
			"Qual das opções você quer?",
			"Me diz o nome da administradora que você escolheu.",
			"Não encontrei nenhum grupo nessa faixa de valor.",
			"As opções na sua faixa estão limitadas hoje.",
		]) {
			expect(isInternalFailureNarration(s), s).toBe(false);
		}
	});
});

describe("semVocativoRepetido", () => {
	it("tira a segunda chamada pelo nome na mesma fala", () => {
		expect(semVocativoRepetido("Ótimo, Rafael! Rafael, desculpa, vamos seguir.", "Rafael")).toBe(
			"Ótimo, Rafael! Desculpa, vamos seguir.",
		);
	});

	it("preserva a primeira ocorrência", () => {
		expect(semVocativoRepetido("Perfeito, Erik! Vamos lá.", "Erik")).toBe(
			"Perfeito, Erik! Vamos lá.",
		);
	});

	it("não mexe quando o nome aparece uma vez só", () => {
		const t = "Show! A cota do Itaú é sua melhor opção, Rafael.";
		expect(semVocativoRepetido(t, "Rafael")).toBe(t);
	});

	it("não mexe no nome usado DENTRO da frase (não é vocativo solto)", () => {
		const t = "Rafael, o consórcio do Rafael Silva é outro caso.";
		expect(semVocativoRepetido(t, "Rafael")).toBe(t);
	});

	it("sem nome de contato, devolve o texto intacto", () => {
		expect(semVocativoRepetido("Ótimo! Vamos seguir.", null)).toBe("Ótimo! Vamos seguir.");
	});
});

// A função pura acima só vale se estiver LIGADA no caminho por onde a fala
// realmente passa. Estes dois exercitam o filtro de stream — que é o que roda em
// produção — com o contexto que o `converse` monta.
describe("vocativo repetido no filtro de stream", () => {
	const contexto = () =>
		({
			contactName: "Rafael",
			hasReceivedDocuments: false,
			hasSearchToolCall: true,
		}) as never;

	it("a segunda chamada pelo nome não chega ao cliente", () => {
		const filtro = new EphemeralTextFilter(contexto);
		const saida = filtro.push("Ótimo, Rafael! Rafael, desculpa, vamos seguir. ") + filtro.flush();
		expect(saida.match(/Rafael/g)?.length).toBe(1);
		expect(saida).toContain("Desculpa");
	});

	it("uma chamada só passa intacta", () => {
		const filtro = new EphemeralTextFilter(contexto);
		const saida = filtro.push("Perfeito, Rafael! Vamos seguir. ") + filtro.flush();
		expect(saida).toContain("Perfeito, Rafael!");
		expect(saida).toContain("Vamos seguir");
	});
});
