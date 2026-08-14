// A segunda fonte do watchdog, contra o banco de verdade.
//
// Ela existe porque a primeira (marcador de pendência) é escrita PELO TURNO: se
// o turno morre no meio — ou nunca roda —, não há marcador e a conversa fica
// invisível para sempre. Já aconteceu: cliente escreveu três vezes e não houve
// trace nenhum, nem do agente nem da mesa. Esta fonte não depende de escrita
// alguma; olha o estado observável (a última mensagem é do cliente, e faz
// tempo).

import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { findConversasSemResposta, runRetomadaCycle } from "./gate-reengage-poll";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const AGORA = new Date("2026-08-13T18:00:00.000Z");
const MINUTOS = (n: number) => new Date(AGORA.getTime() - n * 60_000);

async function semear(opts: {
	role: "user" | "assistant";
	quandoMin: number;
	simulada?: boolean;
	status?: "active" | "closed";
	metadata?: Record<string, unknown>;
}): Promise<string> {
	const [conv] = await db
		.insert(conversations)
		.values({
			channel: "web",
			status: opts.status ?? "active",
			isSimulated: opts.simulada ?? false,
			metadata: opts.metadata ?? {},
		})
		.returning({ id: conversations.id });
	const id = conv?.id as string;
	await db.insert(messages).values({
		conversationId: id,
		role: opts.role,
		content: "oi",
		channel: "web",
		createdAt: MINUTOS(opts.quandoMin),
	});
	return id;
}

describeIfDb("fonte 2 do watchdog — cliente falou e ninguém respondeu", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		if (criadas.length > 0) {
			await db.delete(messages).where(inArray(messages.conversationId, criadas));
			await db.delete(conversations).where(inArray(conversations.id, criadas));
		}
	});

	it("acha só quem está de fato esperando", async () => {
		const esperando = await semear({ role: "user", quandoMin: 10 });
		const respondida = await semear({ role: "assistant", quandoMin: 10 });
		const simulada = await semear({ role: "user", quandoMin: 10, simulada: true });
		const antiga = await semear({ role: "user", quandoMin: 60 * 30 }); // > 24h
		const recente = await semear({ role: "user", quandoMin: 1 }); // dentro do teto
		criadas.push(esperando, respondida, simulada, antiga, recente);

		const achadas = (await findConversasSemResposta(AGORA)).map((r) => r.id);

		expect(achadas).toContain(esperando);
		// A conversa cuja última fala é do AGENTE não está esperando ninguém.
		expect(achadas).not.toContain(respondida);
		// Simulada é teste interno, não cliente.
		expect(achadas).not.toContain(simulada);
		// Fora da janela de 24h o WhatsApp não entrega texto livre — retomada
		// tardia é outra feature, com template e mesa.
		expect(achadas).not.toContain(antiga);
		// E não se cobra quem acabou de falar.
		expect(achadas).not.toContain(recente);
	});

	it("dispara a retomada uma vez e respeita o backoff", async () => {
		const id = await semear({ role: "user", quandoMin: 10 });
		criadas.push(id);

		const disparos: string[] = [];
		const dispara = async ({ directive }: { directive: string }) => {
			disparos.push(directive);
		};
		// O banco de dev tem conversas de outras suítes que também estão paradas;
		// só esta interessa ao assert.
		const outras = async () =>
			new Set((await findConversasSemResposta(AGORA)).map((r) => r.id).filter((x) => x !== id));

		await runRetomadaCycle({ now: AGORA, dispara, jaTratadas: await outras() });
		expect(disparos.length).toBe(1);

		// Segundo ciclo IMEDIATO: o backoff segura. Sem isso, um cron de 30s
		// bombardearia o cliente.
		await runRetomadaCycle({ now: AGORA, dispara, jaTratadas: await outras() });
		expect(disparos.length).toBe(1);
	});

	it("não retoma conversa que já está com humano ou fechada", async () => {
		const comHumano = await semear({
			role: "user",
			quandoMin: 10,
			metadata: { handoffSuggested: true },
		});
		criadas.push(comHumano);

		const disparos: string[] = [];
		await runRetomadaCycle({
			now: AGORA,
			dispara: async () => {
				disparos.push("x");
			},
			// Só esta conversa interessa ao assert; as outras do banco não entram.
			jaTratadas: new Set(
				(await findConversasSemResposta(AGORA)).map((r) => r.id).filter((x) => x !== comHumano),
			),
		});
		expect(disparos.length).toBe(0);
	});
});
