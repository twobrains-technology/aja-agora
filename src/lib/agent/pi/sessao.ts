// A SESSÃO DO PI — montada por turno, sem nada do disco do host.
//
// O que este módulo garante (e que o spike da fase 4 provou item por item):
//  · `DefaultResourceLoader` com `cwd`/`agentDir` em diretório VAZIO: nenhuma
//    descoberta de AGENTS.md, skill ou extension da máquina;
//  · `noTools: "builtin"` — o modelo NUNCA tem read/bash/edit/write/grep/find/ls;
//  · só as tools de negócio registradas por `extensionFactories`, inline;
//  · o system prompt vem da CAIXA (banco), nunca de arquivo descoberto;
//  · histórico vem do banco por turno (`SessionManager.inMemory(cwd, opts, entries)`),
//    que é a régua de durabilidade escolhida no parecer do spike: reproduz o
//    comportamento atual (MemorySaver in-process) e não cria I/O de sessão.

import dns from "node:dns/promises";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// O PACOTE DO PI É ESM-ONLY e entra por `import()` DINÂMICO, de propósito.
//
// Num bundle CJS (o server do Next) um `require()` dele estoura com
// `ERR_PACKAGE_PATH_NOT_EXPORTED`, porque o `exports` do pacote só declara a
// condição `import`. O `import()` mantém o carregamento em ESM nos dois mundos:
// no vitest (ESM nativo) e no bundle do Next, que preserva `import()` para
// módulo ESM marcado como externo.
import type * as PiPacote from "@earendil-works/pi-coding-agent";
import type { MensagemDaConversa } from "@/lib/agent/turn/estado";
import {
	caminhoDoPluginDoLangfuse,
	comIdentidadeDoTurno,
	ehIdDeSessaoValido,
	langfuseLigado,
} from "./langfuse";
import type { PiToolDefinition } from "./tools";

type PiModule = typeof PiPacote;

let piPromessa: Promise<PiModule> | null = null;

async function carregarPi(): Promise<PiModule> {
	piPromessa ??= import("@earendil-works/pi-coding-agent").catch((erro: unknown) => {
		piPromessa = null; // próxima chamada tenta de novo
		throw erro;
	}) as Promise<PiModule>;
	return piPromessa;
}

export function modeloDoAgente(): string {
	return process.env.AI_MODEL?.trim() || "qwen3.6-flash";
}

const SRV_CACHE_TTL_MS = 30_000;
let cacheGateway: { host: string; expiresAt: number } | null = null;

/** O host do gateway, do mesmo jeito que o caminho AI-SDK resolve: SRV quando
 * `LITELLM_SRV_NAME` existe, senão `LITELLM_BASE_URL` direto. O pi fala
 * `/chat/completions` direto (formato OpenAI), que é o que não quebra tool_choice. */
export async function hostDoGateway(): Promise<string> {
	const srv = process.env.LITELLM_SRV_NAME?.trim();
	if (!srv) {
		const direto = process.env.LITELLM_BASE_URL?.trim();
		if (direto) {
			try {
				const u = new URL(direto);
				const porta = u.port || "4000";
				// Resolve por `lookup` (getaddrinfo), NÃO por `resolve4`: os hosts
				// `.orb.local` do Mac não têm registro A em DNS — só respondem pelo
				// resolvedor do sistema, e `resolve4` devolve erro (medido 19/10/2026).
				// Fixando IPv4 aqui, o fetch do pi não cai no endereço IPv6 do OrbStack,
				// que é inalcançável e aparecia como "Connection error." no turno.
				try {
					const { address } = await dns.lookup(u.hostname, { family: 4 });
					if (address) return `${address}:${porta}`;
				} catch {
					// sem endereço: usa o hostname como veio
				}
				return `${u.hostname}:${porta}`;
			} catch {
				// cai no default abaixo
			}
		}
		return "litellm-srv.tb.local:4000";
	}
	if (cacheGateway && Date.now() < cacheGateway.expiresAt) return cacheGateway.host;
	try {
		const registros = await dns.resolveSrv(srv);
		if (registros.length === 0) return "litellm-srv.tb.local:4000";
		const r = [...registros].sort((a, b) => a.priority - b.priority || b.weight - a.weight)[0];
		const ips = await dns.resolve4(r.name);
		const host = ips.length > 0 ? `${ips[0]}:${r.port}` : "litellm-srv.tb.local:4000";
		cacheGateway = { host, expiresAt: Date.now() + SRV_CACHE_TTL_MS };
		return host;
	} catch {
		return "litellm-srv.tb.local:4000";
	}
}

export function resetHostDoGateway(): void {
	cacheGateway = null;
}

export type SessaoAberta = {
	session: Awaited<ReturnType<PiModule["createAgentSession"]>>["session"];
	/** Diretório descartável da sessão — some com o processo. */
	agentDir: string;
	cwd: string;
};

/** Abre a sessão do pi para UM turno.
 *
 * `historico` hidrata a conversa (o banco é a memória); `system` é o system do
 * beat montado pela caixa + fatos; `tools` é o conjunto que este beat liga. */
