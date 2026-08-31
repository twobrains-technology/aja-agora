/**
 * A ponte entre o nó de descoberta e o marco de sessão da primeira carta.
 *
 * Mora fora de `negocio.ts` porque precisa do banco (contar os turnos do
 * cliente e saber se a conversa é simulada), e `negocio.ts` é deliberadamente
 * puro em relação a I/O — quem chama de lá já traz os dados na mão.
 *
 * Roda uma vez por conversa (o chamador garante, via `!revealCompleted`), fora
 * do caminho de resposta: é `void`, nunca lança, e uma falha aqui não pode
 * custar o turno do cliente. Observabilidade que derruba venda não é
 * observabilidade, é bug.
 */
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { registrarPrimeiraCarta } from "./negocio";

export async function marcarPrimeiraCarta(
	conversationId: string | null,
	/**
	 * A fala do cliente DESTE turno já está gravada no banco?
	 *
	 * Não dá para adivinhar por conteúdo — e a tentativa anterior de fazê-lo (comparar
	 * com a última mensagem) errava nos dois sentidos: cliente que repete a mesma
	 * frase subcontava no web, e o dual no WhatsApp sobrecontava. Quem sabe é o
	 * chamador, porque isso é uma propriedade do CAMINHO, não do texto:
	 *
	 *  - **turno de usuário** (texto livre, web ou WhatsApp): `discovery` roda antes
	 *    de `persist`, que é quem grava a fala → `false`.
	 *    Contar sem somar o turno dá ZERO quando a carta aparece na primeira fala —
	 *    e zero é descartado por não ser medição, calando a métrica no caso de
	 *    sucesso máximo (medido: 57 `carta_vista` para 3 `turnos_ate_carta`);
	 *  - **turno server-authored** (clique num card, retomada): o label já foi
	 *    gravado antes do turno — na web por `route.ts`, no WhatsApp por
	 *    `recordUserClick` → `true`.
	 */
	turnoJaGravado: boolean,
): Promise<void> {
	if (!conversationId) return;
	try {
		const [conversa] = await db
			.select({ isSimulated: conversations.isSimulated })
			.from(conversations)
			.where(eq(conversations.id, conversationId))
			.limit(1);
		if (!conversa || conversa.isSimulated) return;

		const [turnos] = await db
			.select({ n: count() })
			.from(messages)
			.where(and(eq(messages.conversationId, conversationId), eq(messages.role, "user")));

		registrarPrimeiraCarta({
			conversationId,
			turnosAteACarta: (turnos?.n ?? 0) + (turnoJaGravado ? 0 : 1),
			isSimulated: false,
		});
	} catch (err) {
		console.error("[langfuse] marco da primeira carta não registrado (ignorado):", err);
	}
}
