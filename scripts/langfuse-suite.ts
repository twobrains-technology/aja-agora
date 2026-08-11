#!/usr/bin/env tsx
/**
 * Provisiona a suíte de observabilidade do agente no Langfuse.
 *
 *   pnpm langfuse:suite            # cria/atualiza tudo
 *   pnpm langfuse:suite --dry-run  # só mostra o que faria
 *
 * Por que script e não clicar na UI: painel montado à mão não é reproduzível,
 * não sobrevive a troca de instância (a local é v4, a de produção é v3) e
 * ninguém sabe dizer depois por que um widget mede o que mede. Aqui a suíte é
 * versionada junto do código que EMITE os dados — mexeu num score em
 * `funil-scores.ts`, o widget correspondente está no mesmo commit.
 *
 * Idempotente por NOME: rodar de novo atualiza (PATCH) em vez de duplicar.
 *
 * ─── Restrições REAIS do servidor v3.225.1, medidas, não deduzidas ───────────
 * • Os endpoints de dashboard vivem em `/api/public/unstable/…`. O caminho
 *   `/api/public/dashboards` responde 404 — não é que a API não exista, é que
 *   o prefixo é outro.
 * • O POST de widget NÃO aceita `view: "traces"` (só `observations` e as três
 *   de score). Por isso nenhum widget aqui conta trace direto: o funil é
 *   medido pelos SCORES que `funil-scores.ts` emite por turno.
 * • O campo de agregação do widget é `agg` — na Metrics API o mesmo campo se
 *   chama `aggregation`. Trocar um pelo outro dá 400.
 * • `dimensions` aceita no máximo 1 item, exceto em PIVOT_TABLE.
 * • Filtro por nome de score é `type: "string"` + operador `=`.
 *   Com `stringOptions` a query volta vazia SEM erro — falha silenciosa cara.
 */
import { ambienteLangfuse } from "../src/lib/observability/langfuse/env";

const BASE = process.env.LANGFUSE_BASE_URL?.trim();
const PK = process.env.LANGFUSE_PUBLIC_KEY?.trim();
const SK = process.env.LANGFUSE_SECRET_KEY?.trim();
const DRY = process.argv.includes("--dry-run");

if (!BASE || !PK || !SK) {
	console.error("✗ faltam LANGFUSE_BASE_URL / LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY");
	process.exit(1);
}