export async function abrirSessao(args: {
	system: string;
	tools: PiToolDefinition[];
	historico?: MensagemDaConversa[];
	/** Id da CONVERSA (uuid do banco). Com a observabilidade ligada, é ele que vira
	 *  `session_id` no Langfuse — uma conversa é UMA sessão lá, não uma por turno.
	 *  Sem as envs do Langfuse, este campo não tem efeito nenhum. */
	conversaId?: string;
	/** Chave estável da PESSOA no canal (cookie `AJA_UID` na web, `wa:<telefone>`
	 *  no WhatsApp) — a regra do `origin/main`. Vira `userId` no trace. Sem as
	 *  envs do Langfuse, não tem efeito nenhum. */
	userId?: string | null;
	/** Injetável para teste: provedor OpenAI-completions falso. */
	provider?: { id: string; baseUrl: string; apiKey: string; model: string };
}): Promise<SessaoAberta> {
	const cwd = mkdtempSync(join(tmpdir(), "aja-pi-projeto-"));
	const agentDir = mkdtempSync(join(tmpdir(), "aja-pi-agent-"));

	const provider = args.provider ?? {
		id: "litellm",
		baseUrl: `http://${await hostDoGateway()}/v1`,
		apiKey: process.env.LITELLM_API_KEY?.trim() || process.env.OPENAI_API_KEY || "sem-chave",
		model: modeloDoAgente(),
	};

	writeFileSync(
		join(agentDir, "models.json"),
		JSON.stringify({
			providers: {
				[provider.id]: {
					baseUrl: provider.baseUrl,
					api: "openai-completions",
					apiKey: provider.apiKey,
					models: [{ id: provider.model }],
				},
			},
		}),
	);
	writeFileSync(join(agentDir, "auth.json"), JSON.stringify({}));

	const pi = await carregarPi();
	const {
		createAgentSession,
		DefaultResourceLoader,
		ModelRuntime,
		SessionManager,
		SettingsManager,
	} = pi;

	// Resolvido UMA vez: a função também prepara o `PI_LANGFUSE_MAX_CHARS`, que o
	// plugin lê no load do módulo.
	const pluginDoLangfuse = caminhoDoPluginDoLangfuse();

	const loader = new DefaultResourceLoader({
		cwd,
		agentDir,
		noSkills: true,
		systemPrompt: args.system,
		extensionFactories: [
			(api: PiPacote.ExtensionAPI) => {
				for (const tool of args.tools) api.registerTool(tool as never);
			},
		],
		// A OBSERVABILIDADE entra por caminho, não por código importado: o plugin
		// publicado é TypeScript cru e sem `main`/`exports`, então quem transpila é o
		// jiti que o próprio Pi usa para carregar extensão (ver `langfuse.ts`). Sem as
		// três envs, a lista é vazia e a sessão é exatamente a de antes.
		additionalExtensionPaths: pluginDoLangfuse ? [pluginDoLangfuse] : [],
	});
	// A extensão do Langfuse lê `LANGFUSE_USER_ID` no instante em que é carregada, e
	// é aqui que ela é carregada. `comIdentidadeDoTurno` põe a identidade da pessoa
	// em volta só deste `reload()` e devolve o ambiente como estava — desligada a
	// observabilidade, chama a função direto, sem fila.
	await comIdentidadeDoTurno(args.userId, () => loader.reload());

	const runtime = await ModelRuntime.create({
		authPath: join(agentDir, "auth.json"),
		modelsPath: join(agentDir, "models.json"),
	});
	const modelo = runtime.getModel(provider.id, provider.model);
	if (!modelo) throw new Error(`[pi/sessao] modelo ${provider.id}/${provider.model} não resolvido`);

	// Histórico do banco → entries da sessão. Cada entry PRECISA de `id` e `parentId`
	// encadeados: o SessionManager monta o contexto andando do leaf até a raiz pelos
	// `parentId`. Sem eles só a ÚLTIMA mensagem sobrevive e o agente fica sem memória
	// (medido em 25/10/2026: "50 mil" respondido como se a conversa tivesse acabado de
	// abrir, de novo "oi, bem-vindo").
	let anterior: string | null = null;
	const base = Date.now() - (args.historico?.length ?? 0) * 1000;
	const entries = (args.historico ?? []).map((m, i) => {
		const id = `hist-${i}`;
		const quando = base + i * 1000;
		const entry = {
			type: "message" as const,
			id,
			parentId: anterior,
			timestamp: new Date(quando).toISOString(),
			message:
				m.role === "assistant"
					? {
							role: "assistant" as const,
							content: [{ type: "text" as const, text: m.content }],
							// O pi lê `usage` das falas do assistente ao estimar o contexto; sem ele
							// o turno morre com "Cannot read properties of undefined (totalTokens)".
							api: "openai-completions",
							provider: provider.id,
							model: provider.model,
							usage: {
								input: 0,
								output: 0,
								cacheRead: 0,
								cacheWrite: 0,
								totalTokens: 0,
								cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
							},
							stopReason: "stop" as const,
							timestamp: quando,
						}
					: {
							role: "user" as const,
							content: [{ type: "text" as const, text: m.content }],
							timestamp: quando,
						},
		};
		anterior = id;
		return entry;
	});

	// ID DA SESSÃO — o `session_id` que o Langfuse vai mostrar.
	//
	// O plugin lê `ctx.sessionManager.getSessionId()`, então o id tem de entrar AQUI.
	// Só vale com a observabilidade ligada (fora dela, o comportamento é o de sempre,
	// byte por byte) e só com id no formato que o Pi aceita: `assertValidSessionId`
	// LANÇA dentro do turno, e um id estranho derrubaria a fala do cliente por causa
	// de observabilidade — o oposto do que este módulo promete.
	const idDaSessao =
		langfuseLigado() && ehIdDeSessaoValido(args.conversaId) ? args.conversaId : undefined;

	const { session } = await createAgentSession({
		cwd,
		agentDir,
		model: modelo as never,
		modelRuntime: runtime,
		resourceLoader: loader,
		sessionManager: SessionManager.inMemory(
			cwd,
			idDaSessao ? { id: idDaSessao } : undefined,
			entries as never,
		),
		settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
		noTools: "builtin",
	});

	return { session, agentDir, cwd };
}
