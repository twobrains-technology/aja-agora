// FIX-387 — o aceite do cliente não pode depender de ele usar UMA das palavras
// da nossa lista.
//
// Rodada 2026-07-29, teste manual do Bernardo em ajaagora.com.br (print
// `2807-1607-bernardo-06-nao-apresentou-carta-1-milhao.jpg`, grupo AJA AGORA +
// Twobrains, 28/07 16:07):
//
//   agente → "Se você quer R$ 700 mil no final, a gente precisa buscar uma
//             carta MAIOR — tipo R$ 1 milhão. Faz sentido pra você?"
//   cliente → "faz sentido"
//   agente → "Perfeito! Vamos confirmar seu plano — Administradora: ITAÚ"
//             …com a MESMA carta de R$ 721 mil.
//
// O cliente concordou com uma proposta que o agente nunca foi buscar. Root
// cause: `YES_TEXT_MARKERS` é uma lista fechada de palavras
// (sim|quero|pode|bora|beleza|claro|certo|ok…) e "faz sentido" não está nela.
// Sem match de SIM e sem "não", `detectYesNoText` devolve `null`, o bloco de
// aceite do gate `lance-embutido` (advance.ts:177) é PULADO, `creditMax` nunca
// vira `bem / (1 - pct)` e a busca continua na faixa antiga.
//
// ⚠️ HISTÓRICO DESTA CORREÇÃO — leia antes de "melhorar" de novo.
//
// A 1ª versão evitava mexer na lista e fazia o aceite vir do `intent` do
// analyzer: `ready_to_proceed` + ausência da palavra "não" = SIM. Parecia mais
// elegante ("entender a fala é do modelo") e era ERRADA. Revisão independente
// mediu com o analyzer real: "de jeito nenhum", "nem pensar", "jamais",
// "prefiro usar só o meu dinheiro", "achei caro", "fora do meu orçamento" — todas
// voltam `ready_to_proceed`, nenhuma contém "não", todas viravam ACEITE. No gate
// do embutido isso comprava uma carta 43% maior pra quem havia recusado.
//
// A lição: o lado NEGATIVO é uma palavra só, e o espaço de recusas sem ela é
// aberto. Então a assimetria só se sustenta pelo lado POSITIVO — afirmação
// reconhecida vira SIM, e todo o resto fica indefinido, o que faz o gate
// perguntar de novo. Ampliar a lista de afirmações é trabalho incremental, e é o
// certo: cada entrada é inequívoca. A regra em bloco apostava no infinito.
// Assimetria de advance.ts:159-163: errar pra menos devolve a pergunta, errar
// pra mais vende diferente do combinado.
import { describe, expect, it } from "vitest";
import { detectYesNoText } from "./yes-no";

