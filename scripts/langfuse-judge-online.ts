// JUIZ ONLINE NO LANGFUSE — bloco B8 do plano
// `docs/design/planos/2026-11-05-langfuse-suíte.md`.
//
// Cria, via API instável (`/api/public/unstable/*`):
// - um Evaluator LLM-as-judge (`type: llm_as_judge`, scope `project`) chamado
//   `judge_avancou` (NUMERIC 0..1 = média das 5 dimensões da rubrica), com a
//   rubrica idêntica à do juiz offline (`src/lib/eval/rubric.ts`);
// - a Rule de execução com `target: "observation"` SEMPRE (trace-level é
//   desprecado na v4 — não se constrói em cima de legacy), filtro
//   `isRootObservation = true` (a root "Conversational Turn" que o plugin cria)
//   e `sampling` configurável por env.
//
// O score do evaluator sai com o nome do evaluator (`judge_avancou`) — é o
// mesmo nome que o monitor do B11 usa.
//
// LLM Connection: a instância exige uma conexão de LLM configurada em
// Settings → LLM Connections (na UI) ANTES de criar o evaluator
// (`evaluator_preflight_failed` sem ela). A API pública não expõe
// criação de connection (medido: 404 em `/unstable/llm-connections` e
// variantes) — se faltar, o script registra PENDENTE-KAIRO e sai com
// código 2, sem criar nada pela metade.
//
// Idempotente: GET antes de POST; rule existente é sincronizada por PATCH
// (sampling/filter/enabled conforme env). Credenciais: ambiente primeiro,
// cofre depois (`secrets.sh get-key pi-agentes-aja-langfuse <CHAVE>`), mesmo
// mecanismo do `scripts/langfuse-smoke.ts`. Nada aqui imprime chave.
//
// GATE: `pnpm tsx scripts/langfuse-judge-online.ts` → evaluator + rule criados
// (ou sincronizados) e conferência de vida pelo último score
// `GET /api/public/v3/scores?name=judge_avancou&limit=1` — o end-to-end
// (score produzido em minutos) depende da LLM Connection (PENDENTE-KAIRO).

import { execFileSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";

const COFRE = "pi-agentes-aja-langfuse";

type Credenciais = { baseUrl: string; publicKey: string; secretKey: string };

/** Nome do evaluator = nome do score gravado (consumido pelo monitor B11). */
const NOME_PADRAO = "judge_avancou";

/** Lê uma credencial do cofre (nunca imprime o valor). */
function doCofre(chave: string): string | undefined {
	try {
		const valor = execFileSync("secrets.sh", ["get-key", COFRE, chave], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		return valor.length > 0 ? valor : undefined;
	} catch {
		return undefined;
	}
}

export function credenciais(
	env: Record<string, string | undefined> = process.env,
	lerCofre: (chave: string) => string | undefined = doCofre,
): Credenciais | null {
	const doAmbiente = (chave: string) => env[chave]?.trim() || undefined;
	const baseUrl = doAmbiente("LANGFUSE_BASE_URL") ?? lerCofre("LANGFUSE_BASE_URL");
	const publicKey = doAmbiente("LANGFUSE_PUBLIC_KEY") ?? lerCofre("LANGFUSE_PUBLIC_KEY");
	const secretKey = doAmbiente("LANGFUSE_SECRET_KEY") ?? lerCofre("LANGFUSE_SECRET_KEY");
	if (!baseUrl || !publicKey || !secretKey) return null;
	return { baseUrl, publicKey, secretKey };
}

function autorizacao(cred: Credenciais): string {
	return "Basic " + Buffer.from(`${cred.publicKey}:${cred.secretKey}`).toString("base64");
}

function api(cred: Credenciais, caminho: string): string {
	return `${cred.baseUrl.replace(/\/$/, "")}${caminho}`;
}

// ---------------------------------------------------------------------------
// Configuração por env
// ---------------------------------------------------------------------------

export type Configuracao = {
	nome: string;
	sampling: number;
	provider: string;
	model: string;
};

/** `LANGFUSE_JUDGE_SAMPLING` é a fração 0<s≤1 (1 = todo turno; produção deve
 *  usar < 1). `LANGFUSE_JUDGE_PROVIDER`/`LANGFUSE_JUDGE_MODEL` apontam para a
 *  LLM Connection da instância — o gateway LiteLLM local (127.0.0.1:4100) NÃO
 *  é alcançável da instância remota, então o modelo vem de provider público
 *  configurado na UI. */
export function configuracao(env: Record<string, string | undefined> = process.env): Configuracao {
	const bruto = env["LANGFUSE_JUDGE_SAMPLING"]?.trim() || "1";
	const sampling = Number(bruto);
	return {
		nome: env["LANGFUSE_JUDGE_NAME"]?.trim() || NOME_PADRAO,
		sampling: Number.isFinite(sampling) ? Math.min(1, Math.max(0.0001, sampling)) : 1,
		provider: env["LANGFUSE_JUDGE_PROVIDER"]?.trim() || "anthropic",
		model: env["LANGFUSE_JUDGE_MODEL"]?.trim() || "claude-sonnet-4-6",
	};
}

// ---------------------------------------------------------------------------
// Rubrica — texto portado de `src/lib/eval/rubric.ts` (RUBRIC_SYSTEM_PROMPT).
// Mesmas dimensões, mesmas âncoras, mesmo corte ("não dê 0.5 por preguiça").
// Ajuste único: o transcript aqui é UM TURNO (input = system + histórico +
// tools do turno; output = fala do vendedor), e o resultado é um número —
// a média das 5 dimensões — porque o evaluator da instância só emite um score.
// ---------------------------------------------------------------------------

export const PROMPT_DO_JUIZ = `# Avaliador de qualidade — Aja Agora

Você é um avaliador de qualidade de conversas entre usuários e o agente IA do Aja Agora,
plataforma B2C de consórcio AI-first onde o agente conduz a jornada do cliente do "quero
comprar X" **até o contrato**, sozinho: ele qualifica, busca ofertas reais na
administradora, simula, ajuda a escolher a cota e fecha a proposta. Sem corretor humano.

Captura de lead NÃO é o objetivo — é meio de caminho. A conversa que termina com lead
capturado e nenhuma proposta gerada é uma conversa que não converteu; a dimensão de
conversão é medida deterministicamente fora deste julgamento.

Você recebe UM TURNO da conversa: o INPUT do vendedor (system da caixa de prompt +
histórico + definição das ferramentas) e o OUTPUT (a fala que ele produziu). Dê nota de
0 a 1 em **5 dimensões** do turno, com reasoning curto (1-2 linhas em português) citando
evidência específica do texto, e devolva como SCORE a MÉDIA das 5 dimensões.

**O funil tem que ANDAR.** Ao avaliar continuidade e assertividade, pergunte-se: depois de
o cliente ver as ofertas reais, o agente o levou a escolher uma cota e a fechar — ou ficou
conversando bonito enquanto a jornada parava? Devolver ao cliente uma decisão que o agente
tinha como tomar ("qual delas você prefere?" sobre um dado que ele possui) é falha de
condução, mesmo quando a frase é educada e o tom é ótimo. Se o input trouxer resultado de
ferramenta, ele é FATO do servidor: leve-o em conta em vez de contorná-lo.

REGRA CRÍTICA: você avalia **apenas o agente IA**. Se o histórico mostrar que a conversa
virou handoff humano em algum ponto, ignore os turnos pós-handoff e foque só nas decisões
do agente.

## Dimensões

### 1. Engajamento (sinal do usuário)
O quanto o usuário se manteve engajado durante a conversa.
- 1.0: respondeu todos os turnos, conversa avançou até o objetivo
- 0.5: respondeu parcialmente, mensagens cada vez mais curtas
- 0.0: sumiu cedo, agente falando sozinho

Se o histórico mostrar que a conversa fechou com lead capturado, considere ≥ 0.85 mesmo
com respostas rascas — o engajamento foi suficiente pro objetivo.

### 2. Discovery (coleta de contexto)
Se o agente coletou as informações necessárias antes de avançar pra recomendação.
- 1.0: campos requeridos preenchidos, perguntas feitas de forma natural e contextual
- 0.5: pulou ou bloqueou em alguma pergunta crítica, ou martelou perguntas
- 0.0: foi direto pra recomendação sem coletar dados

Mas avalie também a **naturalidade** da coleta — agente que repete perguntas que o usuário
já respondeu indica falha de leitura, mesmo que o coverage final seja alto.

### 3. Continuidade (coerência turn-a-turn)
Se a conversa foi coerente. Sem sinal determinístico — leia o histórico.
- 1.0: agente referencia contexto anterior, transições suaves, não repete
- 0.5: alguns lapsos pontuais
- 0.0: ignora histórico, repete pergunta já respondida, abandona thread

### 4. Naturalidade (tom, canal, persona)
Se o tom e a forma estão alinhados com a persona configurada e o canal da conversa.
- 1.0: tom condiz com persona, linguagem ajustada ao expertise, tamanho certo pro canal
- 0.5: aceitável mas com momentos robóticos ou jargão excessivo
- 0.0: completamente desalinhado

Heurísticas:
- Pra **WhatsApp**, mensagens >800 caracteres ou vários parágrafos sem motivo são desvio.
- Pra **leigo**, jargão como "cota", "lance livre", "contemplação" sem explicação é desvio.
- Compare com o segmento da persona (categoria e expertise): o especialista certo
  fala a língua daquele bem.

### 5. Assertividade (correção factual e decisões)
Se a informação dada está correta e se as decisões foram acertadas.
- 1.0: dados específicos têm origem em resultados de ferramenta do histórico, ferramentas
  usadas no momento certo, handoff acionado quando devia, não cita tópicos proibidos
- 0.5: lapsos não-críticos
- 0.0: alucinação clara, promete contemplação, fala tópico proibido, deixa de escalar quando precisava

Número citado que não aparece em nenhum resultado de ferramenta do histórico é sinal forte
de alucinação.
Tópico proibido é o que a lei ou a administradora proíbe (promessa de contemplação,
reserva de cota, consultoria jurídica) — não existe lista por persona.

## Flags (peso no score, quando cabem)

- **hallucination**: agente inventou dado factual (número fabricado, prazo inventado,
  promessa de contemplação). Geralmente vem com assertividade < 0.5.
- **missedHandoff**: usuário deu sinais claros (frustração, dúvida complexa, pediu humano)
  e o agente não escalou.
- **incompleteDiscovery**: discovery < 0.4 — pulou coleta crítica antes de avançar.
- **lowEngagement**: engagement < 0.3 — usuário desengajou cedo, possivelmente por falha do agente.

## Output

SCORE = média aritmética das 5 dimensões (0 a 1). REASONING: 1-2 linhas em pt-BR, citando
a dimensão mais fraca e a evidência específica. Seja honesto e específico. Não dê 0.5 por
preguiça — escolha entre 0.3-0.4 (mais ruim que bom) ou 0.6-0.7 (mais bom que ruim) quando
o caso for misto.

## Exemplo

INPUT: histórico onde o usuário disse "quero uma moto por até R$ 300 de parcela".
OUTPUT: agente acolhe, pergunta crédito/pentrada antes de buscar grupos e cita parcela
"R$ 290" vinda de resultado de ferramenta.

Output esperado: score ≈ 0.94 (0.9/1.0/0.95/0.85/1.0), reasoning citando a coleta natural
e a parcela ancorada na ferramenta.`;

/** Entrada do prompt (mesmos nomes usados no mapping da rule). */
const VARIÁVEIS = [
	{
		variable: "entrada",
		source: "input" as const,
	},
	{
		variable: "saida",
		source: "output" as const,
	},
];

/** Filtro: só a root observation do turno (`isRootObservation = true`). O
 *  `Conversational Turn` root carrega o mesmo input/output que o trace
 *  carregava — trace-level rule é desprecado na v4. */
export function filtroRaiz(): Array<{
	column: "isRootObservation";
	type: "boolean";
	operator: "=";
	value: boolean;
}> {
	return [{ column: "isRootObservation", type: "boolean", operator: "=", value: true }];
}

// ---------------------------------------------------------------------------
// API instável
// ---------------------------------------------------------------------------

type Evaluator = { id: string; name: string; scope: string; version: number };
type Rule = {
	id: string;
	name: string;
	enabled?: boolean;
	sampling?: number | null;
	filter?: unknown;
};

type RespostaLista<T> = { data?: Array<T>; meta?: { page?: number; totalPages?: number } };

async function listar<T>(fetchFn: typeof fetch, cred: Credenciais, caminho: string): Promise<T[]> {
	const itens: T[] = [];
	let page = 1;
	for (;;) {
		const resposta = await fetchFn(api(cred, `${caminho}?page=${page}&limit=50`), {
			headers: { Authorization: autorizacao(cred) },
			signal: AbortSignal.timeout(15_000),
		});
		if (!resposta.ok) {
			throw new Error(`GET ${caminho} (página ${page}) → HTTP ${resposta.status}`);
		}
		const corpo = (await resposta.json()) as RespostaLista<T>;
		itens.push(...(corpo.data ?? []));
		const total = corpo.meta?.totalPages ?? 1;
		if (page >= total) return itens;
		page += 1;
	}
}

async function postar<T>(
	fetchFn: typeof fetch,
	cred: Credenciais,
	caminho: string,
	body: unknown,
): Promise<{ status: number; corpo: T | null }> {
	const resposta = await fetchFn(api(cred, caminho), {
		method: "POST",
		headers: { Authorization: autorizacao(cred), "Content-Type": "application/json" },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(20_000),
	});
	const texto = await resposta.text();
	let corpo: T | null = null;
	try {
		corpo = texto ? (JSON.parse(texto) as T) : null;
	} catch {
		corpo = null;
	}
	return { status: resposta.status, corpo };
}

/** A preflight falha quando o projeto não tem LLM Connection — o único
 *  bloqueio que o script não resolve por API (criação de connection é UI). */
export function ehFalhaDeConexao(corpo: unknown): boolean {
	return (
		typeof corpo === "object" &&
		corpo !== null &&
		(corpo as { code?: string }).code === "evaluator_preflight_failed"
	);
}

export type ResultadoExecucao = {
	ok: boolean;
	pendenteConexao?: string;
	motivo?: string;
	criados: string[];
	sincronizados: string[];
	ultimoScore: string | null;
};

/** Conferência de vida: o último score do juiz (endpoint v3). Score produzido
 *  recentemente = automação viva; `active` da rule não prova nada (caso
 *  medido: rule enabled:false com homônima active ficou 3 dias parada). */
export async function ultimoScore(
	fetchFn: typeof fetch,
	cred: Credenciais,
	nome: string,
): Promise<string | null> {
	const resposta = await fetchFn(
		api(cred, `/api/public/v3/scores?name=${encodeURIComponent(nome)}&limit=1`),
		{ headers: { Authorization: autorizacao(cred) }, signal: AbortSignal.timeout(15_000) },
	);
	if (!resposta.ok) return null;
	const corpo = (await resposta.json()) as {
		data?: Array<{ name: string; value: number; timestamp: string }>;
	};
	const primeiro = corpo.data?.[0];
	if (!primeiro) return null;
	return `${primeiro.value} @ ${primeiro.timestamp}`;
}

export async function executar(
	env: Record<string, string | undefined> = process.env,
	lerCofre: (chave: string) => string | undefined = doCofre,
	fetchFn: typeof fetch = fetch,
): Promise<ResultadoExecucao> {
	const cred = credenciais(env, lerCofre);
	if (!cred) {
		return {
			ok: false,
			motivo: "sem credenciais no ambiente e no cofre — script não roda",
			criados: [],
			sincronizados: [],
			ultimoScore: null,
		};
	}
	const cfg = configuracao(env);

	// 1. Evaluator (cria só se não existe; idempotente).
	const evaluators = await listar<Evaluator>(fetchFn, cred, "/api/public/unstable/evaluators");
	const criados: string[] = [];
	const sincronizados: string[] = [];
	if (evaluators.some((e) => e.name === cfg.nome)) {
		sincronizados.push(`evaluator:${cfg.nome}`);
	} else {
		const { status, corpo } = await postar<{ code?: string; message?: string }>(
			fetchFn,
			cred,
			"/api/public/unstable/evaluators",
			{
				name: cfg.nome,
				prompt: PROMPT_DO_JUIZ,
				outputDefinition: {
					dataType: "NUMERIC",
					reasoning: {
						description:
							"1-2 linhas em pt-BR citando a dimensão mais fraca e a evidência específica.",
					},
					score: {
						description:
							"Média aritmética das 5 dimensões da rubrica (engajamento, discovery, continuidade, naturalidade, assertividade), 0 a 1.",
					},
				},
				modelConfig: { provider: cfg.provider, model: cfg.model },
			},
		);
		if (status === 422 && ehFalhaDeConexao(corpo)) {
			return {
				ok: false,
				pendenteConexao: `PENDENTE-KAIRO — LLM Connection: a instância não tem conexão de LLM no projeto. A API pública não cria connection (404 medido). Criar na UI em Settings → LLM Connections (${cred.baseUrl}/project/<id>/settings/llm-connections): o gateway LiteLLM local (127.0.0.1:4100) não é alcançável da instância remota — usar provider público (padrão deste script: ${cfg.provider} / ${cfg.model}). Depois: rerun deste script.`,
				criados,
				sincronizados,
				ultimoScore: null,
			};
		}
		if (status < 200 || status >= 300) {
			return {
				ok: false,
				motivo: `POST /api/public/unstable/evaluators → HTTP ${status}: ${JSON.stringify(corpo)}`,
				criados,
				sincronizados,
				ultimoScore: null,
			};
		}
		criados.push(`evaluator:${cfg.nome}`);
	}

	// 2. Rule (target observation SEMPRE; trace-level não se usa).
	const filtro = filtroRaiz();
	const regras = await listar<Rule>(fetchFn, cred, "/api/public/unstable/evaluation-rules");
	const regra = regras.find((r) => r.name === cfg.nome);
	if (regra) {
		const resposta = await fetchFn(api(cred, `/api/public/unstable/evaluation-rules/${regra.id}`), {
			method: "PATCH",
			headers: { Authorization: autorizacao(cred), "Content-Type": "application/json" },
			body: JSON.stringify({ enabled: true, sampling: cfg.sampling, filter: filtro }),
			signal: AbortSignal.timeout(20_000),
		});
		if (resposta.status < 200 || resposta.status >= 300) {
			return {
				ok: false,
				motivo: `PATCH /api/public/unstable/evaluation-rules/${regra.id} → HTTP ${resposta.status}`,
				criados,
				sincronizados,
				ultimoScore: null,
			};
		}
		sincronizados.push(`rule:${cfg.nome}`);
	} else {
		const { status, corpo } = await postar<{ message?: string }>(
			fetchFn,
			cred,
			"/api/public/unstable/evaluation-rules",
			{
				target: "observation",
				name: cfg.nome,
				evaluator: { name: cfg.nome, scope: "project" },
				enabled: true,
				mapping: VARIÁVEIS,
				sampling: cfg.sampling,
				filter: filtro,
			},
		);
		if (status < 200 || status >= 300) {
			return {
				ok: false,
				motivo: `POST /api/public/unstable/evaluation-rules → HTTP ${status}: ${JSON.stringify(corpo)}`,
				criados,
				sincronizados,
				ultimoScore: null,
			};
		}
		criados.push(`rule:${cfg.nome}`);
	}

	// 3. Conferência de vida pelo último score (runbook).
	return {
		ok: true,
		criados,
		sincronizados,
		ultimoScore: await ultimoScore(fetchFn, cred, cfg.nome),
	};
}

function ehProcessoPrincipal(): boolean {
	const alvo = process.argv[1];
	if (!alvo) return false;
	const alvoAbs = isAbsolute(alvo) ? alvo : resolve(alvo);
	return import.meta.url === `file://${alvoAbs}`;
}

if (ehProcessoPrincipal()) {
	void (async () => {
		const resultado = await executar();
		if (resultado.pendenteConexao) {
			console.error(`[langfuse-judge-online] ${resultado.pendenteConexao}`);
			process.exit(2);
		}
		if (!resultado.ok) {
			console.error(`[langfuse-judge-online] FALHOU: ${resultado.motivo ?? "motivo desconhecido"}`);
			process.exit(1);
		}
		console.log(
			`judge online: ${resultado.criados.length} criado(s), ${resultado.sincronizados.length} já existente(s) (idempotente)`,
		);
		for (const item of resultado.criados) console.log(`  criado      ${item}`);
		for (const item of resultado.sincronizados) console.log(`  existente   ${item}`);
		console.log(`  último score judge_avancou: ${resultado.ultimoScore ?? "nenhum ainda"}`);
		if (!resultado.ultimoScore) {
			console.error(
				"[langfuse-judge-online] ATENÇÃO: nenhum score ainda — a rule pode estar criada mas sem gatilho disparado; conferir pelo runbook (docs/observabilidade/juiz-online.md).",
			);
		}
		process.exit(0);
	})();
}
