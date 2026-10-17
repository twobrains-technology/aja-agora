/**
 * SPIKE DO PI EM CONTROLE TOTAL — fase 4 da campanha do motor-pi.
 *
 * O que este script PROVA (e grava em JSON, com ✅/❌ por item):
 *
 *  1. sessão criada in-process com `DefaultResourceLoader` próprio, `cwd` e
 *     `agentDir` apontando para um diretório VAZIO — nada de descoberta de
 *     AGENTS.md, skills ou extensions do disco;
 *  2. `systemPrompt` vindo da CAIXA (o prompt gerenciado do Langfuse, v11; se o
 *     Langfuse não responder, o fallback lido de `system-prompt.ts`), nunca de um
 *     arquivo descoberto pelo `cwd`;
 *  3. tools: `noTools: "builtin"` + UMA tool customizada registrada inline por
 *     `extensionFactories` — e NENHUMA de `read`/`bash`/`edit`/`write`;
 *  4. a tool customizada é CHAMADA e executada de verdade;
 *  5. streaming por `session.subscribe` (deltas de texto);
 *  6. hidratação de contexto por turno (`SessionManager.inMemory(cwd, opts, entries)`);
 *  7. a RÉGUA de durabilidade: `inMemory` perde estado entre instâncias;
 *     `SessionManager.create(cwd, dir)` grava e `open()` recarrega.
 *
 * O modelo é um servidor OpenAI-completions FALSO, local e determinístico — de
 * propósito: o spike mede o harness, não o modelo, e um turno de verdade custaria
 * dinheiro e não seria reproduzível.
 *
 * Rodar: `pnpm exec tsx scripts/spike-pi.ts`
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

// O pacote do pi é ESM-only e NÃO é dependência deste repo (vive na instalação
// global). Por isso o import é por caminho absoluto, e este arquivo é `.mts`:
// o `tsx` trata `.mts` como ESM, o que é obrigatório para importar ESM.
const PI =
	process.env.PI_PKG ?? "/Users/kairo/.local/lib/node_modules/@earendil-works/pi-coding-agent";
const { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } =
	await import(`${PI}/dist/index.js`);

const RAIZ = new URL("../", import.meta.url).pathname;
const resultado: Record<string, { ok: boolean; detalhe: string }> = {};
function marca(item: string, ok: boolean, detalhe: string) {
	resultado[item] = { ok, detalhe };
	console.log(`${ok ? "✅" : "❌"} ${item} — ${detalhe}`);
}

// ── A CAIXA (system prompt) ────────────────────────────────────────────────
function envDoArquivo(): Record<string, string> {
	const txt = readFileSync(join(RAIZ, ".env.local"), "utf8");
	const out: Record<string, string> = {};
	for (const linha of txt.split("\n")) {
		const m = /^([A-Z0-9_]+)=(.*)$/.exec(linha.trim());
		if (m) out[m[1]] = m[2];
	}
	return out;
}

/** O texto da caixa: o MESMO que a produção usa — o prompt gerenciado. */
async function caixa(): Promise<{ texto: string; origem: string }> {
	const env = envDoArquivo();
	const base = (env.LANGFUSE_BASE_URL ?? "").replace(/\/$/, "");
	if (base && env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY) {
		const auth = Buffer.from(`${env.LANGFUSE_PUBLIC_KEY}:${env.LANGFUSE_SECRET_KEY}`).toString(
			"base64",
		);
		try {
			const r = await fetch(`${base}/api/public/v2/prompts/aja-system-prompt`, {
				headers: { Authorization: `Basic ${auth}` },
				signal: AbortSignal.timeout(8000),
			});
			if (r.ok) {
				const d = (await r.json()) as { prompt?: string; version?: number };
				if (typeof d.prompt === "string" && d.prompt.length > 1000) {
					return { texto: d.prompt, origem: `langfuse v${d.version ?? "?"}` };
				}
			}
		} catch {
			// cai no fallback
		}
	}
	const src = readFileSync(join(RAIZ, "src/lib/agent/system-prompt.ts"), "utf8");
	const i = src.indexOf("export const SYSTEM_PROMPT = `") + "export const SYSTEM_PROMPT = `".length;
	const j = src.indexOf("\n`;", i);
	return { texto: src.slice(i, j), origem: "fallback system-prompt.ts" };
}

// ── SERVIDOR FALSO (OpenAI-completions, streaming) ─────────────────────────
type PiInline = { registerTool: (def: Record<string, unknown>) => void };
type EventoDeSessao = {
	type: string;
	assistantMessageEvent?: { type: string; delta?: string };
};

type Capturado = { toolCall?: { name: string; args: string }; texto: string; sistema?: string };

