// FIX-432 (D1) — SEM TELEFONE, SEM NÚMERO nos dois braços.
//
// A oferta vazava na FALA antes do telefone porque os NÚMEROS entravam no
// contexto do modelo sem condição de braço/telefone (`blocoOfertas`, `blocoTela`,
// `blocoOpcoesNaTela`…), e as tools de número seguiam no bind. Aqui se prova o
// fato que o servidor controla: com o desbloqueio pendente, NENHUMA mensagem de
// sistema do `converse` carrega carta/parcela/prazo das ofertas injetadas, e
// NENHUMA tool de número está vinculada ao modelo. O CONTROLE POSITIVO (telefone
// já conhecido) prova que o teste não é verde por vacuidade: os números e as
// tools VOLTAM quando o desbloqueio libera.
//
// A trava é de CONTEXTO, nunca de regex sobre a fala — a fala continua do modelo.
import { SystemMessage } from "@langchain/core/messages";
import { afterAll, describe, expect, it } from "vitest";
import { encryptIdentity } from "@/lib/conversation/identity";
import { buscaDoMock } from "../testing/grupos-do-mock";
import { limparCenario, runScenario } from "../testing/scenario";
import { modelosRoteirizados, type ScriptedChatModel } from "../testing/scripted-model";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** As tools que devolvem (ou desenham) número de oferta — a lista do B1. */
const TOOLS_DE_NUMERO = [
	"simulate_quota",
	"compare_with_financing",
	"compute_scenarios",
	"simulate_contemplation",
	"ajustar_por_parcela",
	"get_group_details",
	"get_rates",
	"present_simulation_result",
	"present_group_card",
	"present_comparison_table",
	"present_financing_comparison",
	"present_scenarios",
] as const;

/** Posição de funil pronta para a busca (`buscaDoMock(96)` ⇒ G171). */
const PRONTO_PRA_BUSCAR = {
	desireAsked: true,
	identityCollected: true,
	currentCategory: "auto" as const,
	experiencePrev: "returning" as const,
	recoConsentAnswered: true,
	simulatorOfferDispatched: true,
	qualifyAnswers: { creditMax: 180_000 },
};

const TURNO_DA_BUSCA = {
	user: "manda as opções",
	beats: [{ text: "Deixa eu ver o que eu tenho pra você." }],
};

/** Assinaturas numéricas do G171 (carta, parcela, prazo), em ambos os formatos
 * que os blocos usam (`maximumFractionDigits: 0` no converse, `2` no contexto). */
const NUMEROS_DO_G171 = [
	"170.000",
	"171.000",
	"171.043",
	"1.092",
	"1.093",
	"2.503",
	"3.066",
	"96 meses",
];

/** O telefone "já conhecido" da identidade cifrada — PII falsa. */
const IDENTIDADE_FALSA = { cpf: "52998224725", celular: "62999998888" };

function textosDosSistemas(modelo: ScriptedChatModel): string {
	return modelo.mensagensRecebidas
		.flat()
		.filter((m): m is SystemMessage => m instanceof SystemMessage)
		.map((m) => JSON.stringify(m.content))
		.join("\n");
}

describeIfDb("FIX-432 — sem telefone o modelo não recebe número da oferta", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	async function rodarBusca(extraMeta: Record<string, unknown>) {
		const indice = modelosRoteirizados.length;
		const resultado = await runScenario({
			channel: "web",
			busca: buscaDoMock(96),
			metaInicial: { ...PRONTO_PRA_BUSCAR, ...extraMeta } as never,
			turns: [TURNO_DA_BUSCA],
		});
		criadas.push(resultado.conversationId);
		const modelo = modelosRoteirizados[indice];
		if (!modelo) throw new Error("o cenário não criou o modelo roteirizado");
		return { resultado, modelo };
	}

	it("braço A sem lead: nenhum número e nenhuma tool de número no contexto", async () => {
		const { resultado, modelo } = await rodarBusca({ telefoneDoDesbloqueio: { variante: "A" } });

		// Prova de que a busca rodou: se não houvesse oferta, o teste seria vazio.
		expect(resultado.meta.revealCompleted).toBe(true);

		const sistemas = textosDosSistemas(modelo);
		for (const numero of NUMEROS_DO_G171) {
			expect(sistemas).not.toContain(numero);
		}
		for (const tool of TOOLS_DE_NUMERO) {
			expect(modelo.toolsVinculadas).not.toContain(tool);
		}
	});

	it("braço B sem lead: também não vê número de oferta", async () => {
		const { resultado, modelo } = await rodarBusca({ telefoneDoDesbloqueio: { variante: "B" } });

		expect(resultado.meta.revealCompleted).toBe(true);

		const sistemas = textosDosSistemas(modelo);
		for (const numero of NUMEROS_DO_G171) {
			expect(sistemas).not.toContain(numero);
		}
		for (const tool of TOOLS_DE_NUMERO) {
			expect(modelo.toolsVinculadas).not.toContain(tool);
		}
	});

	it("CONTROLE POSITIVO: com telefone no lead, números e tools voltam", async () => {
		const { resultado, modelo } = await rodarBusca({
			telefoneDoDesbloqueio: { variante: "A" },
			identityEnc: encryptIdentity(IDENTIDADE_FALSA),
		});

		expect(resultado.meta.revealCompleted).toBe(true);

		const sistemas = textosDosSistemas(modelo);
		expect(sistemas).toContain("170.000");
		expect(modelo.toolsVinculadas).toContain("simulate_quota");
		expect(modelo.toolsVinculadas).toContain("present_comparison_table");
	});
});
