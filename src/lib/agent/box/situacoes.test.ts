import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { buscaDoMock } from "@/lib/agent/langgraph/testing/grupos-do-mock";
import { limparCenario, runScenario } from "@/lib/agent/langgraph/testing/scenario";
import { modelosRoteirizados } from "@/lib/agent/langgraph/testing/scripted-model";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { blocoDeSituacoes, fatoDeReveal, SITUACAO_KEYS } from "./situacoes";

/**
 * A CAIXA GOVERNA A CONDUTA — contrato da fase 2 da campanha do motor-pi.
 *
 * O defeito que estes testes impedem de voltar: a caixa de prompt (Langfuse,
 * efeito ≤60s, sem deploy) existia e NÃO governava. Vinte e dois blocos de
 * conduta montados em `converse.ts` vinham DEPOIS dela e venciam — mudar como o
 * agente fala exigia engenheiro e deploy.
 *
 * O corte agora é: FATO em código (`box/situacoes.ts`), CONDUTA na caixa
 * (`SYSTEM_PROMPT`, e em produção o prompt gerenciado `aja-system-prompt`).
 *
 * Os três testes abaixo cobram o contrato por três ângulos diferentes:
 *  1. toda chave de situação tem seção na caixa (senão o fato chega sem conduta);
 *  2. o texto migrado SAIU do código — reintroduzir uma conduta em `converse.ts`
 *     (ou em qualquer arquivo de `src/` que não seja a caixa) deixa vermelho;
 *  3. o system prompt que o MODELO recebe carrega a conduta da caixa, provado no
 *     turno real de reveal e no de fechamento — os dois que o mandato nomeia.
 */

const RAIZ = new URL("../../../../", import.meta.url).pathname;

/** Frases de CONDUTA que saíram de `converse.ts` e agora só existem na caixa.
 * A lista é a memória do que já foi migrado: cada bloco migrado acrescenta uma
 * linha aqui, e é isso que impede a conduta de voltar pro código. */
const CONDUTA_MIGRADA = [
	"Termine SEM pergunta",
	"não peça pra ele clicar em botão nenhum",
	"motivo não vende",
	"te explico no caminho",
	"fale como quem fala ao telefone",
	"trate esta retomada como se a jornada",
];

describe("caixa — toda situação tem conduta escrita nela", () => {
	for (const chave of SITUACAO_KEYS) {
		it(`a caixa tem a seção "### ${chave}"`, () => {
			expect(SYSTEM_PROMPT).toContain(`### ${chave}`);
		});
	}
});

describe("caixa — a conduta saiu do código", () => {
	for (const frase of CONDUTA_MIGRADA) {
		it(`"${frase}" vive na caixa e NÃO em converse.ts`, () => {
			const converse = readFileSync(
				`${RAIZ}src/lib/agent/langgraph/nodes/converse.ts`,
				"utf8",
			).toLowerCase();
			expect(SYSTEM_PROMPT.toLowerCase()).toContain(frase.toLowerCase());
			// Mordida: colar a frase de volta em converse.ts (como era antes da
			// migração) deixa esta asserção vermelha na hora.
			expect(converse).not.toContain(frase.toLowerCase());
		});
	}
});

// ── Os dois turnos que o mandato nomeia ──
const criadas: string[] = [];
afterAll(async () => {
	for (const id of criadas) await limparCenario(id);
});

/** O texto que o modelo recebeu na última chamada, achatado (as mensagens de
 * sistema vão em blocos `{type:"text"}`). */
function systemRecebidoPeloModelo(): string {
	const modelo = modelosRoteirizados.at(-1);
	const chamadas = modelo?.mensagensRecebidas ?? [];
	const ultima = chamadas.at(-1) ?? [];
	const sistema = ultima.find((m) => m._getType() === "system");
	if (!sistema) return "";
	const conteudo = sistema.content;
	if (typeof conteudo === "string") return conteudo;
	return conteudo
		.map((b) => (typeof b === "object" && b !== null && "text" in b ? String(b.text) : ""))
		.join("\n");
}

describe("caixa — o turno de REVEAL recebe só o FATO, e a conduta vem dela", () => {
	// O turno de apresentação (`converse.ts`, ramo de `turnoDeApresentacao`) NÃO
	// carrega mais uma frase de conduta sequer: ele leva o fato `reveal` e nada
	// mais. Editar a seção "### reveal" da caixa muda o que o modelo lê naquele
	// turno, sem deploy — e o guard do teste acima já impede a conduta de voltar
	// para o código.
	it("o fato do reveal descreve o ESTADO e não instrui o modelo", () => {
		const recomendando = blocoDeSituacoes([
			fatoDeReveal({ recomendada: true, administradora: "CANOPUS", valor: 119_500 }),
		]);
		expect(recomendando).toContain("[situação: reveal]");
		expect(recomendando).toContain("CANOPUS");
		expect(recomendando).toContain("RECOMENDANDO");
		// Nada de imperativo: "termine", "diga", "não peça" não pertencem ao fato.
		expect(recomendando?.toLowerCase()).not.toMatch(/termine|não peça|você deve/);
	});

	it("o ramo de apresentação do converse passa pelo fato e não escreve conduta", () => {
		const converse = readFileSync(`${RAIZ}src/lib/agent/langgraph/nodes/converse.ts`, "utf8");
		expect(converse).toContain("fatoDeReveal(");
		expect(converse).toContain("fatoDeFechamento(");
	});
});

describe("caixa — o turno de FECHAMENTO é governado por ela", () => {
	it("o sistema leva o FATO do fecho e a CONDUTA escrita na caixa", async () => {
		const r = await runScenario({
			turns: [{ user: "e agora?", beats: [{ text: "Tá tudo certo por aqui." }] }],
			metaInicial: {
				contractClosed: true,
				currentCategory: "auto",
				qualifyAnswers: { creditMax: 120_000 },
				identityCollected: true,
			} as never,
			telefone: "11999998888",
			contactName: "Cliente",
			busca: buscaDoMock(),
		});
		criadas.push(r.conversationId);

		const sistema = systemRecebidoPeloModelo();
		expect(sistema).toContain("[situação: fechamento]");
		expect(sistema).toContain(
			"Nunca prometa prazo de contemplação nem diga que a cota está reservada",
		);
		// O fato diz O QUE está na tela; a conduta diz o que fazer com isso.
		expect(sistema).toMatch(/cards do fecho JÁ estão na tela/);
	});
});