describe("FIX-387 — aceite vem do intent do analyzer, não da lista de palavras", () => {
	it("'faz sentido' com intent ready_to_proceed é ACEITE (as palavras do Bernardo)", () => {
		expect(detectYesNoText("faz sentido", "ready_to_proceed")).toBe(true);
	});

	it.each([
		"faz sentido",
		"faz total sentido",
		"por mim tá ótimo",
		"concordo",
		"é isso aí",
		"perfeito",
		"combinado",
		// "acho bom" e "melhor assim" SAÍRAM do léxico no FIX-399: casavam por
		// acidente em "não sei, acho bom pensar mais" e "preciso de um prazo melhor
		// assim que der", que não são aceite de nada.
	])("afirmação natural agora reconhecida como aceite: %s", (fala) => {
		expect(detectYesNoText(fala, "ready_to_proceed")).toBe(true);
	});

	// ── A assimetria que protege o cliente (advance.ts:159-163) ──

	it("'não' EXPLÍCITO vence o intent — nunca vende o que foi recusado", () => {
		expect(detectYesNoText("não, prefiro sem embutido", "ready_to_proceed")).toBe(false);
		expect(detectYesNoText("nao faz sentido pra mim", "ready_to_proceed")).toBe(false);
	});

	it("SIM antes de NÃO na mesma frase continua governando pela ordem", () => {
		// Regra pré-existente (yes-no.ts:34-38) — não pode regredir.
		expect(detectYesNoText("não sei, pode mostrar sim", "ready_to_proceed")).toBe(true);
		expect(detectYesNoText("não quero", "ready_to_proceed")).toBe(false);
	});

	it("sem palavra de SIM, segue INDEFINIDO (pergunta de novo)", () => {
		// O oposto do bug: não inferir aceite de texto que não afirma nada. Errar
		// pra mais é o erro caro.
		expect(detectYesNoText("hmm", "providing_info")).toBeNull();
		expect(detectYesNoText("depende", "expressing_doubt")).toBeNull();
		expect(detectYesNoText("sei lá", "neutral")).toBeNull();
	});

	// ── FIX-395b — o caso que derrubou a primeira versão deste fix ──
	//
	// A 1ª tentativa fazia `intent === "ready_to_proceed"` valer como SIM sempre
	// que o texto não tivesse a palavra "não". Revisão independente mediu com o
	// analyzer real: TODAS as falas abaixo voltam como `ready_to_proceed`, nenhuma
	// contém "não", e todas viravam ACEITE — no gate do embutido isso comprava uma
	// carta 43% maior pra quem tinha acabado de recusar.
	//
	// Recusa sem a palavra "não" tem que ficar INDEFINIDA (o gate pergunta de
	// novo), nunca virar aceite. É a assimetria do produto: errar pra menos
	// devolve a pergunta, errar pra mais vende diferente do combinado.
	it.each([
		"prefiro usar só o meu dinheiro",
		"de jeito nenhum",
		"nem pensar",
		"jamais",
		"achei caro",
		"fora do meu orçamento",
		"deixa pra outra vez",
		"tô com medo de me endividar",
	])("recusa SEM a palavra 'não' nunca vira aceite: %s", (fala) => {
		// Com o rótulo errado (`ready_to_proceed`) o melhor possível é INDEFINIDO —
		// o gate reabre em vez de vender. É o piso de segurança.
		expect(detectYesNoText(fala, "ready_to_proceed")).not.toBe(true);
	});

	// ── FIX-396 — a causa-raiz: recusa ganhou rótulo próprio ──
	//
	// O enum de `userIntent` não tinha onde pôr "não quero". O analyzer media a
	// fala certa (extraía `hasLance: no`) e rotulava `ready_to_proceed`, porque
	// "recusar é decidir, e decidir avança o funil" — 3/3 no Haiku real. A
	// instrução que dizia "recusa é a resposta negativa" apontava pra um valor que
	// não existia: instrução morta.
	//
	// Com `declines`, a negativa deixa de ser ausência de sinal e passa a ser DADO:
	// o gate fecha de uma vez, que é o que o cliente pediu.
	it.each([
		"prefiro usar só o meu dinheiro",
		"de jeito nenhum",
		"nem pensar",
		"achei caro",
		"fora do meu orçamento",
		"deixa pra outra vez",
	])("recusa rotulada como 'declines' é NÃO, mesmo sem a palavra: %s", (fala) => {
		expect(detectYesNoText(fala, "declines")).toBe(false);
	});

	it("'declines' vence até palavra de SIM no texto (o rótulo é do modelo, e ele viu a fala inteira)", () => {
		// "pode ser que sim, mas não agora" — o modelo classificou como recusa; não
		// cabe ao servidor reinterpretar por regex e vender.
		expect(detectYesNoText("pode ser que sim, mas fica pra depois", "declines")).toBe(false);
		expect(detectYesNoText("claro, mas não é pra mim", "declines")).toBe(false);
	});

	it("afirmação reconhecida vale com qualquer intent de resposta — é léxico, não rótulo", () => {
		// Depois do FIX-395b o SIM vem da LISTA, não do rótulo do analyzer: então
		// "faz sentido" afirma mesmo quando o intent vem `neutral` (que é o que o
		// Haiku devolve em ~1/3 das vezes pra "perfeito", medido na sonda).
		expect(detectYesNoText("faz sentido", "neutral")).toBe(true);
		expect(detectYesNoText("concordo", "providing_info")).toBe(true);
	});

	it("intents que NÃO são resposta continuam devolvendo null mesmo com palavra de SIM", () => {
		// Regra pré-existente (yes-no.ts:16-24) — pergunta não é aceite.
		expect(detectYesNoText("pode explicar melhor?", "asking_question")).toBeNull();
		expect(detectYesNoText("quero ver mais opções", "wants_more_options")).toBeNull();
		expect(detectYesNoText("claro, mas não entendi", "confused")).toBeNull();
	});

	it("a lista de palavras continua funcionando com intent neutro (não regride)", () => {
		expect(detectYesNoText("isso, quero sim o lance embutido", "neutral")).toBe(true);
		expect(detectYesNoText("beleza", "neutral")).toBe(true);
		expect(detectYesNoText("não, deixa", "neutral")).toBe(false);
	});

	// ── FIX-399 — a 2ª revisão reabriu o P0 por outra porta ──
	//
	// Ampliar o léxico consertou "faz sentido" e abriu três buracos, todos medidos
	// no grafo real (as três primeiras falas compravam carta de 700k → 1M):
	//
	// 1. ADVERSATIVA — "perfeito, MAS achei caro" casava o SIM e ignorava a
	//    objeção que vem depois. O que vale numa frase com "mas" é o que vem
	//    DEPOIS do "mas": é ali que está a posição do cliente.
	// 2. HESITAÇÃO CONDICIONAL — o strip pré-existente de "não sei" (que serve pra
	//    "não sei, pode mostrar sim") passou a alimentar as palavras novas:
	//    "não sei SE faz sentido" virava aceite.
	// 3. LÉXICO FROUXO — eu tinha posto "fechado", "acho bom" e "melhor assim" na
	//    lista. "o grupo já está fechado" e "preciso de um prazo melhor assim que
	//    der" não são aceites de nada; são frases que por acaso contêm as palavras.
	//
	// A regra que sobra é a mesma de sempre: só afirmação inequívoca é SIM.
	describe("FIX-399 — afirmação com ressalva não é aceite", () => {
		it.each([
			"não sei se faz sentido",
			"não sei se concordo",
			"não sei, acho bom pensar mais",
			"seria perfeito se a parcela fosse menor",
			"o grupo já está fechado",
			"preciso de um prazo melhor assim que der",
			"perfeito, mas achei caro",
		])("nunca vira aceite: %s", (fala) => {
			expect(detectYesNoText(fala, "ready_to_proceed")).not.toBe(true);
		});

		// ── FIX-399d — a adversativa DERRUBA um sim, nunca CRIA um ──
		//
		// A 1ª versão desta regra avaliava recursivamente só a oração depois do
		// "mas" — e com isso a segunda metade podia CRIAR um aceite. Terceira
		// revisão independente mediu no grafo real, fixture do Bernardo:
		//
		//   "não quero usar o embutido, mas quero ver as opções"
		//     → HEAD: false · minha versão: TRUE · lanceEmbutido=true · carta 1.000.000
		//
		// Carta 43% maior pra quem acabou de recusar o mecanismo. Era o TERCEIRO P0
		// da mesma família nesta sessão, e o meu teste da adversativa cobria só
		// `SIM→mas→não` e `dúvida→mas→SIM`: nenhum caso `NÃO→mas→SIM`. Padrão a não
		// repetir — testar a direção que o guard deve BARRAR, não a que ele libera.
		//
		// A regra que sobra: a oração final só pode REBAIXAR. Recusa antes do "mas"
		// vence; afirmação depois do "mas" não promove um indefinido. Perder um
		// "tava em dúvida, mas concordo" custa uma pergunta repetida; ganhar um falso
		// aceite custa uma carta de R$ 1 milhão.
		it.each([
			"não quero usar o embutido, mas quero ver as opções",
			"prefiro não usar o embutido, mas pode mostrar o que tem",
			"não vou usar embutido, mas bora seguir",
			"não, mas faz sentido",
		])("recusa ANTES da adversativa vence: %s", (fala) => {
			expect(detectYesNoText(fala, "ready_to_proceed")).toBe(false);
		});

		it("recusa DEPOIS da adversativa derruba o sim", () => {
			expect(detectYesNoText("faz sentido, mas não quero", "ready_to_proceed")).toBe(false);
			expect(detectYesNoText("claro, mas não é pra mim", "ready_to_proceed")).toBe(false);
			expect(detectYesNoText("entendi, porém não agora", "ready_to_proceed")).toBe(false);
		});

		it.each([
			"tava em dúvida, mas concordo",
			"concordo, mas",
			"quero, contudo",
			"faz sentido, mas achei caro, mas pode ser",
			"faz sentido, mas achei caro, mas se der desconto eu topo",
		])("oração final não PROMOVE — fica indefinido: %s", (fala) => {
			expect(detectYesNoText(fala, "ready_to_proceed")).toBeNull();
		});

		it("condicional só rebaixa: recusa explícita com oração condicional segue RECUSA", () => {
			// Regressão colateral que a 3ª revisão pegou: o guard de condicional
			// rodava sobre a frase INTEIRA, então esta recusa limpa foi de `false`
			// (HEAD) pra `null` — deixava de fechar o gate.
			expect(
				detectYesNoText("não quero embutido, seria dinheiro jogado fora", "ready_to_proceed"),
			).toBe(false);
		});

		it("'mas' dentro de palavra não é adversativa", () => {
			expect(detectYesNoText("o valor da massa é alto", "ready_to_proceed")).toBeNull();
			expect(detectYesNoText("mas", "ready_to_proceed")).toBeNull();
		});

		it("as afirmações que importam continuam passando (o fix não pode matar o 387)", () => {
			for (const fala of [
				"faz sentido",
				"faz total sentido",
				"concordo",
				"perfeito",
				"é isso aí",
				"por mim tá ótimo",
				"combinado",
				"bora",
				"beleza",
			]) {
				expect(detectYesNoText(fala, "ready_to_proceed"), fala).toBe(true);
			}
		});

		it("'não sei, pode mostrar sim' continua sendo aceite (regra pré-existente)", () => {
			expect(detectYesNoText("não sei, pode mostrar sim", "ready_to_proceed")).toBe(true);
		});
	});
});
