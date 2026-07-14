#!/usr/bin/env node
// Fala com o agente pelo canal WHATSAPP (simulador — mesmo entrypoint do webhook real).
//
//   node scripts/qa/wa-talk.mjs --new                        → cria a sessão, imprime o conversationId
//   node scripts/qa/wa-talk.mjs <conv> "oi, quero uma moto"  → manda texto
//   node scripts/qa/wa-talk.mjs <conv> --btn <id> "<título>" → clica num botão
//
// A fonte da resposta é o SSE do simulador — que é o que o CLIENTE realmente recebe:
//   - isolado por waId  → imune a outra sessão de QA no mesmo container
//   - texto ÍNTEGRO     → o log do produto trunca em 140 chars (whatsapp/api.ts:99)
//   - com os BOTÕES     → o log nem os emite
// A 1ª versão deste script lia o log/banco e por isso perdia perguntas de gate e
// botões — o coletor então concluía "a jornada travou" com o agente respondendo
// normal. Instrumento cego vira bug fantasma.

import { execSync } from "node:child_process";

const BASE = process.env.AJA_BASE_URL ?? "http://aja-refactor-desamarra-agente.orb.local";

const [conv, a2, a3, a4] = process.argv.slice(2);

if (conv === "--new") {
	const r0 = await fetch(`${BASE}/api/auth/sign-in/email`, {
		method: "POST",
		headers: { "content-type": "application/json", origin: BASE },
		body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
	});
	if (!r0.ok) { console.error(`login ${r0.status}`); process.exit(1); }
	const ck = (r0.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
	const s = await fetch(`${BASE}/api/admin/simulator/sessions`, {
		method: "POST",
		headers: { "content-type": "application/json", cookie: ck, origin: BASE },
		body: JSON.stringify({ channel: "whatsapp" }),
	});
	if (!s.ok) { console.error(`HTTP ${s.status}: ${await s.text()}`); process.exit(1); }
	const { conversationId } = await s.json();
	console.log(conversationId);
	process.exit(0);
}

if (!conv || !a2) {
	console.error('uso: wa-talk.mjs --new | wa-talk.mjs <conv> "texto" | wa-talk.mjs <conv> --btn <id> "<título>"');
	process.exit(2);
}
const body = a2 === "--btn" ? { kind: "interactive", replyId: a3, replyTitle: a4 ?? a3 } : { kind: "text", text: a2 };

const res0 = await fetch(`${BASE}/api/auth/sign-in/email`, {
	method: "POST",
	headers: { "content-type": "application/json", origin: BASE },
	body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
});
if (!res0.ok) {
	console.error(`login ${res0.status}`);
	process.exit(1);
}
const cookie = (res0.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

// 1) abre o SSE ANTES de enviar (senão perde os balões do turno)
const ac = new AbortController();
const sse = await fetch(`${BASE}/api/admin/simulator/whatsapp/${conv}/stream`, {
	headers: { cookie, origin: BASE, accept: "text/event-stream" },
	signal: ac.signal,
});
if (!sse.ok) {
	console.error(`stream ${sse.status}: ${(await sse.text()).slice(0, 200)}`);
	process.exit(1);
}

const baloes = [];
let ultimoEm = 0;
(async () => {
	const reader = sse.body.getReader();
	const dec = new TextDecoder();
	let buf = "";
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buf += dec.decode(value, { stream: true });
			const partes = buf.split("\n\n");
			buf = partes.pop() ?? "";
			for (const p of partes) {
				const linha = p.split("\n").find((l) => l.startsWith("data: "));
				if (!linha) continue;
				let msg;
				try {
					msg = JSON.parse(linha.slice(6));
				} catch {
					continue;
				}
				if (msg.type !== "event") continue;
				if (msg.event?.type === "typing") continue; // indicador de digitando, não é balão
				baloes.push(msg.event);
				ultimoEm = Date.now();
			}
		}
	} catch {
		/* abortado */
	}
})();

await new Promise((r) => setTimeout(r, 700)); // deixa o subscribe assentar

// 2) envia
const res = await fetch(`${BASE}/api/admin/simulator/whatsapp/${conv}/send`, {
	method: "POST",
	headers: { "content-type": "application/json", cookie, origin: BASE },
	body: JSON.stringify(body),
	signal: AbortSignal.timeout(280_000),
});
if (!res.ok) {
	console.error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
	ac.abort();
	process.exit(1);
}

// 3) espera os balões chegarem E pararem (turno com busca Bevi passa de 60s)
const TETO_MS = 290_000;
const inicio = Date.now();
while (Date.now() - inicio < TETO_MS) {
	await new Promise((r) => setTimeout(r, 1000));
	if (baloes.length && Date.now() - ultimoEm > 9000) break; // 9s sem balão novo → fim do turno
}
ac.abort();

console.log("=== AGENTE (WhatsApp) ===");
if (!baloes.length) {
	console.log(`(sem resposta em ${Math.round((Date.now() - inicio) / 1000)}s)`);
	process.exit(0);
}
for (const ev of baloes) {
	if (ev.type === "text") {
		console.log(ev.text);
	} else if (ev.type === "interactive") {
		const it = ev.interactive ?? {};
		const corpo = it.body?.text ?? "";
		const btns = (it.action?.buttons ?? []).map((b) => `[${b.reply.id}] ${b.reply.title}`);
		const rows = (it.action?.sections ?? []).flatMap((s) => (s.rows ?? []).map((r) => `[${r.id}] ${r.title}`));
		console.log(corpo);
		console.log(`[BOTÕES] ${[...btns, ...rows].join("  |  ") || JSON.stringify(it.action ?? {})}`);
	} else {
		console.log(`[${ev.type}] ${JSON.stringify(ev).slice(0, 1500)}`);
	}
	console.log("---");
}