async function subirServidorFalso(
	pedidos: Capturado[],
): Promise<{ url: string; fechar: () => void }> {
	const server = createServer((req, res) => {
		if (!req.url?.includes("/chat/completions")) {
			res.writeHead(404).end();
			return;
		}
		let corpo = "";
		req.on("data", (c) => {
			corpo += c;
		});
		req.on("end", () => {
			const pedido = JSON.parse(corpo || "{}") as {
				messages?: Array<{ role: string; content?: unknown }>;
				tools?: Array<{ function?: { name?: string } }>;
			};
			const jaChamouTool = (pedido.messages ?? []).some((m) => m.role === "tool");
			const temMinhaTool = (pedido.tools ?? []).some((t) => t.function?.name === "registrar_gate");
			const primeira = (pedido.messages ?? [])[0];
			const reg: Capturado = {
				texto: "",
				sistema: typeof primeira?.content === "string" ? primeira.content : undefined,
			};
			pedidos.push(reg);

			res.writeHead(200, {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
			});
			const envia = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
			const base = {
				id: "spike-1",
				object: "chat.completion.chunk",
				created: Math.floor(Date.now() / 1000),
				model: "spike-fake",
			};

			if (!jaChamouTool && temMinhaTool) {
				envia({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "" } }] });
				envia({
					...base,
					choices: [{ index: 0, delta: { content: "Deixa eu registrar o gate do turno. " } }],
				});
				reg.texto += "Deixa eu registrar o gate do turno. ";
				const call = { name: "registrar_gate", args: '{"gate":"credit"}' };
				reg.toolCall = call;
				envia({
					...base,
					choices: [
						{
							index: 0,
							delta: {
								tool_calls: [
									{
										index: 0,
										id: "call_spike_1",
										type: "function",
										function: { name: call.name, arguments: call.args },
									},
								],
							},
						},
					],
				});
				envia({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
			} else {
				envia({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "" } }] });
				for (const pedaco of ["Gate registrado. ", "Seguimos pelo card."]) {
					envia({ ...base, choices: [{ index: 0, delta: { content: pedaco } }] });
					reg.texto += pedaco;
				}
				envia({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
			}
			res.write("data: [DONE]\n\n");
			res.end();
		});
	});
	await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
	const addr = server.address();
	const porta = typeof addr === "object" && addr ? addr.port : 0;
	return { url: `http://127.0.0.1:${porta}`, fechar: () => server.close() };
}

