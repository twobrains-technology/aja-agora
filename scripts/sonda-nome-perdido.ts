// Sonda do NOME PERDIDO — reconciliação FALA × ESTADO para a captura do nome.
//
// ## Por que ela existe
//
// Em 27/08/2026 a captura do nome fora do gate `name` deixou de ser regex no
// servidor e passou a depender do MODELO chamar `save_contact_name`. O desenho é
// o certo pela régua da casa — o modelo lê a frase inteira e distingue "me chamo
// Ana" de "meu nome está sujo no Serasa", coisa que nenhum regex faz —, mas ele
// troca uma falha determinística por uma probabilística. E dependência
// probabilística sem medidor não é "aceitável": é "não medido".
//
// A perda aqui é PERMANENTE, e é isso que distingue este caso do
// `escolher_cota`: se o modelo não registra a escolha, o cliente insiste e o
// funil re-pede. Se ele não grava o nome, ninguém re-pede — a vitrine tirou o
// gate `name` do caminho de quem já traz o valor. O lead fica anônimo para
// sempre, e lead anônimo é exatamente o que o worker de retomada não alcança.
//
// ## O que ela mede, e por que isso NÃO é o regex de volta
//
// Ela cruza duas fontes independentes sobre a MESMA conversa:
//
//   ESTADO  `conversations.contact_name IS NULL`   (fato do servidor)
//   FALA    o cliente disse o próprio nome?        (juiz LLM, sobre o texto)
//
// O desacordo entre as duas é a perda. Isto é reconciliação fala×estado — a
// classe de sinal que o `CLAUDE.md` manda usar quando existe um FATO do servidor
// para ancorar —, não um guard: nada aqui muda o comportamento do produto, e o
// juiz nunca escreve no banco. A régua da casa é explícita sobre a diferença:
// medir a fala numa sonda é legítimo; convertê-la em filtro no produto foi o
// anti-padrão revertido em `649320dc`.
//
// O juiz é HIPÓTESE, e o relatório diz isso: ele lista as conversas suspeitas
// com a fala literal, para que a leitura seja conferível linha a linha.
//
// ## Uso
//
//   pnpm sonda:nome-perdido                    # últimos 7 dias, até 40 conversas
//   DIAS=30 AMOSTRA=100 pnpm sonda:nome-perdido
//
// Pré-requisitos: DATABASE_URL alcançável e gateway LiteLLM de pé (o mesmo do
// app). Sem gateway, ela ainda roda e reporta só a taxa determinística — que já
// responde "a captura caiu?", mesmo sem dizer de quem era o nome.

// Precisa ser o PRIMEIRO import: carrega .env e traduz DNS de container→host.
import "./_env-host";

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";

const DIAS = Number(process.env.DIAS ?? 7);
const AMOSTRA = Number(process.env.AMOSTRA ?? 40);
/** Quantas conversas COM nome entram no grupo de controle (sensibilidade). */
const CONTROLE = Number(process.env.CONTROLE ?? 8);

type Suspeita = { conversationId: string; falas: string[]; nome: string | null };

/** Pergunta ao modelo se a pessoa disse o PRÓPRIO nome. Devolve `null` quando o
 * gateway não responde — ausência de juiz não vira veredito. */
