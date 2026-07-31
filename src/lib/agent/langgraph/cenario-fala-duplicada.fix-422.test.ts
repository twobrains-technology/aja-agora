// FIX-422 — o agente falava DUAS VEZES a mesma coisa no mesmo turno.
//
// Visto ao vivo (Kairo, 2026-07-30), no gate do valor do bem:
//
//   "Boa escolha, Corolla é sucesso de vendas! Com o valor de 90 mil já em
//    mente, posso buscar as melhores opções de consórcio pra você agora."
//        [Pode buscar]  [Quero ajustar o valor]
//   "Boa escolha, Corolla é sucesso de vendas! Bora achar as melhores opções
//    de consórcio de R$ 90 mil pra você. Uns R$ 90.000 então, é isso?"
//        [slider de valor]
//
// Dois balões, a mesma abertura palavra por palavra, cada um com o seu próprio
// controle. Para o cliente, o agente gagueja.
//
// ⚠️ A CAUSA É ESTRUTURAL, e é por isso que ela cabe aqui: NÃO é o modelo
// "resolvendo repetir". O `converse` roda um LOOP enquanto a resposta trouxer
// tool_calls (`if (!aiMessage.tool_calls?.length) break`). Uma tool de
// APRESENTAÇÃO (`present_*`) só desenha um card — não traz informação nova pro
// modelo comentar —, mas mesmo assim devolve ToolMessage, o loop dá outra volta
// e o modelo fala de novo, do mesmo contexto. Qualquer modelo faz isso; o Haiku
// só o fez de forma mais literal.
//
// Por isso o roteiro abaixo é honesto: ele não "planta" a duplicação escrevendo
// dois textos iguais de propósito — ele reproduz a MECÂNICA (falar + chamar uma
// tool de apresentação) e deixa o grafo decidir se pede uma segunda fala. É a
// existência do segundo bloco de texto que o teste trava, não o conteúdo dele.
//
// A correção: depois de uma tool que só APRESENTA, o turno se encerra. O card é
// a resposta. Tool de DADO (simulate_quota, get_rates) continua pedindo a fala
// seguinte — é ela que traz número novo pro agente explicar.
import { afterAll, describe, expect, it } from "vitest";
import { pedeFalaDepoisDasTools } from "./nodes/converse";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Funil no gate `credit`: categoria e nome resolvidos, valor ainda não. É
 * exatamente onde o defeito apareceu. */
const NO_GATE_CREDIT = {
	currentPersona: "auto" as const,
	currentCategory: "auto" as const,
	desireAsked: true,
	desireAnswered: true,
	qualifyAnswers: { desiredItem: "Corolla" },
};

function blocosDeTexto(trilha: string[]): number {
	return trilha.filter((t) => t === "text").length;
}

describeIfDb("FIX-422 — uma tool de apresentação não pede uma segunda fala", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("modelo fala + oferece atalhos → UM balão de texto no turno", async () => {
		const r = await runScenario({
			metaInicial: NO_GATE_CREDIT,
			turns: [
				{
					user: "um Corolla",
					beats: [
						{
							text: "Boa escolha, Corolla é sucesso de vendas! Posso buscar as opções agora.",
							toolCalls: [
								{
									name: "present_quick_reply",
									args: {
										options: [{ label: "Pode buscar" }, { label: "Quero ajustar o valor" }],
									},
								},
							],
						},
						// O beat que o LOOP consumiria. Se o turno pedir esta fala, ela sai —
						// e é justamente ela que o cliente leu como gagueira. Deixá-la no
						// roteiro é o que dá ao teste o poder de falhar.
						{ text: "Boa escolha, Corolla é sucesso de vendas! Bora achar as opções." },
					],
				},
			],
		});
		criadas.push(r.conversationId);

		const turno = r.turns[0];
		// Sentinela: sem os atalhos na tela o cenário não exercitou nada, e o
		// `toBe(1)` abaixo passaria por vacuidade.
		expect(turno.artifacts, "o turno precisa ter emitido os atalhos").toContain("quick_reply");
		expect(
			blocosDeTexto(turno.trilha),
			`o agente falou ${blocosDeTexto(turno.trilha)}x no mesmo turno — trilha: ${turno.trilha.join(" → ")}`,
		).toBe(1);
	});

});

/** A OUTRA METADE — a que impede o fix de virar "o agente emudece".
 *
 * Testada na função pura, e não por cenário, de propósito: exercitar
 * `simulate_quota` de verdade exigiria a Bevi (a 1ª versão deste arquivo tentou
 * e o cenário caiu em `text → gate:lance`, sem tocar a tool — teste que não
 * exercita o caminho não prova nada). A decisão INTEIRA mora nesta função, então
 * é aqui que ela se prova. */
describe("FIX-422 — quem pede a fala seguinte é a tool de DADO, não a de card", () => {
	it("tool de dado devolve número novo → o agente precisa explicar", () => {
		expect(pedeFalaDepoisDasTools(["simulate_quota"])).toBe(true);
		expect(pedeFalaDepoisDasTools(["get_rates"])).toBe(true);
		expect(pedeFalaDepoisDasTools(["compare_with_financing"])).toBe(true);
	});

	it("só cards → o card É a resposta, o turno fecha", () => {
		expect(pedeFalaDepoisDasTools(["present_quick_reply"])).toBe(false);
		expect(pedeFalaDepoisDasTools(["present_comparison_table", "present_quick_reply"])).toBe(false);
	});

	it("misturou dado com card → a fala sai, senão o número fica sem explicação", () => {
		expect(pedeFalaDepoisDasTools(["present_simulation_result", "simulate_quota"])).toBe(true);
	});

	it("nenhuma tool → não há loop pra continuar", () => {
		expect(pedeFalaDepoisDasTools([])).toBe(false);
	});
});
