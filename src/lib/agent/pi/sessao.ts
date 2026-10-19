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
import {
	createAgentSession,
	DefaultResourceLoader,
	type ExtensionAPI,
	ModelRuntime,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { MensagemDaConversa } from "@/lib/agent/turn/estado";
import type { PiToolDefinition } from "./tools";

/** Modelo do agente — mesma regra do resto do app (`?.trim() ||`, porque o
 * compose materializa a var vazia). */
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
				return new URL(direto).host;
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
	session: Awaited<ReturnType<typeof createAgentSession>>["session"];
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

	const loader = new DefaultResourceLoader({
		cwd,
		agentDir,
		noSkills: true,
		systemPrompt: args.system,
		extensionFactories: [
			(pi: ExtensionAPI) => {
				for (const tool of args.tools) pi.registerTool(tool as never);
			},
		],
	});
	await loader.reload();

	const runtime = await ModelRuntime.create({
		authPath: join(agentDir, "auth.json"),
		modelsPath: join(agentDir, "models.json"),
	});
	const modelo = runtime.getModel(provider.id, provider.model);
	if (!modelo) throw new Error(`[pi/sessao] modelo ${provider.id}/${provider.model} não resolvido`);

	// Histórico do banco → entries da sessão (papel + texto, nada de framework).
	const entries = (args.historico ?? []).map((m) => ({
		type: "message" as const,
		message: { role: m.role, content: [{ type: "text" as const, text: m.content }] },
	}));

	const { session } = await createAgentSession({
		cwd,
		agentDir,
		model: modelo as never,
		modelRuntime: runtime,
		resourceLoader: loader,
		sessionManager: SessionManager.inMemory(cwd, undefined, entries as never),
		settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
		noTools: "builtin",
	});

	return { session, agentDir, cwd };
}