async function clienteDisseONome(falas: string[]): Promise<string | null | undefined> {
	const base = process.env.LITELLM_BASE_URL?.trim();
	const key = process.env.LITELLM_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim();
	if (!base || !key) return undefined;

	const prompt = [
		"Você audita conversas de venda de consórcio. Abaixo estão SÓ as falas do CLIENTE.",
		"",
		"Pergunta: em alguma delas o cliente disse o PRÓPRIO NOME, se apresentando?",
		"",
		'Atenção ao vocabulário do produto: "meu nome está sujo no Serasa" fala de crédito,',
		'não é apresentação. "sou o comprador", "sou aposentado", "não sou o único que decide"',
		"são papel, perfil e objeção — nenhum deles é apresentação.",
		"",
		'Responda APENAS com um JSON: {"nome": "<primeiro nome>"} se houve apresentação,',
		'ou {"nome": null} se não houve.',
		"",
		"FALAS DO CLIENTE:",
		...falas.map((f) => `- ${f}`),
	].join("\n");

	try {
		const res = await fetch(`${base}/v1/messages`, {
			method: "POST",
			headers: {
				"x-api-key": key,
				"anthropic-version": "2023-06-01",
				"content-type": "application/json",
			},
			body: JSON.stringify({
				model: process.env.AI_MODEL?.trim() || "claude-haiku-4-5",
				max_tokens: 64,
				messages: [{ role: "user", content: prompt }],
			}),
			signal: AbortSignal.timeout(30_000),
		});
		if (!res.ok) return undefined;
		const json = (await res.json()) as { content?: Array<{ text?: string }> };
		const texto = json.content?.map((c) => c.text ?? "").join("") ?? "";
		const m = texto.match(/\{[\s\S]*\}/);
		if (!m) return undefined;
		const parsed = JSON.parse(m[0]) as { nome?: string | null };
		const nome = parsed.nome?.trim();
		// `{"nome": "null"}` — o modelo devolvendo a palavra em vez do literal —
		// viraria uma suspeita chamada "null". Barato de barrar, e o mesmo vale
		// para string vazia.
		if (!nome || nome.toLowerCase() === "null") return null;
		return nome;
	} catch {
		return undefined;
	}
}

/** As falas do cliente, na ORDEM em que ele as escreveu. */
async function falasDoCliente(conversationId: string): Promise<string[]> {
	// `orderBy` ANTES do corte: sem ele o Postgres não garante ordem, e numa
	// conversa longa a PRIMEIRA fala — onde a apresentação mora — podia ficar fora
	// dos 30. Falso negativo justamente nas conversas mais engajadas, que são as
	// que fecham.
	const falas = await db
		.select({ content: messages.content })
		.from(messages)
		.where(and(eq(messages.conversationId, conversationId), eq(messages.role, "user")))
		.orderBy(messages.createdAt)
		.limit(30);
	return falas.map((f) => f.content).filter((t): t is string => Boolean(t?.trim()));
}

