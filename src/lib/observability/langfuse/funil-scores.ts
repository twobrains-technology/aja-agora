// Ponte TurnTraceRecord → scores do Langfuse.
//
// Por que existe: o gate JÁ era conhecido em produção (vira output do span
// `route`/`routeFinal` e campo do `[turn-trace]` no log), mas ficava preso
// DENTRO do payload de um span. Dava pra ler abrindo o trace na mão; não dava
// pra filtrar, contar nem montar dashboard. Era dado, não dimensão.
//
// A escolha de virar SCORE (e não tag/metadata) não é estilo — é o que o
// servidor permite agregar. Medido na Metrics API do nosso Langfuse v3.225.1:
//   • view `traces` só aceita dimensão id, name, tags, userId, sessionId,
//     release, version, environment, timestampMonth — **metadata não é
//     dimensionável**, então gate em metadata nunca viraria gráfico;
//   • dimensão `tags` agrupa pelo ARRAY INTEIRO ("channel:web,gate:credit" é
//     um bucket diferente de "channel:web,gate:identify"), então tag explode a
//     cardinalidade e não soma por gate;
//   • view `scores-categorical` tem dimensão `stringValue` — agrupar por valor
//     do score é nativo. É o único caminho que dá funil de verdade.
// O canal não precisa de score: `traceName` (`turn:web` / `turn:whatsapp`) já
// é dimensão em TODAS as views de score, então todo gráfico daqui cruza com
// canal de graça.
//
// Lei da casa: observabilidade NUNCA derruba o turno. Tudo aqui é try/catch e
// no-op sem credencial.
import type { FalhaDeTool } from "@/lib/agent/langgraph/tool-falha";
import type { TurnTraceRecord } from "@/lib/telemetry/turn-trace";
import { getLangfuseClient } from "./client";
import { ambienteLangfuse } from "./env";

/**
 * Régua de profundidade do funil, para a métrica "quão longe a conversa foi".
 *
 * A ORDEM canônica de execução é do código (`nextGate`, qualify-state.ts) —
 * este mapa não compete com ela, é a tradução daquela cascata numa escala
 * numérica para conseguir `max(value) por sessão` = ponto mais fundo que o
 * cliente alcançou. Sem escala não existe gráfico de conversão.
 *
 * `doubts-wait` está de fora DE PROPÓSITO: é pausa (o cliente perguntou algo e
 * o funil segura), não posição. Pontuá-lo afundaria a média de quem está indo
 * bem e só fez uma pergunta. Ele continua aparecendo no score categórico
 * `gate` — dá pra contar quanto tempo o funil passa em espera — só não conta
 * como profundidade.
 */
const PROFUNDIDADE_DO_GATE: Record<string, number> = {
	// `name` VALE 5, e não 1 (corrigido em 30/08/2026).
	//
	// A régua nasceu com o nome em primeiro lugar porque ele ERA o primeiro
	// gate da conversa. Desde 30/08 ele tem duas posições: continua abrindo a
	// conversa de quem chega sem dizer nada, mas para quem entra pela categoria
	// — 90% das entradas medidas — ele acontece DEPOIS do valor do bem, colado
	// ao pedido de documento.
	//
	// Com o valor antigo, uma conversa que chegasse até ali registraria
	// profundidade 1, e `max(funil_passo)` por sessão — que é justamente a
	// métrica de "quão longe o cliente foi" — mostraria uma QUEDA de conversão
	// que é a própria mudança de instrumentação. O mesmo vício que
	// `desireAsked` produzia no degrau `engajado` do kanban, por outra porta.
	//
	// 5 é a posição REAL na cascata pós-mudança: depois de `credit` (4), antes
	// de `identify` (6). Quem cai no nome pelo caminho antigo (primeiro contato)
	// aparece um degrau acima do que aparecia — e isso é honesto: ele de fato
	// disse alguma coisa antes de chegar lá.
	desire: 2,
	experience: 3,
	credit: 4,
	// `name` e `timeframe` NÃO podem empatar: com o mesmo valor,
	// `max(funil_passo)` deixa de distinguir uma conversa que parou no nome de
	// uma que parou no prazo — perdas de naturezas diferentes, com consertos
	// diferentes. Os degraus abaixo desceram um para abrir espaço.
	name: 5,
	timeframe: 6,
	identify: 7,
	search: 8,
	"reco-consent": 9,
	lance: 10,
	"lance-value": 11,
	"lance-embutido": 12,
	"simulator-offer": 13,
	decision: 14,
	contract: 15,
};

