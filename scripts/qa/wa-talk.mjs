#!/usr/bin/env node
// Fala com o agente pelo canal WHATSAPP, via simulador (mesmo entrypoint do
// webhook real: processTextMessage / processInteractiveReply).
//
//   node scripts/qa/wa-talk.mjs --new                          → cria a sessão, imprime o conversationId
//   node scripts/qa/wa-talk.mjs <conv> "oi, quero uma moto"    → manda texto
//   node scripts/qa/wa-talk.mjs <conv> --btn <replyId> "<título>"  → clica num botão
//
// IMPORTANTE — por que lemos o STREAM e não o banco:
// as mensagens que o agente MANDA no WhatsApp (inclusive as perguntas de gate e os
// botões) vão pro bus do simulador, não todas pra tabela `messages`. Lendo o banco,
// o dossiê perdia justamente as perguntas ("Me manda seu CPF...") e os botões — e o
// coletor concluía "a jornada travou" quando o agente estava respondendo normal.
// Instrumento cego vira bug fantasma.

const BASE = process.env.AJA_BASE_URL ?? "http://aja-refactor-desamarra-agente.orb.local";
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;

if (!EMAIL || !PASSWORD) {
	console.error("faltam ADMIN_EMAIL/ADMIN_PASSWORD (rode: set -a; source .env.local; set +a)");
	process.exit(2);
}

async function login() {
	// better-auth exige Origin (trustedOrigins) — sem ele: MISSING_OR_NULL_ORIGIN.
	const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
		method: "POST",
		headers: { "content-type": "application/json", origin: BASE },
		body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
	});
	if (!res.ok) throw new Error(`login falhou: HTTP ${res.status} ${await res.text()}`);
	const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
	if (!cookie) throw new Error("login não devolveu cookie");
	return cookie;
}

const cookie = await login();
const [, , arg1, arg2, arg3, arg4] = process.argv;

if (arg1 === "--new") {
	const res = await fetch(`${BASE}/api/admin/simulator/sessions`, {
		method: "POST",
		headers: { "content-type": "application/json", cookie, origin: BASE },
		body: JSON.stringify({ channel: "whatsapp" }),
	});
	if (!res.ok) {
		console.error(`HTTP ${res.status}: ${await res.text()}`);
		process.exit(1);
	}
	const { conversationId } = await res.json();
	console.log(conversationId);
	process.exit(0);
}

const conversationId = arg1;
if (!conversationId || (!arg2 && arg2 !== "--btn")) {
	console.error('uso: wa-talk.mjs --new | wa-talk.mjs <conv> "texto" | wa-talk.mjs <conv> --btn <id> "<título>"');
	process.exit(2);
}

const body =
	arg2 === "--btn"
		? { kind: "interactive", replyId: arg3, replyTitle: arg4 ?? arg3 }
		: { kind: "text", text: arg2 };

// Lemos o que o agente REALMENTE mandou pro número, direto do log do container
// (`[whatsapp-out:text]` / `[whatsapp-out:interactive]`). É a fonte mais fiel ao
// que o cliente receberia — inclui as perguntas de gate e os botões, que não vão
// todos parar na tabela `messages`.
import { execSync } from "node:child_process";

const CONTAINER = process.env.AJA_CONTAINER ?? "aja-app-refactor-desamarra-agente";

function baloesDoLog(desdeISO) {
	let raw = "";
	try {
		raw = execSync(
			`docker logs --since '${desdeISO}' ${CONTAINER} 2>&1 | grep -a 'whatsapp-out' || true`,
			{ encoding: "utf-8", maxBuffer: 20 * 1024 * 1024 },
		);
	} catch {
		return [];
	}
	const out = [];
	for (const linha of raw.split("\n")) {
		const t = linha.match(/\[whatsapp-out:text\].*?text="([\s\S]*?)"\s*$/);
		if (t) {
			out.push(t[1].replace(/\\n/g, "\n").trim());
			continue;
		}
		const i = linha.match(/\[whatsapp-out:interactive\](.*)$/);
		if (i) out.push(`[BOTÕES] ${i[1].trim()}`);
	}
	return out;
}

const desde = new Date(Date.now() - 2000).toISOString();

const res = await fetch(`${BASE}/api/admin/simulator/whatsapp/${conversationId}/send`, {
	method: "POST",
	headers: { "content-type": "application/json", cookie, origin: BASE },
	body: JSON.stringify(body),
	signal: AbortSignal.timeout(240_000),
});
if (!res.ok) {
	console.error(`HTTP ${res.status}: ${await res.text()}`);
	process.exit(1);
}

// Espera os balões chegarem E pararem de chegar (turno com busca na Bevi passa de
// 60s, e o agente manda vários balões em sequência).
const TETO_MS = 300_000;
const inicio = Date.now();
let recebidos = [];
let estavel = 0;
while (Date.now() - inicio < TETO_MS) {
	await new Promise((r) => setTimeout(r, 3000));
	const atuais = baloesDoLog(desde);
	if (atuais.length > recebidos.length) {
		recebidos = atuais;
		estavel = 0;
	} else if (recebidos.length > 0) {
		estavel += 1;
		if (estavel >= 3) break; // ~9s sem balão novo → turno acabou
	}
}

console.log("=== AGENTE (WhatsApp) ===");
console.log(
	recebidos.length
		? recebidos.join("\n\n")
		: `(nenhum balão em ${Math.round((Date.now() - inicio) / 1000)}s — pode ser lentidão; NÃO conclua que travou sem checar o banco)`,
);