async function main() {
	const desde = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000);

	// Denominador: conversas em que o cliente FALOU (uma abertura que não virou
	// conversa não é nome perdido — é visita).
	//
	// Duas queries e o cruzamento em memória, de propósito. A versão com subquery
	// correlacionada compilava para `m.conversation_id = "id"` — sem qualificar a
	// tabela, o `"id"` resolve para a coluna da PRÓPRIA subquery, a contagem dá
	// zero para todo mundo e o relatório sai dizendo "nada a reconciliar". Passou
	// no typecheck e no lint; só a medição pegou.
	// SIMULADAS FORA, e isto não é detalhe: produção TEM conversas simuladas (o
	// harness de conversa real roda lá), e a medição de referência desta entrega
	// filtrou `is_simulated = false` justamente por isso. Sem o filtro, a taxa que
	// o runbook manda observar mistura QA com cliente, e a amostra de suspeitas
	// também. `INCLUIR_SIMULADAS=1` volta atrás quando o alvo for o harness.
	const incluirSimuladas = process.env.INCLUIR_SIMULADAS === "1";
	const todas = await db
		.select({ id: conversations.id, contactName: conversations.contactName })
		.from(conversations)
		.where(
			incluirSimuladas
				? gte(conversations.createdAt, desde)
				: and(gte(conversations.createdAt, desde), eq(conversations.isSimulated, false)),
		)
		.orderBy(desc(conversations.createdAt));

	const falasPorConversa = new Map<string, number>();
	for (const linha of await db
		.select({ id: messages.conversationId, n: sql<number>`count(*)` })
		.from(messages)
		.where(eq(messages.role, "user"))
		.groupBy(messages.conversationId)) {
		falasPorConversa.set(linha.id, Number(linha.n));
	}

	const comFala = todas.filter((c) => (falasPorConversa.get(c.id) ?? 0) > 0);
	const comNome = comFala.filter((c) => c.contactName);
	const semNome = comFala.filter((c) => !c.contactName);

	console.log(`\n═══ NOME PERDIDO — últimos ${DIAS} dias ═══\n`);
	console.log(`conversas com fala do cliente : ${comFala.length}`);
	console.log(
		`  com contact_name             : ${comNome.length}` +
			(comFala.length ? `  (${((comNome.length / comFala.length) * 100).toFixed(1)}%)` : ""),
	);
	console.log(`  SEM contact_name             : ${semNome.length}`);

	if (semNome.length === 0) {
		console.log("\nNada a reconciliar.\n");
		process.exit(0);
	}

	// ── GRUPO DE CONTROLE: o juiz enxerga? ──
	//
	// "0 perdas" e "juiz cego" produzem o MESMO relatório vazio, e falso negativo
	// é invisível por construção: a conversa em que o juiz erra simplesmente não
	// aparece. Então, no mesmo run, ele também julga conversas em que o nome FOI
	// gravado — ali sabemos a resposta. Se ele não reencontrar esses, o silêncio
	// sobre as outras não vale nada.
	//
	// Esta sonda já provou uma vez, no próprio SQL, que "nada a reconciliar" é a
	// pior saída possível quando não se sabe se o instrumento está ligado.
	const controle = comNome.slice(0, Math.min(CONTROLE, comNome.length));
	let reencontrados = 0;
	let controleConferido = 0;
	for (const conv of controle) {
		const texto = await falasDoCliente(conv.id);
		if (texto.length === 0) continue;
		const veredito = await clienteDisseONome(texto);
		if (veredito === undefined) continue;
		controleConferido++;
		if (veredito) reencontrados++;
	}
	if (controleConferido > 0) {
		const pct = ((reencontrados / controleConferido) * 100).toFixed(0);
		console.log(
			`\nSensibilidade do juiz (grupo de controle): reencontrou o nome em ` +
				`${reencontrados}/${controleConferido} conversas que TÊM contact_name (${pct}%).`,
		);
		if (reencontrados < controleConferido) {
			console.log(
				"   ⚠️  Abaixo de 100% o juiz erra para menos — leia o resultado abaixo\n" +
					"       como PISO da perda, nunca como total.",
			);
		}
	}

	const alvo = semNome.slice(0, AMOSTRA);
	console.log(`\nReconciliando ${alvo.length} conversa(s) sem nome contra a fala…\n`);

	const suspeitas: Suspeita[] = [];
	let juizIndisponivel = 0;
	let conferidas = 0;

	for (const conv of alvo) {
		const texto = await falasDoCliente(conv.id);
		if (texto.length === 0) continue;

		const veredito = await clienteDisseONome(texto);
		if (veredito === undefined) {
			juizIndisponivel++;
			continue;
		}
		conferidas++;
		if (veredito) suspeitas.push({ conversationId: conv.id, falas: texto, nome: veredito });
	}

	if (juizIndisponivel > 0) {
		console.log(
			`⚠️  ${juizIndisponivel} conversa(s) sem veredito — gateway LiteLLM fora do ar.\n` +
				"   A taxa determinística acima continua válida; a reconciliação, não.\n",
		);
	}

	console.log(`── PERDAS SUSPEITAS: ${suspeitas.length} de ${conferidas} conferidas ──\n`);
	for (const s of suspeitas) {
		console.log(`  ${s.conversationId}  → o cliente parece ter dito "${s.nome}"`);
		for (const f of s.falas.slice(0, 3)) console.log(`      👤 ${f.slice(0, 110)}`);
		console.log("");
	}

	if (suspeitas.length > 0) {
		console.log(
			"O juiz é HIPÓTESE — confira a fala literal acima antes de tratar como perda.\n" +
				"Perda confirmada = o modelo não chamou `save_contact_name` num turno em que\n" +
				"a pessoa se apresentou. O conserto é de PROMPT/contexto, nunca de regex no\n" +
				"servidor (ver `capture.nao-inventa-fora-do-gate.test.ts`).\n",
		);
	}
	process.exit(0);
}

main().catch((err) => {
	console.error("sonda-nome-perdido falhou:", err);
	process.exit(1);
});