/** Maior profundidade da régua — o denominador de "% do funil percorrido". */
export const PROFUNDIDADE_MAXIMA = Math.max(...Object.values(PROFUNDIDADE_DO_GATE));

export function profundidadeDoGate(gate: string | null): number | null {
	if (!gate) return null;
	return PROFUNDIDADE_DO_GATE[gate] ?? null;
}

/**
 * Os artifacts que colocam PREÇO REAL na frente do cliente.
 *
 * Mesma definição que `sinais-do-funil.ts` usa no banco para "viu oferta", mais
 * o `comparison_table` — que é a primeira coisa que o cliente vê no reveal e,
 * portanto, o momento em que a conversa deixa de ser promessa.
 */
const ARTIFACTS_DE_OFERTA = new Set(["comparison_table", "recommendation_card", "real_offer"]);

export type Score = {
	name: string;
	value: string | number;
	dataType: "CATEGORICAL" | "NUMERIC" | "BOOLEAN";
	comment?: string;
};

/**
 * Traduz o registro fechado de um turno na lista de scores que ele merece.
 *
 * Função PURA — é ela que os testes exercitam. A publicação (efeito) fica em
 * `publicarFunilNoLangfuse`, que só existe para ser um try/catch em volta
 * disto. Score só é emitido quando o dado EXISTE: campo ausente vira ausência
 * de score, nunca um zero inventado (zero é uma medição, `null` não é).
 */
