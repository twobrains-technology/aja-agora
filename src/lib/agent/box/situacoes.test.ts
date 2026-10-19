import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

// ── ESTE TESTE É HERMÉTICO: A CAIXA É O FALLBACK DO CÓDIGO ──
//
// `fetchManagedPrompt` prefere o prompt gerenciado (Langfuse) e cai no
// `SYSTEM_PROMPT` quando não há cliente. Aqui o cliente NÃO é criado de
// propósito:
//
//  1. o `.env.local` que o bootstrap gera aponta o Langfuse para a instância de
//     remoto compartilhado entre prod e dev — medido em 17/10/2026 — e um
//     teste unitário não deve depender de (nem exercitar) infra de produção;
//  2. o texto publicado é um ARTEFATO OPERACIONAL, versionado lá; o que o código
//     garante é que a seção existe no fallback e que o fato chega ao modelo.
//     Comparar com a versão publicada faria o teste quebrar por mudança de
//     conteúdo remoto, não por defeito no código.
//
// Na prática: em qualquer ambiente cujo Langfuse não responda, o agente usa este
// mesmo texto — então é ele que precisa estar certo.
process.env.LANGFUSE_PUBLIC_KEY = "";
process.env.LANGFUSE_SECRET_KEY = "";

import { limparCenarioPi, runScenarioPi } from "@/lib/agent/pi/testing/cenario";
import { buscaDoMock } from "@/lib/agent/pi/testing/grupos-do-mock";
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
/** Onde o CÓDIGO do turno vive hoje: o nó e o módulo de contexto que a extração
 * de 17/10/2026 separou dele. A conduta não pode voltar em NENHUM dos dois. */
const ARQUIVOS_DO_TURNO = [
	`${RAIZ}src/lib/agent/turn/contexto.ts`,
	`${RAIZ}src/lib/agent/pi/turno.ts`,
	`${RAIZ}src/lib/agent/pi/converse.ts`,
];

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
		it(`"${frase}" vive na caixa e NÃO no código do turno`, () => {
			expect(SYSTEM_PROMPT.toLowerCase()).toContain(frase.toLowerCase());
			// Mordida: colar a frase de volta no nó (ou no módulo de contexto, que
			// passou a montar o system prompt) deixa esta asserção vermelha na hora.
			for (const arquivo of ARQUIVOS_DO_TURNO) {
				expect(readFileSync(arquivo, "utf8").toLowerCase()).not.toContain(frase.toLowerCase());
			}
		});
	}
});

// ── Os dois turnos que o mandato nomeia ──
const criadas: string[] = [];
afterAll(async () => {
	for (const id of criadas) await limparCenarioPi(id);
});

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

	it("o ramo de apresentação passa pelo fato e não escreve conduta", () => {
		// Depois da extração de 17/10/2026, quem monta o system prompt do turno é
		// `turn-context.ts` — o guard segue a fonte, não o nome antigo do arquivo.
		const contexto = readFileSync(`${RAIZ}src/lib/agent/turn/contexto.ts`, "utf8");
		expect(contexto).toContain("fatoDeReveal(");
		expect(contexto).toContain("fatoDeFechamento(");
	});
});

describe("caixa — o turno de FECHAMENTO é governado por ela", () => {
	it("o sistema leva o FATO do fecho e a CONDUTA escrita na caixa", async () => {
		const r = await runScenarioPi({
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

		const sistema = r.sistema;
		expect(sistema).toContain("[situação: fechamento]");
		expect(sistema).toContain(
			"Nunca prometa prazo de contemplação nem diga que a cota está reservada",
		);
		// O fato diz O QUE está na tela; a conduta diz o que fazer com isso.
		expect(sistema).toMatch(/cards do fecho JÁ estão na tela/);
	});
});
