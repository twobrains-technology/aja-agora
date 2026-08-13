// As tools enxergam o que o turno ACABOU de apurar — sem parar de exigir que a
// cota tenha sido exibida de verdade.
//
// Produção 2026-08-13, sessão `ff8f2080`: no turno da busca, o `discovery`
// achou os grupos e escreveu a oferta no ESTADO DO GRAFO. As tools, porém, leem
// a oferta do BANCO (`reloadMeta`), e o `persist` — que grava — é o ÚLTIMO nó do
// turno. Nessa janela as duas fontes discordam, e o modelo levou duas recusas
// falsas seguidas: `ajustar_por_parcela` respondeu "[Sem oferta ancorada nesta
// conversa]" e `simulate_quota`, "o grupo não foi exibido em tela". Elas
// consumiram três das quatro chamadas de modelo do turno, e o cliente recebeu
// "Um instante." com cinco cards e nenhuma condução.
//
// O conserto NÃO é afrouxar o guard: é dar às tools a mesma fonte que o nó de
// conversa já usa — o estado do turno. A distinção que sustenta isso é
// assimétrica, e o terceiro teste é quem a trava:
//
//   • LER/SIMULAR sobre um grupo que o SERVIDOR apurou e vai exibir neste mesmo
//     turno é legítimo — o cliente vai vê-lo, e o próprio contexto do modelo já
//     manda simular com esse id;
//   • ANCORAR ESCOLHA continua exigindo o banco (`escolher_cota` fica de fora
//     de propósito): no turno da descoberta a fala do cliente veio ANTES de os
//     cards existirem, então ele não pode ter escolhido o que ainda não viu.
//
// E o que o FIX-179/180 protege segue protegido: o id só entra pela porta nova
// se veio do `discovery` (dado do servidor). Id que o MODELO inventou continua
// batendo na trava — é o que o último teste prova.
// As três rodam contra a tool REAL (`execute` de verdade, guard de verdade,
// `loadShownGroups` batendo no banco); o que se injeta é só o estado do turno —
// que é exatamente a peça em teste. O efeito no FUNIL de um ajuste de parcela
// tem cenário próprio, em `cenario-faixa-so-reposiciona-com-oferta-vista`.
import { describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("tools leem o estado do turno, não só o banco", () => {
	it("ajustar_por_parcela CALCULA no turno da descoberta, em vez de recusar", async () => {
		const { buildConsorcioTools } = await import("@/lib/agent/tools/ai-sdk");
		const tools = buildConsorcioTools({
			conversationId: crypto.randomUUID(),
			// A oferta que o `discovery` acabou de apurar — ela existe no estado do
			// grafo e ainda NÃO no banco. Era exatamente aqui que a tool recusava.
			metaDoTurno: {
				recommendedOffer: {
					administradora: "CANOPUS",
					creditValue: 119_500,
					monthlyPayment: 1_092,
					termMonths: 96,
				},
			} as never,
		});
		const r = (await tools.ajustar_por_parcela.execute?.(
			{ parcelaDesejada: 800 },
			{ toolCallId: "t0", messages: [] },
		)) as { error?: string; creditoAlvo?: number };

		expect(r?.error).toBeUndefined();
		// 119.500 × (800 / 1.092) ≈ 87.545 — o crédito que a parcela dele paga.
		expect(r?.creditoAlvo).toBeGreaterThan(80_000);
		expect(r?.creditoAlvo).toBeLessThan(95_000);
	});

	// As duas metades do guard de exibição, exercitadas na própria tool: o
	// `simulate_quota` CALCULA (quem desenha é `present_simulation_result`), então
	// o que prova a mudança é o retorno dele, não um card na tela.
	it("simulate_quota aceita o grupo que ESTE turno colocou na tela", async () => {
		const { buildConsorcioTools } = await import("@/lib/agent/tools/ai-sdk");
		const tools = buildConsorcioTools({
			conversationId: crypto.randomUUID(),
			artifactsDoTurno: [
				{
					type: "comparison_table",
					payload: { groups: [{ id: "grupo-do-turno", administradora: "CANOPUS" }] },
				},
			],
		});
		const r = (await tools.simulate_quota.execute?.(
			{ groupId: "grupo-do-turno", creditValue: 119_500 },
			{ toolCallId: "t1", messages: [] },
		)) as { error?: string };

		// O guard não pode mais recusar: o grupo veio da busca DESTE turno. A
		// chamada pode falhar adiante (a Bevi não responde em teste) — o que este
		// teste trava é a recusa por "não foi exibido".
		expect(r?.error ?? "").not.toContain("nao foi exibido em tela");
	});

	it("id que o MODELO inventou continua barrado (FIX-180 intacto)", async () => {
		const { buildConsorcioTools } = await import("@/lib/agent/tools/ai-sdk");
		const tools = buildConsorcioTools({
			conversationId: crypto.randomUUID(),
			// O turno mostrou UM grupo; o modelo pede outro, que ninguém viu.
			artifactsDoTurno: [
				{
					type: "comparison_table",
					payload: { groups: [{ id: "grupo-do-turno", administradora: "CANOPUS" }] },
				},
			],
		});
		const r = (await tools.simulate_quota.execute?.(
			{ groupId: "grupo-que-ninguem-viu-999", creditValue: 119_500 },
			{ toolCallId: "t2", messages: [] },
		)) as { error?: string };

		// Sem este teste, o seed pode degradar para "qualquer grupo da Bevi" e
		// ninguém percebe — que é exatamente a porta que o FIX-180 fechou.
		expect(r?.error ?? "").toContain("nao foi exibido em tela");
	});
});
