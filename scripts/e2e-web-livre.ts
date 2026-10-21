/**
 * E2E do canal WEB — o vendedor livre atrás do HTTP, como o navegador fala.
 *
 * Sobe o app (`node .next/standalone/server.js`) e faz o roteiro real:
 *   "oi, quero um carro de 80 mil" → card `comparison_table` com cartas da Bevi
 *   "pode fazer a proposta" (sem CPF)  → NENHUM `real_offer`
 *
 * A prova é dupla: o stream HTTP e o banco (meta + artifacts).
 */
import "./_env-host";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { artifacts, conversations, messages } from "@/db/schema";

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3100";

async function turno(conversationId: string, texto: string): Promise<string> {
	const r = await fetch(`${BASE}/api/chat`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			conversationId,
			messages: [{ id: randomUUID(), role: "user", parts: [{ type: "text", text: texto }] }],
		}),
	});
	const corpo = await r.text();
	if (!r.ok) console.log(`HTTP ${r.status}: ${corpo.slice(0, 300)}`);
	return corpo;
}

async function main(): Promise<void> {
	const conversationId = randomUUID();
	const falhas: string[] = [];
	const ok = (cond: boolean, oQue: string, detalhe: string) => {
		console.log(`${cond ? "✅" : "❌"} ${oQue} — ${detalhe}`);
		if (!cond) falhas.push(oQue);
	};

	try {
		// Turno de saudação: o vendedor pode (e deve) conversar antes de buscar.
		const t1 = await turno(conversationId, "oi");
		ok(t1.includes("text"), "turno 1: o vendedor falou", `${t1.length} bytes de stream`);
		ok(!t1.includes("data-gate"), "nenhum data-gate no stream", "gate morto");

		// O PEDIDO com tipo de bem e valor: aqui a busca tem que acontecer.
		const t2busca = await turno(conversationId, "quero um carro de uns 80 mil");
		ok(
			t2busca.includes("comparison_table"),
			"o pedido disparou a busca e o card da prateleira",
			`${t2busca.length} bytes de stream`,
		);

		const [meta1] = await db
			.select({ metadata: conversations.metadata })
			.from(conversations)
			.where(eq(conversations.id, conversationId));
		const m = (meta1?.metadata ?? {}) as Record<string, unknown>;
		ok(
			m.currentCategory === "auto" && m.revealCompleted === true,
			"banco: categoria e reveal gravados",
			`currentCategory=${String(m.currentCategory)}`,
		);

		const t3 = await turno(conversationId, "gostei da primeira, pode fazer a proposta");
		ok(!t3.includes("real_offer"), "sem CPF, a proposta NÃO é gerada", `${t3.length} bytes`);
		ok(t3.includes("text"), "e ele responde pedindo os dados", "texto no stream");

		const msgs = await db
			.select({ role: messages.role, content: messages.content })
			.from(messages)
			.where(eq(messages.conversationId, conversationId));
		ok(msgs.length >= 4, "conversa persistida", `${msgs.length} mensagens`);
	} finally {
		const msgs = await db
			.select({ id: messages.id })
			.from(messages)
			.where(eq(messages.conversationId, conversationId));
		if (msgs.length > 0) {
			await db.delete(artifacts).where(
				inArray(
					artifacts.messageId,
					msgs.map((x) => x.id),
				),
			);
		}
		await db.delete(messages).where(eq(messages.conversationId, conversationId));
		await db.delete(conversations).where(eq(conversations.id, conversationId));
	}

	console.log(falhas.length === 0 ? "E2E WEB VERDE" : `E2E WEB REPROVADO (${falhas.length})`);
	process.exit(falhas.length === 0 ? 0 : 1);
}

main().catch((e) => {
	console.error("infra:", e);
	process.exit(1);
});