export function scoresDoTurno(record: TurnTraceRecord): Score[] {
	const scores: Score[] = [];

	// O funil, nas duas formas que a Metrics API sabe agregar: categórico pra
	// contar turnos por gate (barra), numérico pra medir profundidade (conversão).
	if (record.gate) {
		scores.push({ name: "gate", value: record.gate, dataType: "CATEGORICAL" });
		const passo = profundidadeDoGate(record.gate);
		if (passo !== null) {
			scores.push({ name: "funil_passo", value: passo, dataType: "NUMERIC" });
		}
	}

	// A CARTA CHEGOU À TELA? — o contraponte determinístico do `judge_avancou`.
	//
	// Em produção (14-26/08/2026) o `judge_avancou` deu 0,92 em 335 turnos
	// enquanto 70 conversas de cliente externo fechavam 2 contratos. Não há
	// contradição: aquele juiz lê a FALA e pergunta "este turno tentou avançar?",
	// e o turno que pede o CPF pela quarta vez tentou. Funil parado é estado, e
	// só um sinal de estado o enxerga.
	//
	// Emitido em TODO turno de propósito, inclusive como 0: score que só aparece
	// quando vale 1 não tem denominador, e a média no Langfuse viraria 1,0 para
	// sempre — o mesmo vício que este sinal existe para corrigir.
	scores.push({
		name: "carta_na_tela",
		value: record.artifactsEmitted.some((a) => ARTIFACTS_DE_OFERTA.has(a)) ? 1 : 0,
		dataType: "BOOLEAN",
	});

	// A PRIMEIRA RESPOSTA ENTREGOU UM NÚMERO? — o sinal que prova (ou desmente)
	// a campanha de conversão de 30/08/2026.
	//
	// A medição que motivou a mudança é dura: das 70 conversas web reais entre
	// 16 e 30/08, **34 (49%) morreram com uma única fala do cliente**, quase
	// todas depois de a pessoa clicar num chip de categoria e receber de volta
	// um elogio e uma pergunta. A resposta foi tirar `name` e `desire` da frente
	// de quem já disse o que quer e mandar o funil direto ao `credit`, cujo card
	// mostra a parcela estimada.
	//
	// Sem este score, daqui a duas semanas ninguém sabe se aquilo funcionou. O
	// `judge_avancou` não serve: ele lê a FALA e pergunta "este turno tentou
	// avançar?" — e o turno que elogia e pergunta tentou. É a mesma razão pela
	// qual `carta_na_tela` existe ao lado dele. Funil parado é ESTADO.
	//
	// Emitido só no PRIMEIRO turno, e como 0 ou 1 — nunca ausente quando é 0,
	// senão a média no Langfuse vira 1,0 para sempre e o sinal mede a si mesmo.
	// `turnoDoCliente` nulo (chamador que não soube informar) não emite nada, em
	// vez de mentir que era o primeiro.
	if (record.turnoDoCliente === 0) {
		// O QUE CONTA É ENTREGA, NÃO INTENÇÃO DE ROTA.
		//
		// A primeira versão media só `gate === "credit"`, e isso mede o que o funil
		// DECIDIU, não o que o cliente VIU. A agulha com a parcela estimada é da
		// WEB: no WhatsApp o mesmo gate sai como texto ("E quanto custa esse
		// Corolla hoje?"), sem número nenhum. O score diria 1 para um turno que não
		// entregou nada — e mentiria justamente no canal para onde o item A3
		// canaliza tráfego.
		//
		// Os artifacts de oferta contam em qualquer canal: quem já chegou com tudo
		// pula a agulha e vê a carta real, que é número de verdade.
		const agulhaComEstimativa = record.gate === "credit" && record.channel === "web";
		const cartaNaTela = record.artifactsEmitted.some((a) => ARTIFACTS_DE_OFERTA.has(a));

		scores.push({
			name: "primeira_resposta_com_numero",
			value: agulhaComEstimativa || cartaNaTela ? 1 : 0,
			dataType: "BOOLEAN",
		});
	}

	// Turno mudo: o agente processou e não escreveu UMA letra. Do lado do
	// cliente é a app travada. Hoje isso só aparecia se alguém lesse o log.
	//
	// FIX-431 — mudo de VERDADE × card sem fala. No trace `71191c00` (produção,
	// WhatsApp, sessão `04fda013`) o modelo chamou `simulate_quota` e
	// `present_simulation_result`, o card saiu, e nenhuma letra foi escrita. São
	// dois defeitos com conserto em lugares diferentes:
	//   • sem fala e sem artifact → o turno não entregou NADA;
	//   • sem fala COM artifact  → o servidor podou a fala (sanitizer) e sobrou
	//     só o card — na web o cliente ao menos vê algo; no WhatsApp é silêncio.
	// Somar os dois num score só faria o Monitor sobre a média alertar em falso.
	const semFala = record.textChars === 0;
	const comArtifact = record.artifactCount > 0;
	scores.push({
		name: "turno_mudo",
		value: semFala && !comArtifact ? 1 : 0,
		dataType: "BOOLEAN",
	});
	scores.push({
		name: "card_sem_fala",
		value: semFala && comArtifact ? 1 : 0,
		dataType: "BOOLEAN",
		...(semFala && comArtifact ? { comment: record.artifactsEmitted.join(", ") } : {}),
	});

	// Guard engoliu um card que o modelo tentou emitir (reveal-loop,
	// post-closure, contract-gate, single-option…). Um é higiene; recorrente é
	// o agente batendo na porta trancada — sintoma de prompt/estado errado.
	scores.push({
		name: "artefato_suprimido",
		value: record.suppressed.length > 0 ? 1 : 0,
		dataType: "BOOLEAN",
		...(record.suppressed.length > 0 ? { comment: record.suppressed.join(", ") } : {}),
	});

	scores.push({
		name: "handoff",
		value: record.handoff ? 1 : 0,
		dataType: "BOOLEAN",
	});

	scores.push({
		name: "tools_chamadas",
		value: record.toolCount,
		dataType: "NUMERIC",
		...(record.toolsCalled.length > 0 ? { comment: record.toolsCalled.join(", ") } : {}),
	});

	// `finish_reason` é o mais barato dos sinais de defeito: "tool-error-
	// recovered" e afins já são emitidos pelo orquestrador e nunca chegavam a
	// lugar nenhum que desse pra somar.
	if (record.finishReason) {
		scores.push({
			name: "finish_reason",
			value: record.finishReason,
			dataType: "CATEGORICAL",
		});
	}
	if (record.leadStage) {
		scores.push({ name: "lead_stage", value: record.leadStage, dataType: "CATEGORICAL" });
	}
	if (record.persona) {
		scores.push({ name: "persona", value: record.persona, dataType: "CATEGORICAL" });
	}

	return scores;
}

/** Como o gate chegou (ou não) ao cliente no WhatsApp. */
export type EntregaDoGate = "interactive" | "text" | "none";

