#!/usr/bin/env node
// run-scenario.mjs — roda um ROTEIRO (lista de turnos do usuário) do início ao fim
// contra o /api/chat e escreve o dossiê (dossie.json + dossie.md) na pasta de saída.
//
// Uso:
//   node run-scenario.mjs <roteiro.json> <pasta-saida> [baseUrl]
//
// Formato do roteiro (JSON):
//   {
//     "cenario": "madalena-junta",
//     "descricao": "...",
//     "turns": [
//       { "type": "text",   "text": "oi", "expect": "welcome (3 categorias)" },
//       { "type": "action", "action": {"kind":"category","category":"imovel"},
//         "label": "Imóvel", "expect": "transição Helena + gate name" },
//       { "type": "text",   "text": "quero ver mais opções", "repeat": 2, "expect": "..." }
//     ]
//   }
//
// Cada turno pode ter:
//   - type: "text" | "action"  (opcional; inferido de text/action)
//   - text | action | label
//   - expect: GABARITO (o que a jornada canônica manda o agente fazer/emitir aqui)
//   - repeat: N  -> repete o MESMO turno N vezes (cada um vira um turno registrado)
//   - waitMs: N  -> espera N ms ANTES de enviar (útil pra sondas de timing)
//   - note: comentário livre
//
// O conversationId é gerado fresco por execução; o histórico é server-side.

import { mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { DEFAULT_BASE_URL, sendTurn } from "./chat-client.mjs";

const [, , roteiroPath, outDirArg, baseUrlArg] = process.argv;
if (!roteiroPath || !outDirArg) {
	console.error("uso: node run-scenario.mjs <roteiro.json> <pasta-saida> [baseUrl]");
	process.exit(2);
}
const baseUrl = baseUrlArg || DEFAULT_BASE_URL;
const outDir = resolve(outDirArg);

const roteiro = JSON.parse(readFileSync(resolve(roteiroPath), "utf8"));
const cenario = roteiro.cenario ?? basename(roteiroPath).replace(/\.json$/, "");

// Substituição de placeholders `${VAR}` pelos valores do AMBIENTE — pra o
// CPF/celular de teste (PII do vault) NUNCA ficarem versionados no roteiro. O
// coletor exporta E2E_TEST_CPF (via `secrets.sh decrypt contas-teste`) e
// E2E_TEST_CELULAR (default SIMULATOR_TEST_CELULAR) antes de rodar. Mesma
// disciplina dos specs Playwright (que dão test.skip sem as env vars).
if (!process.env.E2E_TEST_CELULAR && process.env.SIMULATOR_TEST_CELULAR) {
	process.env.E2E_TEST_CELULAR = process.env.SIMULATOR_TEST_CELULAR;
}
const missingVars = new Set();
function expandEnv(value) {
	if (typeof value === "string") {
		return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_m, name) => {
			const v = process.env[name];
			if (v == null || v === "") {
				missingVars.add(name);
				return `\${${name}}`; // deixa o placeholder visível se faltar
			}
			return v;
		});
	}
	if (Array.isArray(value)) return value.map(expandEnv);
	if (value && typeof value === "object") {
		const out = {};
		for (const [k, v] of Object.entries(value)) out[k] = expandEnv(v);
		return out;
	}
	return value;
}

// Expande `repeat` em turnos individuais, preservando `expect`/`note`.
const turns = [];
for (const t of roteiro.turns ?? []) {
	const n = Number.isInteger(t.repeat) && t.repeat > 1 ? t.repeat : 1;
	for (let i = 0; i < n; i++) {
		turns.push({ ...t, _rep: n > 1 ? `${i + 1}/${n}` : null });
	}
}

const conversationId = crypto.randomUUID();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.error(`[run-scenario] cenario=${cenario} conv=${conversationId} turns=${turns.length}`);

const dossie = [];
let idx = 0;
for (const t of turns) {
	idx += 1;
	if (Number.isInteger(t.waitMs) && t.waitMs > 0) await sleep(t.waitMs);
	const turnSpec = t.action
		? { action: expandEnv(t.action), label: expandEnv(t.label) }
		: { text: expandEnv(t.text) };
	const res = await sendTurn(baseUrl, conversationId, turnSpec, { timeoutMs: t.timeoutMs ?? 90_000 });
	const rec = {
		turn: idx,
		rep: t._rep,
		userMsg: res.userMsg,
		expect: t.expect ?? null,
		note: t.note ?? null,
		agentText: res.agentText,
		artifacts: res.artifacts,
		artifactTypes: res.artifacts.map((a) => a.type),
		error: res.error,
		httpStatus: res.httpStatus,
		elapsedMs: res.elapsedMs,
	};
	dossie.push(rec);
	const flags = [];
	if (res.error) flags.push(`ERRO=${res.error}`);
	if (res.elapsedMs > 20_000) flags.push(`LENTO=${(res.elapsedMs / 1000).toFixed(1)}s`);
	console.error(
		`  turno ${idx}${t._rep ? ` (rep ${t._rep})` : ""}: http=${res.httpStatus} ${res.elapsedMs}ms ` +
			`texto=${res.agentText.length}c artifacts=[${rec.artifactTypes.join(", ")}] ${flags.join(" ")}`,
	);
}

await mkdir(outDir, { recursive: true });

const dossieJson = {
	cenario,
	descricao: roteiro.descricao ?? null,
	conversationId,
	baseUrl,
	geradoEm: new Date().toISOString(),
	turnos: dossie,
};
await writeFile(`${outDir}/dossie.json`, JSON.stringify(dossieJson, null, 2), "utf8");

// dossiê legível
const lines = [];
lines.push(`# Dossiê — cenário ${cenario}`);
lines.push("");
lines.push(`- conversationId: \`${conversationId}\``);
lines.push(`- baseUrl: ${baseUrl}`);
lines.push(`- geradoEm: ${dossieJson.geradoEm}`);
if (roteiro.descricao) lines.push(`- descrição: ${roteiro.descricao}`);
lines.push("");
for (const r of dossie) {
	lines.push(`## Turno ${r.turn}${r.rep ? ` (repetição ${r.rep})` : ""}`);
	if (r.expect) lines.push(`> **Esperado (gabarito):** ${r.expect}`);
	if (r.note) lines.push(`> _nota:_ ${r.note}`);
	lines.push("");
	lines.push(`**User:** ${r.userMsg || "(vazio)"}`);
	lines.push("");
	lines.push(`**Agente:** ${r.agentText ? r.agentText : "_(sem texto)_"}`);
	lines.push("");
	const arts = r.artifacts.length
		? r.artifacts.map((a) => `\`${a.type}\``).join(", ")
		: "_(nenhum)_";
	lines.push(`**Artifacts:** ${arts}`);
	lines.push(
		`**Meta:** http=${r.httpStatus} · ${r.elapsedMs}ms${r.error ? ` · ERRO: ${r.error}` : ""}`,
	);
	lines.push("");
	lines.push("---");
	lines.push("");
}
await writeFile(`${outDir}/dossie.md`, lines.join("\n"), "utf8");

const erros = dossie.filter((d) => d.error).length;
if (missingVars.size > 0) {
	console.error(
		`[run-scenario] ⚠️  env FALTANDO (placeholders não expandidos): ${[...missingVars].join(", ")} — ` +
			`exporte-as (ex.: E2E_TEST_CPF via 'secrets.sh decrypt contas-teste') antes de rodar cenários que passam pelo identify.`,
	);
}
console.error(
	`[run-scenario] concluído: ${dossie.length} turnos, ${erros} com erro → ${outDir}/dossie.{json,md}`,
);
