/**
 * A contagem de turnos até a carta inclui o turno em que ela apareceu.
 *
 * O defeito que este teste trava foi encontrado nos próprios dados: o Langfuse
 * tinha **57 `carta_vista` para 3 `turnos_ate_carta`**. A métrica que mede a
 * vitrine estava calada em 95% dos casos — e justamente nos melhores.
 *
 * A causa é a ordem do grafo: `discovery` (que detecta a primeira carta) roda
 * ANTES de `persist` (que grava a fala do cliente). Contar as mensagens ali sem
 * somar o turno corrente subtrai 1 de todo mundo; quando a carta aparece já na
 * primeira fala — o caso de sucesso máximo, e o objetivo declarado da entrega —
 * a conta dá ZERO, e `registrarPrimeiraCarta` descarta zero porque zero não é
 * uma medição.
 *
 * Toca o banco de propósito: a aritmética é sobre uma contagem real de linhas,
 * e um mock provaria só o mock.
 */

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";

const { scoreCreate } = vi.hoisted(() => ({ scoreCreate: vi.fn() }));
vi.mock("./client", () => ({ getLangfuseClient: () => ({ score: { create: scoreCreate } }) }));

import { marcarPrimeiraCarta } from "./marcar-primeira-carta";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const criadas: string[] = [];

async function conversaCom(turnosDoCliente: number, isSimulated = false): Promise<string> {
	const [conv] = await db.insert(conversations).values({ isSimulated }).returning();
	criadas.push(conv.id);
	for (let i = 0; i < turnosDoCliente; i++) {
		await db.insert(messages).values({
			conversationId: conv.id,
			role: "user",
			content: `fala ${i + 1}`,
		});
	}
	return conv.id;
}

const valorDe = (nome: string) =>
	scoreCreate.mock.calls.map((c) => c[0] as Record<string, unknown>).find((s) => s.name === nome)
		?.value;

beforeEach(() => scoreCreate.mockClear());

afterAll(async () => {
	for (const id of criadas) await db.delete(conversations).where(eq(conversations.id, id));
});

describeIfDb("marcarPrimeiraCarta — a aritmética dos turnos", () => {
	it("carta na PRIMEIRA fala → 1 turno (não zero, não silêncio)", async () => {
		// O caso que a entrega inteira persegue. Antes do conserto ele era o único
		// que não produzia métrica nenhuma.
		const id = await conversaCom(0); // o persist ainda não gravou a fala do turno

		await marcarPrimeiraCarta(id, false);

		expect(valorDe("carta_vista")).toBe(1);
		expect(valorDe("turnos_ate_carta")).toBe(1);
	});

	it("carta depois de 4 falas → 5 turnos (a mediana medida em produção)", async () => {
		const id = await conversaCom(4);

		await marcarPrimeiraCarta(id, false);

		expect(valorDe("turnos_ate_carta")).toBe(5);
	});

	it("clique do WhatsApp (fala JÁ gravada) não conta o mesmo turno duas vezes", async () => {
		// `recordUserClick` grava a fala ANTES do turno — e o chamador sabe disso
		// pelo caminho (canal + turno server-authored), não pelo conteúdo.
		const id = await conversaCom(3);

		await marcarPrimeiraCarta(id, true);

		expect(valorDe("turnos_ate_carta")).toBe(3);
	});

	it("web: o turno corrente entra na conta", async () => {
		const id = await conversaCom(2);

		await marcarPrimeiraCarta(id, false);

		expect(valorDe("turnos_ate_carta")).toBe(3);
	});

	it("frase repetida não confunde a conta — o critério é o CAMINHO, não o texto", async () => {
		// A tentativa anterior comparava a fala do turno com a última gravada, e
		// errava nos dois sentidos: subcontava no web quando o cliente repetia a
		// frase, e sobrecontava no dual do WhatsApp. Ambiguidade insolúvel por
		// conteúdo — quem sabe é o chamador.
		const id = await conversaCom(0);
		await db.insert(messages).values({ conversationId: id, role: "user", content: "oi" });
		await db.insert(messages).values({ conversationId: id, role: "user", content: "oi" });

		await marcarPrimeiraCarta(id, false); // web: o turno corrente ainda não foi gravado

		expect(valorDe("turnos_ate_carta")).toBe(3);
	});

	it("conversa simulada não entra na métrica", async () => {
		const id = await conversaCom(1, true);

		await marcarPrimeiraCarta(id, false);

		expect(scoreCreate).not.toHaveBeenCalled();
	});
});