/**
 * O gate disparou — ele chegou ao cliente?
 *
 * Nasceu de um defeito que passou por TODAS as redes existentes (trace
 * `be5cc1e6dd32923553d18a61a0dc505c`, produção, 2026-08-10): o cliente mandou
 * "oi" e recebeu "Oi, Kairo! Tudo certo?" — cortesia pura, gate `desire` sem
 * entrega nenhuma, venda parada no primeiro turno. Nada acusou:
 *
 *   • `turno_mudo` = 0 — o modelo ESCREVEU (só não perguntou nada);
 *   • `artefato_suprimido` = 0 — nenhum guard rodou;
 *   • `judge_resolved` = 1, `judge_tone` = 0.75 — os três juízes aprovaram,
 *     e com razão: a frase é educada, verdadeira e bem escrita. Juiz de
 *     qualidade de PROSA não enxerga funil que não andou.
 *
 * O único sinal existente era um `console.error("[gate-undelivered]")` — vivo
 * só no CloudWatch, invisível no Langfuse, impossível de agregar ou alertar.
 * Foram 8 ocorrências em 4 dias antes de alguém reparar, e o mesmo gate
 * reincidiu na mesma conversa (`credit` às 10:20 e de novo às 14:29).
 *
 * Booleano de propósito: a média vira "taxa de entrega do gate" num widget só,
 * e cruza de graça com o score categórico `gate` (qual gate afunda) e com
 * `traceName` (`turn:web` × `turn:whatsapp`) — as duas dimensões que dizem
 * ONDE consertar. É determinístico e custa zero: não depende de LLM julgar.
 */
export function scoreDeEntregaDoGate(gate: string, via: EntregaDoGate): Score[] {
	const scores: Score[] = [
		{
			name: "gate_entregue",
			value: via === "none" ? 0 : 1,
			dataType: "BOOLEAN",
			comment: `${gate} — ${via}`,
		},
	];
	// A taxa diz QUANTO afunda; só o categórico diz QUAL gate — e é o "qual"
	// que aponta o arquivo a consertar. `comment` não é dimensão no Langfuse
	// (nem `metadata`), então sem este score o painel mostraria um número que
	// ninguém consegue destrinchar. Emitido só no afundamento: gate entregue é
	// o caso normal e não precisa de cardinalidade.
	if (via === "none") {
		scores.push({ name: "gate_afundado", value: gate, dataType: "CATEGORICAL" });
	}
	return scores;
}

/**
 * Tool que o modelo chamou e que não rodou — o sinal que faltava.
 *
 * Nasceu de duas sessões de produção no WhatsApp (2026-08-13, `a68b1945` e
 * `04fda013`): o modelo chamou `search_groups`, que a tool-policy retira até a
 * identidade ser coletada, e recebeu de volta `Error: Tool "search_groups" not
 * found.` O agente traduziu isso para o cliente como problema técnico e
 * terminou oferecendo um atendente humano — a venda morreu.
 *
 * Por que nenhum sinal existente pegou:
 *   • `tools_chamadas` = 1 — CONTA a chamada, sem saber que ela falhou;
 *   • `finish_reason` = "ok" — o turno terminou normalmente, e terminou mesmo;
 *   • `turno_mudo` = 0 — o agente escreveu (escreveu o pedido de desculpas);
 *   • os quatro juízes aprovaram: a frase é educada, coerente e bem escrita.
 *
 * Booleano porque a média vira taxa direto no Monitor. O categórico
 * `tool_falha_nome` é o que aponta QUAL tool consertar — sem ele o painel
 * mostra um número que ninguém sabe destrinchar (mesma lição do
 * `gate_afundado`). `comment` carrega a mensagem crua para o diagnóstico.
 */
export function scoresDeFalhaDeTool(falhas: FalhaDeTool[]): Score[] {
	if (falhas.length === 0) return [];
	const scores: Score[] = [
		{
			name: "tool_falhou",
			value: 1,
			dataType: "BOOLEAN",
			comment: falhas.map((f) => `${f.tool} (${f.tipo})`).join(", "),
		},
	];
	// Uma dimensão por tool distinta: duas falhas da mesma tool no turno são o
	// mesmo defeito, não dois.
	for (const tool of [...new Set(falhas.map((f) => f.tool))]) {
		scores.push({ name: "tool_falha_nome", value: tool, dataType: "CATEGORICAL" });
	}
	// `ausente` (fase/policy) e `erro` (Bevi/execução) mandam consertar arquivos
	// diferentes — separar aqui evita alerta que não diz para onde ir.
	for (const tipo of [...new Set(falhas.map((f) => f.tipo))]) {
		scores.push({ name: "tool_falha_tipo", value: tipo, dataType: "CATEGORICAL" });
	}
	return scores;
}

