/**
 * SMOKE DO VENDEDOR LIVRE — o turno novo com a Bevi de verdade.
 *
 * Prova, contra a Bevi real e com o modelo real:
 *  1. o pi conversa (texto sai);
 *  2. a busca rápida roda com a IDENTIDADE DA CASA (vitrine) e o card de
 *     comparação nasce do RESULTADO da tool — nenhuma `present_*` no caminho;
 *  3. a segunda skill recusa gerar proposta sem CPF do cliente;
 *  4. a meta grava categoria e reveal.
 *
 * NÃO gera proposta real: isso consome o slot único da loja e dispara consulta
 * de bureau. A proposta é provada em teste com gateway falso.
 *
 * Uso:
 *   DATABASE_URL=... LITELLM_BASE_URL=http://127.0.0.1:4100 AI_MODEL=claude-haiku-4-5 \
 *     pnpm exec tsx scripts/smoke-pi-livre.ts
 */
import "./_env-host";
import { execFileSync } from "node:child_process";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { artifacts, conversations, messages } from "@/db/schema";
import { AGENTE_LIVRE_ATIVO, runTurn } from "@/lib/agent/orchestrator";

type Passo = { ok: boolean; oQue: string; detalhe: string };

/** A vitrine é PII: vive no cofre, não no repo. */
function daVitrine(): { cpf: string; celular: string } {
	const ler = (chave: string) =>
		execFileSync(`${process.env.HOME}/.local/bin/secrets.sh`, ["get-key", "contas-teste", chave], {
			encoding: "utf8",
		}).trim();
	return {
		cpf: process.env.VITRINE_CPF?.trim() || ler("CONTA1_CPF"),
		celular: process.env.VITRINE_CELULAR?.trim() || ler("CONTA1_CELULAR"),
	};
}

async function main(): Promise<void> {
	const passos: Passo[] = [];
	const marca = (ok: boolean, oQue: string, detalhe: string) => {
		passos.push({ ok, oQue, detalhe });
		console.log(`${ok ? "✅" : "❌"} ${oQue} — ${detalhe}`);
	};

	if (!AGENTE_LIVRE_ATIVO) {
		console.log("ligue AGENTE_LIVRE=1 para rodar este smoke");
		process.exit(2);
	}
	const doCofre = (chave: string, alvo = "aja-agora") =>
		process.env[chave]?.trim() ||
		execFileSync(`${process.env.HOME}/.local/bin/secrets.sh`, ["get-key", alvo, chave], {
			encoding: "utf8",
		}).trim();
	// A descoberta da Bevi falha alto sem o hash da loja; ele vive no cofre.
	process.env.BEVI_SELFCONTRACT_HASH = doCofre("BEVI_SELFCONTRACT_HASH");
	const vitrine = daVitrine();
	process.env.VITRINE_CPF = vitrine.cpf;
	process.env.VITRINE_CELULAR = vitrine.celular;

	const [conv] = await db
		.insert(conversations)
		.values({ channel: "web", status: "active", isSimulated: true, contactName: null })
		.returning({ id: conversations.id });
	const conversationId = conv.id;

	try {
		// ── TURNO 1: pedido de venda, sem dado pessoal ──
		const eventos1: Array<{ type: string; [k: string]: unknown }> = [];
		for await (const ev of runTurn({
			channel: "web",
			conversationId,
			userText: "oi, quero comprar um carro de uns 80 mil",
			isUserTurn: true,
			contactName: null,
		}))
			eventos1.push(ev as never);

		const texto1 = eventos1
			.filter((e) => e.type === "text-delta")
			.map((e) => String(e.text ?? ""))
			.join("");
		marca(
			Boolean(texto1.trim()),
			"o vendedor falou",
			`${texto1.length} chars: "${texto1.slice(0, 90).trim()}"`,
		);

		const cards1 = eventos1.filter((e) => e.type === "artifact");
		const tipos1 = cards1.map((e) => String(e.artifactType));
		marca(
			tipos1.includes("comparison_table"),
			"o card nasceu do RESULTADO da busca",
			`cards: ${JSON.stringify(tipos1)}`,
		);

		const payload = cards1[0]?.payload as { groups?: unknown[] } | undefined;
		const quantas = Array.isArray(payload?.groups) ? payload.groups.length : 0;
		marca(
			quantas > 0,
			"as cartas são reais (Bevi pela vitrine)",
			`${quantas} cartas no comparativo`,
		);

		const [depois1] = await db
			.select({ metadata: conversations.metadata })
			.from(conversations)
			.where(eq(conversations.id, conversationId));
		const meta1 = (depois1?.metadata ?? {}) as Record<string, unknown>;
		marca(
			meta1.currentCategory === "auto" && meta1.revealCompleted === true,
			"a busca gravou estado (categoria + reveal)",
			`currentCategory=${String(meta1.currentCategory)} reveal=${String(meta1.revealCompleted)}`,
		);

		// ── TURNO 2: pede proposta SEM CPF → a skill tem que recusar ──
		const eventos2: Array<{ type: string; [k: string]: unknown }> = [];
		for await (const ev of runTurn({
			channel: "web",
			conversationId,
			userText: "gostei da primeira, pode fazer a proposta",
			isUserTurn: true,
			contactName: null,
		}))
			eventos2.push(ev as never);

		const texto2 = eventos2
			.filter((e) => e.type === "text-delta")
			.map((e) => String(e.text ?? ""))
			.join("");
		const fezProposta = eventos2.some(
			(e) => e.type === "artifact" && e.artifactType === "real_offer",
		);
		marca(
			Boolean(texto2.trim()) && !fezProposta,
			"sem CPF, a proposta NÃO é gerada",
			`${texto2.length} chars · real_offer=${fezProposta}`,
		);

		const falhas = passos.filter((p) => !p.ok);
		console.log("──────────────────────────────────────────");
		console.log(`${passos.length - falhas.length}/${passos.length} passos OK`);
		if (falhas.length > 0) {
			console.log("SMOKE REPROVADO");
			process.exitCode = 1;
		} else {
			console.log("SMOKE VERDE — o vendedor livre vai da saudação ao card real, sem gate.");
		}
	} finally {
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
