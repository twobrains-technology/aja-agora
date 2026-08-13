// FIX-431 — a tool que não existe no toolset da fase vira "problema técnico" na
// cara do cliente, e nenhum sinal acusa.
//
// Visto em PRODUÇÃO, WhatsApp, 2026-08-13 (duas sessões seguidas do mesmo
// número). Trace `f83ff29acd103b12401baaea055f4910`, sessão
// `a68b1945-a7de-48e5-849d-5e35c18a4c8d`, 02:54 — o modelo chamou `search_groups`
// (que a tool-policy retira até `identityCollected`), e o `ToolNode` devolveu:
//
//     Error: Tool "search_groups" not found.
//      Please fix your mistakes.
//
// O modelo LEU esse texto e traduziu pro cliente: "Infelizmente tive um problema
// na busca" → "tive um problema técnico, mas já está resolvido" → "Tá tendo um
// problema aqui comigo, deixa eu chamar o nosso time de suporte" → handoff. A
// venda de um BYD Song de R$ 238 mil morreu ali. Na sessão seguinte
// (`04fda013`, trace `5b616a0b6804def96ddadebdded573b6`, 02:57) a MESMA falha
// levou o agente a pedir CPF por texto no WhatsApp — o que o directive proíbe.
//
// E o painel ficou verde: `judge_resolved`=1, `judge_avancou`=1,
// `judge_hallucination`=0, `tools_chamadas`=1 (contou a tool que não existe como
// se tivesse rodado), observation em `level=DEFAULT`. O único `ERROR` do trace
// era o `GraphInterrupt`, que é fluxo normal.
//
// Duas coisas faltavam, e as duas são FATO do servidor (não fala do modelo):
//   1. o erro cru vai pro contexto do modelo sem NENHUMA orientação de conduta;
//   2. a falha não vira sinal — não há score, não há como alertar.
//
// Este teste amarra as duas. Não mede a frase do agente (isso é Langfuse, não
// regex — CLAUDE.md): mede a mensagem que o SERVIDOR devolve ao modelo e o
// score que o SERVIDOR emite.
import { ToolMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import {
	lerFalhaDeTool,
	orientarSobreToolAusente,
	reescreverToolMessagesComFalha,
	TOOL_AUSENTE_MARCADOR,
} from "./tool-falha";

/** A ToolMessage EXATA que o ToolNode monta pra tool desconhecida
 *  (node_modules/@langchain/langgraph/dist/prebuilt/tool_node.js:194 e :217). */
function toolMessageDeProducao(): ToolMessage {
	return new ToolMessage({
		status: "error",
		content: 'Error: Tool "search_groups" not found.\n Please fix your mistakes.',
		name: "search_groups",
		tool_call_id: "toolu_015T81bcYKBGtnGXVbPPvFAQ",
	});
}

describe("falha de tool — leitura", () => {
	it("reconhece a tool AUSENTE do toolset (caso de prod, trace f83ff29)", () => {
		const falha = lerFalhaDeTool(toolMessageDeProducao());
		expect(falha).toEqual({
			tool: "search_groups",
			tipo: "ausente",
			mensagem: 'Error: Tool "search_groups" not found.\n Please fix your mistakes.',
		});
	});

	it("distingue tool que EXISTE e estourou de tool que não existe", () => {
		const falha = lerFalhaDeTool(
			new ToolMessage({
				status: "error",
				content: "Error: IdentityNotCollectedError: a Bevi exige CPF\n Please fix your mistakes.",
				name: "recommend_groups",
				tool_call_id: "toolu_x",
			}),
		);
		expect(falha?.tipo).toBe("erro");
		expect(falha?.tool).toBe("recommend_groups");
	});

	it("tool que rodou não é falha", () => {
		const ok = new ToolMessage({
			status: "success",
			content: JSON.stringify({ recommendations: [] }),
			name: "recommend_groups",
			tool_call_id: "toolu_y",
		});
		expect(lerFalhaDeTool(ok)).toBeNull();
	});
});

describe("falha de tool — o que o modelo recebe de volta", () => {
	it("troca o erro cru por orientação de conduta, mantendo o tool_call_id", () => {
		const original = toolMessageDeProducao();
		const { mensagens, falhas } = reescreverToolMessagesComFalha([original]);

		expect(falhas).toHaveLength(1);
		expect(mensagens).toHaveLength(1);

		const corrigida = mensagens[0] as ToolMessage;
		// O par tool_use/tool_result é contrato da API — quebrar o id derruba o turno.
		expect(corrigida.tool_call_id).toBe("toolu_015T81bcYKBGtnGXVbPPvFAQ");
		expect(corrigida.name).toBe("search_groups");

		const texto = String(corrigida.content);
		// O erro cru some: é ele que o modelo estava traduzindo como "problema técnico".
		expect(texto).not.toContain("Please fix your mistakes");
		expect(texto).not.toContain("not found");
		// E entra instrução de CONDUTA ancorada no fato (a tool não está nesta fase).
		expect(texto).toContain(TOOL_AUSENTE_MARCADOR);
		expect(texto.toLowerCase()).toContain("não diga");
	});

	it("não mexe em ToolMessage de sucesso", () => {
		const ok = new ToolMessage({
			status: "success",
			content: "[Simulacao apresentada]",
			name: "present_simulation_result",
			tool_call_id: "toolu_z",
		});
		const { mensagens, falhas } = reescreverToolMessagesComFalha([ok]);
		expect(falhas).toEqual([]);
		expect(mensagens[0]).toBe(ok);
	});
});

// FIX-431 (P1 #12) — a orientação tem que saber ONDE a conversa está.
//
// O texto único ("conduza para a próxima informação que você ainda precisa do
// cliente") é certo antes da busca e ERRADO depois dela: com a oferta já
// ancorada e os cards na tela, mandar o agente coletar dado é fazê-lo repetir
// pergunta que o cliente já respondeu — que é o segundo defeito mais caro desta
// investigação (funil andando pra trás, sessão `04fda013`).
describe("orientação sensível ao estado", () => {
	it("antes da busca: manda conduzir a coleta", () => {
		const t = orientarSobreToolAusente("search_groups", { buscaJaFeita: false });
		expect(t.toLowerCase()).toMatch(/precisa|coleta|conduz/);
		expect(t.toLowerCase()).not.toMatch(/já est(ão|a) na tela/);
	});

	it("depois da busca: manda apresentar o que já está na tela", () => {
		const t = orientarSobreToolAusente("search_groups", { buscaJaFeita: true });
		expect(t.toLowerCase()).toMatch(/já est(ão|á) na tela|já apareceram/);
		expect(t.toLowerCase()).not.toMatch(/pe(ç|c)a os dados|coletar/);
	});

	// O que não muda com o estado: nunca vender defeito técnico ao cliente.
	it("nos dois casos, proíbe anunciar problema técnico", () => {
		for (const buscaJaFeita of [true, false]) {
			const t = orientarSobreToolAusente("search_groups", { buscaJaFeita }).toLowerCase();
			expect(t).toMatch(/n[ãa]o diga que houve problema/);
		}
	});

	it("sem contexto, mantém o comportamento anterior (compatível)", () => {
		expect(orientarSobreToolAusente("search_groups")).toContain(TOOL_AUSENTE_MARCADOR);
	});
});