/**
 * A fala que o servidor PODOU — o instante mais informativo de um turno mudo.
 *
 * O sanitizer sabe exatamente por que cada segmento caiu
 * (`droppedSegmentReasons()`), e essa informação morria dentro dele. Quando o
 * turno da sessão `04fda013` saiu sem uma palavra, o painel mostrou silêncio
 * inexplicado: o motivo (`gancho` segurado + `process-preamble`) existia e
 * ninguém podia lê-lo sem abrir o código.
 *
 * Booleano com os motivos no `comment`: a média vira "quanto da fala o próprio
 * servidor está comendo", e o comentário diz qual guard olhar.
 */
export function scoresDeFalaPodada(motivos: string[]): Score[] {
	if (motivos.length === 0) return [];
	return [
		{
			name: "fala_podada",
			value: 1,
			dataType: "BOOLEAN",
			comment: [...new Set(motivos)].join(", "),
		},
	];
}

/**
 * O guard de ancoragem reverteu um valor — o flagrante do livelock.
 *
 * Enquanto o veto do FIX-378 e o escape do FIX-307 se anulavam em ciclo
 * (sessão `a68b1945`), o único rastro era um `console.log` no CloudWatch. Este
 * score existe para que a reincidência apareça em uma consulta: qualquer
 * ocorrência recorrente na MESMA conversa é o livelock voltando por outra porta.
 */
export function scoresDeValorRevertido(args: {
	valorRecusado: number;
	veioDoEscape: boolean;
}): Score[] {
	return [
		{
			name: "valor_revertido",
			value: 1,
			dataType: "BOOLEAN",
			comment: `${args.valorRecusado}${args.veioDoEscape ? " (escape)" : ""}`,
		},
	];
}

/** Publica no trace ATIVO. No-op sem credencial. */
function publicar(scores: Score[], onde: string): void {
	if (scores.length === 0) return;
	const client = getLangfuseClient();
	if (!client) return;
	try {
		const environment = ambienteLangfuse();
		for (const score of scores) client.score.activeTrace({ ...score, environment });
	} catch (err) {
		console.error(`[langfuse] ${onde} falhou (ignorado):`, err);
	}
}

export function registrarFalaPodada(motivos: string[]): void {
	publicar(scoresDeFalaPodada(motivos), "registrar fala podada");
}

export function registrarValorRevertido(args: {
	valorRecusado: number;
	veioDoEscape: boolean;
}): void {
	publicar(scoresDeValorRevertido(args), "registrar valor revertido");
}

/**
 * O cliente escolheu uma cota e a escolha NÃO ancorou.
 *
 * É o silêncio mais caro do sistema: sem `escolha` no estado,
 * `fechamentoSinalizado` fica falso, o funil não vai para o contrato e o
 * cliente que disse "quero contratar" recebe de volta o card de recomendação.
 * Reproduzido pelo gate em 2026-08-13 (`golden-fecho-nao-anda-pra-tras`, 3 de 4
 * rodadas), e até então sem rastro algum — nem log, nem score.
 *
 * O `comment` carrega o `groupId` que o modelo mandou, quantas ofertas estavam
 * exibidas e — desde 16/08/2026 — QUAL veto barrou. Sem o motivo, os dois casos
 * mais diferentes do sistema apareciam iguais: id que não existe (problema de
 * leitura de artifacts) e aceite não reconhecido (problema de léxico, com o
 * cliente tendo de fato escolhido). O segundo era o de `fd76e393`, e ele nem
 * chegava a ser registrado: o veto por falta de aceite pulava o bloco inteiro,
 * então a conversa que anunciou uma venda inexistente não gerou sinal nenhum.
 */
export function scoresDeEscolhaNaoAncorada(args: {
	groupId: string;
	exibidas: number;
	veto?: string;
}): Score[] {
	return [
		{
			name: "escolha_nao_ancorou",
			value: 1,
			dataType: "BOOLEAN",
			comment:
				`groupId=${args.groupId} · ofertas exibidas=${args.exibidas}` +
				(args.veto ? ` · veto=${args.veto}` : ""),
		},
	];
}

/**
 * A qual `kind` de ação cada intenção de botão do card de simulação pertence.
 *
 * É a MESMA tradução que o card faz (`simulation-result.tsx`) — escrita aqui
 * para poder ser CONFERIDA. Enquanto ela existia só no front, um `else` mandava
 * toda intenção desconhecida para `adjust-value` e ninguém tinha como saber:
 * o clique da cliente virava outro clique, em silêncio (PRD §5.5).
 */
const KIND_ESPERADO_POR_INTENT: Record<string, string> = {
	adjust_value: "adjust-value",
	new_simulation: "adjust-value",
	view_scenarios: "view-scenarios",
	compare_financing: "compare-financing",
	compare_other: "show-other-options",
};