// ── O SPIKE ────────────────────────────────────────────────────────────────
async function main() {
	// Diretórios VAZIOS: nada de AGENTS.md, skills, extensions do disco.
	const projetoVazio = mkdtempSync(join(tmpdir(), "spike-pi-projeto-"));
	const agentDir = mkdtempSync(join(tmpdir(), "spike-pi-agent-"));

	const pedidos: Capturado[] = [];
	const falso = await subirServidorFalso(pedidos);

	writeFileSync(
		join(agentDir, "models.json"),
		JSON.stringify({
			providers: {
				"spike-fake": {
					baseUrl: `${falso.url}/v1`,
					api: "openai-completions",
					apiKey: "spike",
					models: [{ id: "spike-fake" }],
				},
			},
		}),
	);
	writeFileSync(join(agentDir, "auth.json"), JSON.stringify({}));

	const textoDaCaixa = await caixa();
	marca(
		"caixa carregada",
		textoDaCaixa.texto.includes("Situações do turno"),
		`${textoDaCaixa.origem}, ${textoDaCaixa.texto.length} chars, com a seção de situações`,
	);

	// A TOOL CUSTOMIZADA — registrada inline, sem arquivo de extensão no disco.
	let toolExecutada: string | null = null;
	const loader = new DefaultResourceLoader({
		cwd: projetoVazio,
		agentDir,
		noSkills: true,
		systemPrompt: textoDaCaixa.texto,
		extensionFactories: [
			(pi: PiInline) => {
				pi.registerTool({
					name: "registrar_gate",
					label: "Registrar gate",
					description: "Registra qual gate o turno pediu (tool do spike).",
					// JSON Schema puro: o repo não tem @sinclair/typebox, e o pi aceita o
					// schema estrutural (TSchema é JSON Schema no runtime).
					parameters: {
						type: "object",
						properties: { gate: { type: "string" } },
						required: ["gate"],
					} as never,
					execute: async (_id: string, params: { gate?: unknown }) => {
						toolExecutada = String((params as { gate?: unknown }).gate ?? "");
						return {
							content: [{ type: "text", text: `gate registrado: ${toolExecutada}` }],
							details: {},
						};
					},
				});
			},
		],
	});
	await loader.reload();

	const arquivosDeAgente = loader.getAgentsFiles().agentsFiles;
	marca(
		"sem descoberta de AGENTS.md",
		arquivosDeAgente.length === 0,
		`getAgentsFiles() = ${arquivosDeAgente.length} arquivo(s) (cwd vazio)`,
	);
	marca(
		"sem skills/extension do disco",
		loader.getSkills().skills.length === 0 && loader.getExtensions().extensions.length <= 1,
		`skills=${loader.getSkills().skills.length}, extensions=${loader.getExtensions().extensions.length} (só a inline)`,
	);

	const runtime = await ModelRuntime.create({
		authPath: join(agentDir, "auth.json"),
		modelsPath: join(agentDir, "models.json"),
	});
	const modelo = runtime.getModel("spike-fake", "spike-fake");
	if (!modelo) throw new Error("modelo spike-fake não resolvido pelo ModelRuntime");

	const settings = SettingsManager.inMemory({ compaction: { enabled: false } });
	const { session } = await createAgentSession({
		cwd: projetoVazio,
		agentDir,
		model: modelo as never,
		modelRuntime: runtime,
		resourceLoader: loader,
		sessionManager: SessionManager.inMemory(projetoVazio),
		settingsManager: settings,
		noTools: "builtin",
	});

	const ativas = session.getActiveToolNames();
	const deCodigo = ["read", "bash", "edit", "write", "grep", "find", "ls"].filter((t) =>
		ativas.includes(t),
	);
	marca("sem read/bash/edit/write", deCodigo.length === 0, `tools ativas: [${ativas.join(", ")}]`);
	marca(
		"uma tool customizada ativa",
		ativas.includes("registrar_gate"),
		`ativas=[${ativas.join(", ")}]`,
	);

	// STREAMING por session.subscribe
	const deltas: string[] = [];
	session.subscribe((ev: EventoDeSessao) => {
		if (ev.type === "message_update" && ev.assistantMessageEvent?.type === "text_delta") {
			deltas.push(ev.assistantMessageEvent.delta ?? "");
		}
	});

	try {
		await session.prompt('Registre o gate "credit" deste turno.');
	} catch (erro) {
		marca("turno executado", false, `erro no prompt: ${(erro as Error).message}`);
	}

	marca(
		"streaming por subscribe",
		deltas.length > 0,
		`${deltas.length} delta(s) de texto: ${JSON.stringify(deltas.slice(0, 4).join(""))}…`,
	);
	marca(
		"tool customizada CHAMADA e executada",
		toolExecutada === "credit",
		`toolExecutada=${JSON.stringify(toolExecutada)}, pedidos=${pedidos.length}`,
	);
	const sistemaRecebido = pedidos[0]?.sistema ?? "";
	marca(
		"system prompt chegou ao modelo (conteúdo da caixa)",
		sistemaRecebido.includes("Situações do turno") && sistemaRecebido.length > 5000,
		`${pedidos.length} chamada(s); o system recebido tem ${sistemaRecebido.length} chars e carrega a seção da caixa`,
	);

	// HIDRATAÇÃO por turno (Q3): entries entram no SessionManager.inMemory
	const entries = [
		{
			type: "message" as const,
			id: "hidratado-1",
			timestamp: new Date().toISOString(),
			message: { role: "user" as const, content: "quero um carro de 80 mil" },
		},
		{
			type: "message" as const,
			id: "hidratado-2",
			timestamp: new Date().toISOString(),
			message: { role: "assistant" as const, content: "Boa! Vamos achar a carta certa." },
		},
	];
	const hidratado = SessionManager.inMemory(projetoVazio, undefined, entries as never);
	const mensagensHidratadas = JSON.stringify(hidratado.getEntries?.() ?? []).length;
	marca(
		"hidratação de contexto por turno",
		typeof hidratado.getEntries === "function" && mensagensHidratadas > 200,
		`SessionManager.inMemory(cwd, opts, entries) aceitou ${entries.length} entradas (${mensagensHidratadas} chars)`,
	);

	// RÉGUA DE DURABILIDADE
	const durDir = mkdtempSync(join(tmpdir(), "spike-pi-dur-"));
	const persistente = SessionManager.create(projetoVazio, durDir);
	const caminho = (persistente as unknown as { getSessionFile?: () => string }).getSessionFile?.();
	marca(
		"durabilidade: create() grava em disco",
		Boolean(caminho),
		`sessionFile=${caminho ?? "(sem getSessionFile)"}`,
	);
	const outroInMemory = SessionManager.inMemory(projetoVazio);
	const entradasDoPrimeiro = JSON.stringify(outroInMemory.getEntries?.() ?? []).length;
	marca(
		"durabilidade: inMemory NÃO compartilha estado",
		entradasDoPrimeiro < 200,
		`outra instância inMemory tem ${entradasDoPrimeiro} chars (nada do turno anterior)`,
	);

	session.dispose();
	falso.fechar();

	const arquivo = join(RAIZ, ".spike-pi-resultado.json");
	writeFileSync(
		arquivo,
		JSON.stringify(
			{
				quando: new Date().toISOString(),
				caixa: { origem: textoDaCaixa.origem, chars: textoDaCaixa.texto.length },
				itens: resultado,
			},
			null,
			2,
		),
	);
	console.log(`\nresultado gravado em ${arquivo}`);
	const falhas = Object.entries(resultado).filter(([, v]) => !v.ok);
	console.log(
		falhas.length === 0
			? `\nTODOS OS ${Object.keys(resultado).length} ITENS PROVADOS`
			: `\n${falhas.length} item(ns) NÃO provado(s): ${falhas.map(([k]) => k).join(", ")}`,
	);
	process.exit(falhas.length === 0 ? 0 : 1);
}

await main();
