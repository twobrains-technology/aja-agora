#!/usr/bin/env node
// Fala com o agente pelo canal WHATSAPP, usando o simulador (mesmo entrypoint do
// webhook real: processTextMessage / processInteractiveReply).
//
//   node scripts/qa/wa-talk.mjs --new                          → cria a sessão, imprime o conversationId
//   node scripts/qa/wa-talk.mjs <conv> "oi, quero uma moto"    → manda texto
//   node scripts/qa/wa-talk.mjs <conv> --btn <id> "<título>"   → clica num botão
//
// Faz login como admin sozinho (o simulador é admin-only) e lê as mensagens que o
// agente mandou de volta, direto do banco — o stream SSE é assíncrono e o que
// interessa pro dossiê é a mensagem final que o cliente receberia.

const BASE = process.env.AJA_BASE_URL ?? "http://aja-refactor-desamarra-agente.orb.local";
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;

if (!EMAIL || !PASSWORD) {
	console.error("faltam ADMIN_EMAIL/ADMIN_PASSWORD no ambiente (source .env.local)");
	process.exit(2);
}

async function login() {
	// O better-auth exige Origin (trustedOrigins) — sem ele devolve
	// MISSING_OR_NULL_ORIGIN. Mandamos a própria base, que já é confiável.
	const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
		method: "POST",
		headers: { "content-type": "application/json", origin: BASE },
		body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
	});
	if (!res.ok) throw new Error(`login falhou: HTTP ${res.status} ${await res.text()}`);
	const cookies = res.headers.getSetCookie?.() ?? [];
	const cookie = cookies.map((c) => c.split(";")[0]).join("; ");
	if (!cookie) throw new Error("login não devolveu cookie de sessão");
	return cookie;
}

const cookie = await login();
const [, , arg1, arg2, arg3] = process.argv;

if (arg1 === "--new") {
	const res = await fetch(`${BASE}/api/admin/simulator/sessions`, {
		method: "POST",
		headers: { "content-type": "application/json", cookie },
		body: JSON.stringify({ channel: "whatsapp" }),
	});
	if (!res.ok) {
		console.error(`HTTP ${res.status}: ${await res.text()}`);
		process.exit(1);
	}
	const { conversationId: novoId } = await res.json();
	console.log(novoId);
	process.exit(0);
}

const conversationId = arg1;
if (!conversationId) {
	console.error('uso: wa-talk.mjs --new | wa-talk.mjs <conv> "texto" | wa-talk.mjs <conv> --btn <id> "<título>"');
	process.exit(2);
}

const body =
	arg2 === "--btn"
		? { kind: "interactive", replyId: arg3, replyTitle: process.argv[6] ?? arg3 }
		: { kind: "text", text: arg2 };

// Quantas mensagens do agente já existiam antes deste turno.
const antes = await contarMensagens();

const res = await fetch(`${BASE}/api/admin/simulator/whatsapp/${conversationId}/send`, {
	method: "POST",
	headers: { "content-type": "application/json", cookie },
	body: JSON.stringify(body),
	signal: AbortSignal.timeout(180_000),
});
if (!res.ok) {
	console.error(`HTTP ${res.status}: ${await res.text()}`);
	process.exit(1);
}

// O processamento é assíncrono — espera as mensagens novas do assistente aparecerem.
let novas = [];
for (let i = 0; i < 60; i++) {
	await new Promise((r) => setTimeout(r, 2000));
	const msgs = await listarMensagens();
	novas = msgs.slice(antes);
	if (novas.length > 0) {
		// Espera estabilizar (o agente manda vários balões em sequência).
		await new Promise((r) => setTimeout(r, 3000));
		novas = (await listarMensagens()).slice(antes);
		break;
	}
}

console.log("=== AGENTE (WhatsApp) ===");
console.log(novas.length ? novas.join("\n\n") : "(sem resposta em 120s)");

async function listarMensagens() {
	const res = await fetch(
		`${BASE}/api/admin/simulator/sessions/${conversationId}`,
		{ headers: { cookie } },
	);
	if (!res.ok) return [];
	const data = await res.json();
	const msgs = data.messages ?? data.conversation?.messages ?? [];
	return msgs
		.filter((m) => m.role === "assistant")
		.map((m) => {
			const txt = (m.content ?? "").trim();
			const arts = (m.artifacts ?? []).map((a) => a.type ?? a).join(", ");
			return arts ? `${txt}\n[CARDS: ${arts}]` : txt;
		})
		.filter(Boolean);
}

async function contarMensagens() {
	return (await listarMensagens()).length;
}
