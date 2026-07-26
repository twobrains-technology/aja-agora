// FIX-382 — "só posso pagar X por mês" é uma entrada legítima.
//
// Hoje o funil só entende VALOR DO BEM. Quem diz apenas a parcela que cabe no
// bolso fica preso no gate `credit` (e, na conversa real, ouvindo promessas de
// busca — a corrente do FIX-377/380). Mas a Bevi ACEITA buscar por parcela:
// `simulationType: "INSTALLMENT_VALUE"` (self-contract-client.ts:79) e o mapa
// `SIM_TYPE_MAP = { valor_total, valor_parcela }`
// (bevi-self-contract-proposal-gateway.ts:103). A capacidade existe ponta a
// ponta na integração; o funil é que nunca pediu.
//
// Decisão (Kairo, 2026-07-26): o caminho por parcela NÃO é o padrão. O funil
// segue pedindo o valor do bem; a busca por parcela só entra quando o cliente
// FALA em parcela. Este cenário trava exatamente essa condição.
import { afterAll, describe, expect, it } from "vitest";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Espiona os argumentos que chegam na busca — é o que prova qual pergunta foi
 * feita à administradora. */
function buscaEspia() {
	const chamadas: Array<Record<string, unknown>> = [];
	const busca = async (args: Record<string, unknown>) => {
		chamadas.push(args);
		return { groups: [] };
	};
	return { busca, chamadas };
}

describeIfDb("FIX-382 — cliente que só diz a parcela consegue ser atendido", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("busca pela PARCELA quando é só isso que o cliente deu", async () => {
		const { busca, chamadas } = buscaEspia();
		const r = await runScenario({
			busca: busca as never,
			metaInicial: {
				desireAsked: true,
				identityCollected: true,
				currentCategory: "auto" as const,
				// Sem `creditMax`: ele nunca disse o preço do carro, só o que cabe
				// no bolso. Valor realista de propósito — R$ 100 é o caso do
				// FIX-380 (faixa impossível), outro assunto.
				qualifyAnswers: { parcelaAlvo: 1_500 },
			},
			turns: [
				{
					user: "só consigo pagar uns 1500 por mês",
					beats: [{ text: "Boa, vamos ver o que cabe." }],
				},
			],
		});
		criadas.push(r.conversationId);

		// A busca TEM que sair — hoje o funil trava no gate `credit` e nunca chama.
		expect(chamadas.length).toBeGreaterThan(0);
		// E tem que perguntar pela parcela, não por um valor de bem que ninguém disse.
		expect(chamadas[0]?.parcelaAlvo).toBe(1_500);
		expect(chamadas[0]?.creditMax).toBeUndefined();
	});

	it("valor do bem continua sendo o caminho padrão", async () => {
		const { busca, chamadas } = buscaEspia();
		const r = await runScenario({
			busca: busca as never,
			metaInicial: {
				desireAsked: true,
				identityCollected: true,
				currentCategory: "auto" as const,
				qualifyAnswers: { creditMax: 180_000 },
			},
			turns: [{ user: "quero uns 180 mil", beats: [{ text: "Fechado." }] }],
		});
		criadas.push(r.conversationId);

		// Sem esta metade o fix poderia trocar o padrão do funil sem ninguém ver.
		expect(chamadas[0]?.creditMax).toBe(180_000);
		expect(chamadas[0]?.parcelaAlvo).toBeUndefined();
	});
});