const auth = `Basic ${Buffer.from(`${PK}:${SK}`).toString("base64")}`;

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
	const res = await fetch(`${BASE}${path}`, {
		method,
		headers: { Authorization: auth, "Content-Type": "application/json" },
		...(body ? { body: JSON.stringify(body) } : {}),
	});
	const texto = await res.text();
	if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${texto.slice(0, 400)}`);
	return texto ? (JSON.parse(texto) as T) : (undefined as T);
}

// ─── Vocabulário curto pros widgets ─────────────────────────────────────────

type Metrica = { measure: string; agg: string };
type Filtro = Record<string, unknown>;
type Widget = {
	name: string;
	description: string;
	view: "observations" | "scores-numeric" | "scores-categorical" | "scores-boolean";
	dimensions: { field: string }[];
	metrics: Metrica[];
	filters: Filtro[];
	chartType: string;
	chartConfig: Record<string, unknown>;
};

/** Filtro por nome de score — o jeito que o servidor aceita de verdade. */
const score = (nome: string): Filtro => ({
	column: "name",
	operator: "=",
	value: nome,
	type: "string",
});

const num = (name: string, description: string, view: Widget["view"], m: Metrica, f: Filtro[]) =>
	({
		name,
		description,
		view,
		dimensions: [],
		metrics: [m],
		filters: f,
		chartType: "NUMBER",
		chartConfig: { type: "NUMBER" },
	}) satisfies Widget;

const barra = (
	name: string,
	description: string,
	view: Widget["view"],
	dim: string,
	m: Metrica,
	f: Filtro[],
	limite = 20,
) =>
	({
		name,
		description,
		view,
		dimensions: [{ field: dim }],
		metrics: [m],
		filters: f,
		chartType: "HORIZONTAL_BAR",
		chartConfig: { type: "HORIZONTAL_BAR", row_limit: limite, show_value_labels: true },
	}) satisfies Widget;

const serie = (
	name: string,
	description: string,
	view: Widget["view"],
	m: Metrica,
	f: Filtro[],
	dim?: string,
) =>
	({
		name,
		description,
		view,
		dimensions: dim ? [{ field: dim }] : [],
		metrics: [m],
		filters: f,
		chartType: "LINE_TIME_SERIES",
		chartConfig: { type: "LINE_TIME_SERIES" },
	}) satisfies Widget;

const CONTAGEM: Metrica = { measure: "count", agg: "count" };
/** Score booleano guarda 0/1 — a MÉDIA é a taxa. É assim que "taxa de X" vira
 *  um widget só, sem precisar dividir duas séries (a API não faz razão). */
const TAXA: Metrica = { measure: "value", agg: "avg" };
const MEDIA: Metrica = { measure: "value", agg: "avg" };

// ─── A suíte ────────────────────────────────────────────────────────────────

const dashboards: { nome: string; descricao: string; widgets: Widget[] }[] = [
	{
		nome: "① Funil de venda — onde o cliente para",
		descricao:
			"Por qual gate a conversa passa e até onde ela chega. Fonte: scores emitidos por turno em funil-scores.ts.",
		widgets: [
			barra(
				"Turnos por gate",
				"Quantos turnos aconteceram em cada gate. Barra alta = gate que consome conversa.",
				"scores-categorical",
				"stringValue",
				CONTAGEM,
				[score("gate")],
			),
			{
				name: "Gate × canal",
				description: "O mesmo funil separado por web e WhatsApp — mostra se um canal trava antes.",
				view: "scores-categorical",
				dimensions: [{ field: "stringValue" }, { field: "traceName" }],
				metrics: [CONTAGEM],
				filters: [score("gate")],
				chartType: "PIVOT_TABLE",
				chartConfig: {
					type: "PIVOT_TABLE",
					row_limit: 30,
					defaultSort: { column: "count_count", order: "DESC" },
				},
			},
			num(
				"Profundidade média do funil",
				"Média de funil_passo (1=nome … 14=contrato). Subiu = conversa indo mais fundo.",
				"scores-numeric",
				MEDIA,
				[score("funil_passo")],
			),
			serie(
				"Profundidade do funil por dia",
				"Tendência da profundidade média. Queda súbita = regressão de produto.",
				"scores-numeric",
				MEDIA,
				[score("funil_passo")],
			),
			barra(
				"Profundidade por canal",
				"Até onde a conversa chega em cada canal.",
				"scores-numeric",
				"traceName",
				MEDIA,
				[score("funil_passo")],
				10,
			),
			barra(
				"Estágio do lead",
				"Distribuição de raia alcançada (marco de negócio, fora do turno).",
				"scores-categorical",
				"stringValue",
				CONTAGEM,
				[score("lead_estagio")],
			),
		],
	},
	{
		nome: "② Saúde do agente — o que está quebrando",
		descricao:
			"Sinais determinísticos de defeito, medidos em código e não por juiz de LLM. Barato e sem falso positivo.",
		widgets: [
			num(
				"Taxa de turno mudo",
				"Fração de turnos em que o agente não escreveu NADA. Do lado do cliente é a app travada.",
				"scores-boolean",
				TAXA,
				[score("turno_mudo")],
			),
			serie(
				"Turno mudo por dia",
				"Se subir depois de um deploy, foi o deploy.",
				"scores-boolean",
				TAXA,
				[score("turno_mudo")],
			),
			// O defeito que passou por todas as redes: gate dispara, o cliente não
			// recebe pergunta nenhuma, e nada acusa — `turno_mudo` é 0 (o modelo
			// escreveu uma cortesia) e os três juízes aprovam (a frase é educada).
			// Determinístico, medido em código: não depende de LLM enxergar.
			num(
				"Taxa de gate ENTREGUE",
				"Fração de gates que chegaram ao cliente (card ou texto). Abaixo de 1 = alguém ficou sem pergunta pra responder e a venda parou.",
				"scores-boolean",
				TAXA,
				[score("gate_entregue")],
			),
			serie(
				"Gate entregue por dia",
				"Queda aqui é regressão de entrega — o cliente passou a receber conversa sem pergunta.",
				"scores-boolean",
				TAXA,
				[score("gate_entregue")],
			),
			barra(
				"Qual gate AFUNDA",
				"Gates que dispararam sem nenhuma forma de chegar ao cliente. Nomeia o culpado — a taxa sozinha não diz onde consertar.",
				"scores-categorical",
				"stringValue",
				CONTAGEM,
				[score("gate_afundado")],
			),
			num(
				"Taxa de artefato suprimido",
				"Guard engoliu um card que o modelo tentou emitir. Recorrente = agente batendo em porta trancada.",
				"scores-boolean",
				TAXA,
				[score("artefato_suprimido")],
			),
			num(
				"Taxa de transbordo",
				"Fração de turnos que viraram atendimento humano.",
				"scores-boolean",
				TAXA,
				[score("handoff")],
			),
			barra(
				"Razão de término do turno",
				"finish_reason do orquestrador — 'tool-error-recovered' e afins aparecem aqui.",
				"scores-categorical",
				"stringValue",
				CONTAGEM,
				[score("finish_reason")],
			),
			barra(
				"Observações por nível",
				"ERROR aqui é tool que estourou (tool-adapter marca o span).",
				"observations",
				"level",
				CONTAGEM,
				[],
				10,
			),
			barra(
				"Tools mais chamadas",
				"calledToolNames é uma das raras dimensões que o servidor EXPLODE por item.",
				"observations",
				"calledToolNames",
				CONTAGEM,
				[],
				25,
			),
			num(
				"Média de tools por turno",
				"Zero num gate que exige tool = número saindo da cabeça do modelo.",
				"scores-numeric",
				MEDIA,
				[score("tools_chamadas")],
			),
		],
	},
	{
		nome: "③ Qualidade da conversa — os juízes",
		descricao:
			"LLM-as-a-judge sobre a fala do agente. Complementa (não substitui) os sinais determinísticos do painel ②.",
		widgets: [
			num("Tom — média", "judge_tone: soa como vendedor humano?", "scores-numeric", MEDIA, [
				score("judge_tone"),
			]),
			num(
				"Resolveu — média",
				"judge_resolved: o turno respondeu o que o cliente perguntou?",
				"scores-numeric",
				MEDIA,
				[score("judge_resolved")],
			),
			num(
				"Alucinação — média",
				"judge_hallucination: número inventado. Quanto MENOR, melhor.",
				"scores-numeric",
				MEDIA,
				[score("judge_hallucination")],
			),
			serie("Tom por dia", "Tendência do tom.", "scores-numeric", MEDIA, [score("judge_tone")]),
			serie("Resolveu por dia", "Tendência de resolução.", "scores-numeric", MEDIA, [
				score("judge_resolved"),
			]),
			barra(
				"Tom por canal",
				"O agente é o mesmo nos dois canais? Aqui aparece se não é.",
				"scores-numeric",
				"traceName",
				MEDIA,
				[score("judge_tone")],
				10,
			),
			barra(
				"Tom por versão de prompt",
				"Média por versão do system prompt — é o número que decide promover ou não.",
				"scores-numeric",
				"observationPromptVersion",
				MEDIA,
				[score("judge_tone")],
				10,
			),
		],
	},
	{
		nome: "④ Canal, custo e conversão",
		descricao: "Comparação honesta entre web e WhatsApp, e o que virou dinheiro.",
		widgets: [
			barra(
				"Latência p95 por canal",
				"Percentil 95 — média esconde o cliente que esperou.",
				"observations",
				"traceName",
				{ measure: "latency", agg: "p95" },
				[],
				10,
			),
			barra(
				"Custo por canal",
				"Custo total das generations por canal.",
				"observations",
				"traceName",
				{ measure: "totalCost", agg: "sum" },
				[],
				10,
			),
			barra(
				"Custo por modelo",
				"Onde o dinheiro de LLM está indo.",
				"observations",
				"providedModelName",
				{ measure: "totalCost", agg: "sum" },
				[],
				15,
			),
			serie(
				"Custo por dia",
				"Tendência de custo — pega regressão de prompt que inflou contexto.",
				"observations",
				{ measure: "totalCost", agg: "sum" },
				[],
			),
			num(
				"Contratos fechados",
				"Score de sessão emitido em transitionLeadStage quando o lead vira fechado_ganho.",
				"scores-boolean",
				CONTAGEM,
				[score("conversao")],
			),
			num(
				"Valor total contratado",
				"Soma do crédito dos leads fechados.",
				"scores-numeric",
				{ measure: "value", agg: "sum" },
				[score("valor_contrato")],
			),
			barra(
				"Tempo até primeiro token (p95) por canal",
				"O que o cliente sente como demora.",
				"observations",
				"traceName",
				{ measure: "timeToFirstToken", agg: "p95" },
				[],
				10,
			),
		],
	},
];

// ─── Juízes: as regras que fazem o evaluator de fato RODAR ──────────────────
//
// O projeto tinha os três evaluators criados e ZERO evaluation rules — ou seja,
// os juízes existiam e não avaliavam nada. Evaluator é o juiz; rule é o
// contrato de quando ele roda. Sem rule, nenhum score automático nasce.
//
// Detalhes do v3.225.1 que decidem o desenho abaixo:
// • `target` só aceita "observation" ou "experiment" — não existe "trace".
//   Por isso a âncora é a observação `turn`, que é o único span equivalente a
//   um turno inteiro (as generations abaixo dela são pedaços do turno).
// • O `name` da RULE vira o nome do score. Mantemos os nomes existentes para
//   não partir o histórico já coletado nem os widgets do painel ③.
// • `modelConfig` explícito de propósito: com `null`, a rule depende do
//   "default eval model" do projeto e nasce `paused` com
//   DEFAULT_EVAL_MODEL_MISSING se ele não estiver setado — falha que se parece
//   com "o juiz não funciona".
const JUIZES = [
	{ nome: "judge_tone", descricao: "soa como vendedor humano?" },
	{ nome: "judge_resolved", descricao: "respondeu o que o cliente perguntou?" },
	{ nome: "judge_hallucination", descricao: "inventou número?" },
];

async function ligarJuizes() {
	console.log("\n⚖️  Juízes (evaluation rules)");
	const existentes = await api<{ data: { name: string }[] }>(
		"GET",
		"/api/public/unstable/evaluation-rules?limit=100",
	);
	const jaTem = new Set(existentes.data.map((r) => r.name));

	for (const juiz of JUIZES) {
		if (jaTem.has(juiz.nome)) {
			console.log(`   = ${juiz.nome} (já tem regra)`);
			continue;
		}
		if (DRY) {
			console.log(`   + ${juiz.nome} — ${juiz.descricao}`);
			continue;
		}
		try {
			await api("POST", "/api/public/unstable/evaluation-rules", {
				name: juiz.nome,
				evaluator: { name: juiz.nome, scope: "project", type: "llm_as_judge" },
				target: "observation",
				enabled: true,
				// 100% enquanto o volume é baixo: com poucas conversas por dia,
				// amostrar é abrir mão do sinal. Reduza quando o tráfego crescer.
				sampling: 1,
				// Atenção: o filtro de RULE usa vocabulário diferente do filtro de
				// WIDGET. Aqui `name` exige `stringOptions` + "any of" (com value em
				// array); lá o mesmo campo exige `string` + "=". Trocar um pelo outro
				// dá 400 na rule e — pior — silêncio no widget.
				filter: [{ type: "stringOptions", column: "name", operator: "any of", value: ["turn"] }],
				mapping: [
					{ variable: "input", source: "input" },
					{ variable: "output", source: "output" },
				],
			});
			console.log(`   + ${juiz.nome} — ${juiz.descricao}`);
		} catch (err) {
			console.error(`   ✗ ${juiz.nome}: ${err instanceof Error ? err.message : err}`);
		}
	}
}

// ─── Execução ───────────────────────────────────────────────────────────────

type ComId = { id: string; name: string };

async function listarTudo<T extends ComId>(path: string): Promise<T[]> {
	const out: T[] = [];
	for (let page = 1; page <= 20; page++) {
		const r = await api<{ data: T[]; meta: { totalPages: number } }>(
			"GET",
			`${path}?page=${page}&limit=100`,
		);
		out.push(...r.data);
		if (page >= (r.meta?.totalPages ?? 1)) break;
	}
	return out;
}

async function main() {
	console.log(`\n🎯 Langfuse: ${BASE}`);
	console.log(`   ambiente do processo: ${ambienteLangfuse()}`);
	if (DRY) console.log("   MODO DRY-RUN — nada será escrito\n");

	const widgetsExistentes = await listarTudo<ComId>("/api/public/unstable/dashboard-widgets");
	const dashboardsExistentes = await listarTudo<ComId>("/api/public/unstable/dashboards");
	const idPorNomeWidget = new Map(widgetsExistentes.map((w) => [w.name, w.id]));
	const idPorNomeDash = new Map(dashboardsExistentes.map((d) => [d.name, d.id]));

	let criados = 0;
	let atualizados = 0;

	for (const dash of dashboards) {
		console.log(`\n${dash.nome}`);
		const widgetIds: string[] = [];

		for (const w of dash.widgets) {
			// Prefixo evita colidir com widget que alguém criou pela UI.
			const nome = `[aja] ${w.name}`;
			const corpo = { ...w, name: nome };
			const existente = idPorNomeWidget.get(nome);
			if (DRY) {
				console.log(`   ${existente ? "~" : "+"} ${nome}`);
				continue;
			}
			try {
				if (existente) {
					await api("PATCH", `/api/public/unstable/dashboard-widgets/${existente}`, corpo);
					widgetIds.push(existente);
					atualizados++;
					console.log(`   ~ ${nome}`);
				} else {
					const novo = await api<ComId>("POST", "/api/public/unstable/dashboard-widgets", corpo);
					idPorNomeWidget.set(nome, novo.id);
					widgetIds.push(novo.id);
					criados++;
					console.log(`   + ${nome}`);
				}
			} catch (err) {
				console.error(`   ✗ ${nome}: ${err instanceof Error ? err.message : err}`);
			}
		}

		if (DRY) continue;

		let dashId = idPorNomeDash.get(dash.nome);
		if (!dashId) {
			const novo = await api<ComId>("POST", "/api/public/unstable/dashboards", {
				name: dash.nome,
				description: dash.descricao,
			});
			dashId = novo.id;
			idPorNomeDash.set(dash.nome, dashId);
			// Placement só na criação: repetir empilharia widget duplicado a cada
			// execução, e a API não expõe "substituir o layout inteiro".
			for (const widgetId of widgetIds) {
				await api("POST", `/api/public/unstable/dashboards/${dashId}/placements`, {
					type: "widget",
					widgetId,
				});
			}
			console.log(`   📊 dashboard criado com ${widgetIds.length} widgets`);
		} else {
			console.log(`   📊 dashboard já existe — widgets atualizados, layout preservado`);
		}
	}

	await ligarJuizes();

	console.log(`\n✅ ${criados} widgets criados, ${atualizados} atualizados`);
	console.log(`   ${BASE}/project/<id>/dashboards\n`);
}

main().catch((err) => {
	console.error("\n✗ falhou:", err instanceof Error ? err.message : err);
	process.exit(1);
});
