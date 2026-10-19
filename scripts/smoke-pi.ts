/**
 * SMOKE FUNCIONAL DO MOTOR DO PI — turno de verdade, com o modelo de verdade.
 *
 * O que ele prova, e que teste com modelo roteirizado NÃO prova:
 *  1. o harness do pi fala com o gateway real (OpenAI-completions) e o modelo
 *     responde;
 *  2. o turno inteiro roda no motor novo (capture → analyze → route → advance →
 *     discovery → fala → emit-card → persist) com banco real;
 *  3. o estado anda: gate nasce no turno, texto chega, meta é gravada.
 *
 * Uso (do host, com o banco do workspace):
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/<db> \
 *     pnpm exec tsx scripts/smoke-pi.ts
 *
 * Ele cria uma conversa SIMULADA própria e apaga no fim — não polui o CRM.
 */
import "./_env-host";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { artifacts, conversations, messages } from "@/db/schema";
import { runTurn } from "@/lib/agent/orchestrator";

type Passo = { ok: boolean; o_que: string; detalhe: string };

async function main(): Promise<void> {
	const passos: Passo[] = [];
	const marca = (ok: boolean, o_que: string, detalhe: string) => {
		passos.push({ ok, o_que, detalhe });
		console.log(`${ok ? "✅" : "❌"} ${o_que} — ${detalhe}`);
	};

	const [conv] = await db
		.insert(conversations)
		.values({ channel: "web", status: "active", isSimulated: true, contactName: null })
		.returning({ id: conversations.id });
	const conversationId = conv.id;

	try {
		// ── TURNO 1: conversa nova, sem nome, sem alvo ──
		const eventos1: Array<{ type: string; [k: string]: unknown }> = [];
		for await (const ev of runTurn({
			channel: "web",
			conversationId,
			userText: "oi, quero comprar um carro",
			isUserTurn: true,
			contactName: null,
		})) {
			eventos1.push(ev as never);
		}

		const texto1 = eventos1
			.filter((e) => e.type === "text-delta")
			.map((e) => String(e.text ?? ""))
			.join("");
		const gates1 = eventos1.filter((e) => e.type === "gate").map((e) => e.gate);
		marca(
			texto1.length > 0,
			"o modelo REAL falou pelo pi",
			`${texto1.length} chars: "${texto1.slice(0, 90).trim()}"`,
		);
		marca(gates1.length > 0, "gate nasceu no turno", `gates: ${JSON.stringify(gates1)}`);
		marca(
			eventos1.some((e) => e.type === "finish"),
			"turno fechou com finish",
			`eventos: ${eventos1
				.filter((e) => e.type !== "text-delta")
				.map((e) => e.type)
				.join(", ")}`,
		);

		const [depois1] = await db
			.select({ metadata: conversations.metadata, contactName: conversations.contactName })
			.from(conversations)
			.where(eq(conversations.id, conversationId));
		const meta1 = (depois1?.metadata ?? {}) as Record<string, unknown>;
		marca(
			Object.keys(meta1).length > 0,
			"o funil foi persistido",
			`pendingGate=${String(meta1.pendingGate ?? "-")} currentCategory=${String(meta1.currentCategory ?? "-")}`,
		);

		// ── TURNO 2: o cliente informa o valor ──
		const eventos2: Array<{ type: string; [k: string]: unknown }> = [];
		for await (const ev of runTurn({
			channel: "web",
			conversationId,
			userText: "quero um carro de 80 mil",
			isUserTurn: true,
			contactName: null,
		})) {
			eventos2.push(ev as never);
		}
		const texto2 = eventos2
			.filter((e) => e.type === "text-delta")
			.map((e) => String(e.text ?? ""))
			.join("");
		marca(texto2.length > 0, "segundo turno também falou", `${texto2.length} chars`);

		const totalMsgs = await db
			.select({ id: messages.id })
			.from(messages)
			.where(eq(messages.conversationId, conversationId));
		marca(totalMsgs.length > 0, "mensagens gravadas no banco", `${totalMsgs.length} mensagens`);

		const falhas = passos.filter((p) => !p.ok);
		console.log("──────────────────────────────────────────");
		console.log(`${passos.length - falhas.length}/${passos.length} passos OK`);
		if (falhas.length > 0) {
			console.log("SMOKE REPROVADO");
			process.exitCode = 1;
		} else {
			console.log("SMOKE VERDE — o turno roda no pi com o modelo real.");
		}
	} finally {
		// Limpa: artifacts antes de messages (FK), então a conversa.
		const msgs = await db
			.select({ id: messages.id })
			.from(messages)
			.where(eq(messages.conversationId, conversationId));
		if (msgs.length > 0) {
			await db.delete(artifacts).where(
				inArray(
					artifacts.messageId,
					msgs.map((m) => m.id),
				),
			);
		}
		await db.delete(messages).where(eq(messages.conversationId, conversationId));
		await db.delete(conversations).where(eq(conversations.id, conversationId));
	}
}

main().catch((err) => {
	console.error("✗ smoke falhou (infra):", err);
	process.exit(1);
});
