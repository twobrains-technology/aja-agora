// O GOLDEN SET DE CONDUCTA — o placar offline.
//
// Sem juiz de LLM: as regras são checagens determinísticas sobre a transcription gravada
// (`src/lib/agent/pi/eval/golden.ts`). Roda de duas formas:
//
//   pnpm tsx scripts/eval-conduta.ts                 # o set fixo, offline
//   pnpm tsx scripts/eval-conduta.ts --db             # as 10 conversas mais recentes do banco
//
// O set fixo existe para o placar ser reproducível sem tocar o ambiente; o `--db` é a
// conferência no dev. Saída: achado por regra + placar, pronto para colar no relatório.

import { readFileSync, writeFileSync } from "node:fs";
import { opcoesDePerguntaFechada } from "@/lib/agent/pi/chips";
import {
	agruparEmTurnos,
	avaliarConversa,
	CARTAO_CLICAVEL,
	placar,
	type TurnoDeConversa,
} from "@/lib/agent/pi/eval/golden";

type ConversaDoSet = { id: string; turnos: TurnoDeConversa[] };

function doSetFixo(): ConversaDoSet[] {
	const bruto = readFileSync(new URL("./eval/golden-conduta.jsonl", import.meta.url), "utf8");
	return bruto
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l) as ConversaDoSet);
}

function idsDoArg(): string[] {
	const i = process.argv.indexOf("--ids");
	if (i < 0) return [];
	return process.argv[i + 1]
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

function extraiNumeros(payload: unknown): string[] {
	const bruto = JSON.stringify(payload ?? "");
	return [...new Set(bruto.match(/\d+(?:[.,]\d+)?/g) ?? [])];
}

async function doBanco(): Promise<ConversaDoSet[]> {
	const { db } = await import("@/db");
	const { conversations, messages } = await import("@/db/schema");
	const { asc, desc, eq, inArray } = await import("drizzle-orm");

	const ids = idsDoArg();
	const conversas = ids.length
		? await db.query.conversations.findMany({ where: inArray(conversations.id, ids) })
		: await db.query.conversations.findMany({
				orderBy: desc(conversations.createdAt),
				limit: 10,
			});
	const saida: ConversaDoSet[] = [];
	for (const c of conversas) {
		const ms = await db.query.messages.findMany({
			where: eq(messages.conversationId, c.id),
			with: { artifacts: true },
			orderBy: asc(messages.createdAt),
		});
		saida.push({
			id: c.id,
			turnos: ms.map((m) => ({
				role: m.role as "user" | "assistant",
				content: m.content,
				cards: (m.artifacts ?? []).map((a) => a.type),
				valores: (m.artifacts ?? []).flatMap((a) => extraiNumeros(a.payload)),
			})),
		});
	}
	return saida;
}

async function main() {
	const usaBanco = process.argv.includes("--db");
	const set = usaBanco ? await doBanco() : doSetFixo();

	if (process.argv.includes("--gravar")) {
		writeFileSync(
			new URL("./eval/golden-conduta.jsonl", import.meta.url),
			`${set.map((c) => JSON.stringify(c)).join("\n")}\n`,
		);
	}

	const total = placar([]);
	let fechadas = 0;
	let comAfordança = 0;
	for (const c of set) {
		const turnos = agruparEmTurnos(c.turnos);
		for (const t of turnos) {
			if (t.role !== "assistant") continue;
			if (opcoesDePerguntaFechada(t.content).length < 2) continue;
			fechadas++;
			if (t.cards.some((card) => CARTAO_CLICAVEL.includes(card))) comAfordança++;
		}
		const achados = avaliarConversa(turnos);
		for (const a of achados) total[a.regra] = (total[a.regra] ?? 0) + 1;
		if (achados.length) {
			console.log(`\n${c.id} (${c.turnos.length} turnos)`);
			for (const a of achados) console.log(`  ${a.regra} · turno ${a.turno} · ${a.evidencia}`);
		} else {
			console.log(`${c.id} · limpo (${c.turnos.length} turnos)`);
		}
	}

	console.log(
		`\n=== perguntas fechadas: ${fechadas} · com afordança na tela: ${comAfordança} · só texto: ${fechadas - comAfordança} ===`,
	);
	console.log("\n=== placar ===");
	for (const [regra, n] of Object.entries(total)) console.log(`${regra}: ${n}`);
}

void main();