/**
 * O clique chegou ao servidor como o cliente o viu na tela?
 *
 * PURO — o alarme é a comparação entre o que o botão DIZIA (a intenção que o
 * card declarou) e o que o servidor RECEBEU (o kind da ação). Divergência
 * significa que alguém traduziu o clique no caminho, e é assim que uma cliente
 * pede cenários de contemplação e ouve "qual valor você quer simular?".
 *
 * Sem intenção declarada (card antigo já renderizado, WhatsApp) não há o que
 * comparar — e alarme sem base é ruído, então fica em silêncio.
 */
export function scoreDeBotaoFantasma(args: { kind: string; intent?: string }): Array<{
	name: string;
	value: number;
	dataType: "BOOLEAN";
	comment: string;
}> {
	if (!args.intent) return [];
	const esperado = KIND_ESPERADO_POR_INTENT[args.intent];
	if (!esperado || esperado === args.kind) return [];
	return [
		{
			name: "botao_fantasma",
			value: 1,
			dataType: "BOOLEAN",
			comment:
				`O cliente clicou num botão de intenção "${args.intent}" e o servidor recebeu ` +
				`"${args.kind}". O clique foi traduzido no caminho — o agente vai responder a um ` +
				"pedido que ninguém fez.",
		},
	];
}

/** Publica `botao_fantasma` no trace ATIVO. No-op sem credencial e sem
 * divergência. */
export function registrarBotaoFantasma(args: { kind: string; intent?: string }): void {
	const scores = scoreDeBotaoFantasma(args);
	if (scores.length === 0) return;
	console.error(
		JSON.stringify({
			level: "error",
			source: "botao-fantasma",
			kind: args.kind,
			intent: args.intent,
		}),
	);
	publicar(scores, "registrar botao fantasma");
}

export function registrarEscolhaNaoAncorada(args: {
	groupId: string;
	exibidas: number;
	veto?: string;
}): void {
	publicar(scoresDeEscolhaNaoAncorada(args), "registrar escolha nao ancorada");
}

/** Publica as falhas de tool no trace ATIVO. No-op sem credencial. */
export function registrarFalhasDeTool(falhas: FalhaDeTool[]): void {
	const client = getLangfuseClient();
	if (!client) return;
	try {
		const environment = ambienteLangfuse();
		for (const score of scoresDeFalhaDeTool(falhas)) {
			client.score.activeTrace({ ...score, environment });
		}
	} catch (err) {
		console.error("[langfuse] registrar falha de tool falhou (ignorado):", err);
	}
}

/** Publica a entrega do gate no trace ATIVO (o adapter do WhatsApp roda dentro
 * do callback de `withLangfuseTurn`, então há trace). No-op sem credencial. */
export function registrarEntregaDoGate(gate: string, via: EntregaDoGate): void {
	const client = getLangfuseClient();
	if (!client) return;
	try {
		const environment = ambienteLangfuse();
		for (const score of scoreDeEntregaDoGate(gate, via)) {
			client.score.activeTrace({ ...score, environment });
		}
	} catch (err) {
		console.error("[langfuse] registrar entrega do gate falhou (ignorado):", err);
	}
}

/**
 * Publica os scores do turno no trace Langfuse ATIVO.
 *
 * Depende de estar dentro do callback de `withLangfuseTurn` — é o caso nos
 * dois canais: web finaliza dentro do wrapper (route.ts) e WhatsApp finaliza
 * no `finally` do generator, que roda dentro de `consumeEventsInner`.
 * Fora de contexto o SDK simplesmente descarta, sem lançar.
 */
export function publicarFunilNoLangfuse(record: TurnTraceRecord): void {
	const client = getLangfuseClient();
	if (!client) return;
	try {
		// `environment` explícito em CADA score, e não é redundância: o
		// LangfuseSpanProcessor recebe o ambiente na construção e carimba os
		// spans, mas o LangfuseClient não aceita `environment` no construtor —
		// então score criado por ele cai em "default" mesmo com o trace em
		// "production". Visto ao vivo no primeiro turno após o deploy: trace em
		// production, scores do funil em default. Como o filtro de ambiente da UI
		// é global, isso sumiria com o funil inteiro de quem filtrasse produção.
		const environment = ambienteLangfuse();
		for (const score of scoresDoTurno(record)) {
			client.score.activeTrace({ ...score, environment });
		}
	} catch (err) {
		console.error("[langfuse] publicar scores do funil falhou (ignorado):", err);
	}
}
