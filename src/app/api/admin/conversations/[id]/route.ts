import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conversations, leads, remarketingTouches } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { MOTIVO_SAIDA_TESTE } from "@/lib/remarketing/motivo-de-exclusao";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	const { id } = await params;

	if (!UUID_RE.test(id)) {
		return Response.json({ error: "Invalid conversation ID format" }, { status: 400 });
	}

	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, id),
		with: {
			messages: {
				orderBy: (m, { asc }) => [asc(m.createdAt)],
				with: {
					artifacts: true,
				},
			},
			handedOffUser: {
				columns: { id: true, name: true, phone: true },
			},
			leads: true,
		},
	});

	if (!conv) {
		return Response.json({ error: "Conversation not found" }, { status: 404 });
	}

	const meta = (conv.metadata ?? {}) as Record<string, unknown>;
	const currentCategory =
		typeof meta.currentCategory === "string" ? (meta.currentCategory as string) : null;

	return Response.json({
		conversation: {
			id: conv.id,
			contactName: conv.contactName,
			waId: conv.waId,
			channel: conv.channel,
			status: conv.status,
			currentCategory,
			metadata: conv.metadata,
			handedOffUser: conv.handedOffUser
				? {
						id: conv.handedOffUser.id,
						name: conv.handedOffUser.name,
						phone: conv.handedOffUser.phone,
					}
				: null,
			createdAt: conv.createdAt,
			updatedAt: conv.updatedAt,
			isSimulated: conv.isSimulated,
		},
		messages: conv.messages,
		lead: conv.leads?.[0] ?? null,
	});
}

const marcacaoSchema = z.object({
	isSimulated: z.boolean(),
});

/**
 * Marca (ou desmarca) a conversa como TESTE — e leva os leads dela junto.
 *
 * **Por que os dois de uma vez.** As consultas do painel filtram os dois lados
 * de forma independente: `computeFunilMidia` exige `c.is_simulated = false` no
 * degrau de conversas e `l.is_simulated = false` no de identificados. Marcar só
 * a conversa tiraria a conversa do funil e deixaria o LEAD contando — um funil
 * que perde o topo e mantém o meio, que é pior que não filtrar nada.
 *
 * A proposta na Bevi não tem flag própria e não precisa: toda contagem de
 * proposta no painel entra por `JOIN ... ON bp.conversation_id = c.id` dentro do
 * escopo já filtrado da conversa.
 *
 * **Por que é reversível.** Classificar errado é rotina — a mesma razão que
 * derrubou o forward-only do arrasto de raia em 10/08. Uma marcação que não
 * volta atrás vira um registro perdido que ninguém consegue corrigir pela tela.
 *
 * **O que isto NÃO desfaz:** eventos de conversão já enviados à Meta. O envio é
 * externo e definitivo; a marcação corrige o relatório daqui para frente, não o
 * que o algoritmo da campanha já aprendeu.
 *
 * **E o meio-termo que faltava: a RÉGUA.** A marcação tirava a conversa do funil
 * e das métricas, mas NÃO soltava quem já tinha entrado no remarketing: a
 * entrada filtrava `is_simulated`, e a consulta que decide QUEM dispara
 * (`listarVencidas`) não. Em produção isso apareceu como "desses seis toques,
 * três já somos nós" (Bruna, 18/09 11:56) — e dois deles eram telefone de
 * atendente. Agora marcar como teste também SEGURA a linha da régua, com
 * `motivo_saida = 'teste'` e o status `RESPONDEU` (o único bloqueio REVERSÍVEL
 * do enum — ver `admin/remarketing-tela.ts`; não existe `SEGURADO` e criar um
 * valor novo mudaria a régua inteira por causa de um rótulo).
 *
 * Desmarcar NÃO devolve a linha à régua: quem foi segurado, ficou. Reabrir no
 * unmark seria religar toque automático para uma conversa classificada ao acaso
 * — mesma decisão de produto do "quem saiu da janela de 7 dias não volta".
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error } = await requireRole("admin");
	if (error) return error;

	const { id } = await params;

	if (!UUID_RE.test(id)) {
		return Response.json({ error: "Invalid conversation ID format" }, { status: 400 });
	}

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = marcacaoSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Corpo inválido", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	const { isSimulated } = parsed.data;

	const [atualizada] = await db
		.update(conversations)
		.set({ isSimulated, updatedAt: new Date() })
		.where(eq(conversations.id, id))
		.returning({ id: conversations.id, isSimulated: conversations.isSimulated });

	if (!atualizada) {
		return Response.json({ error: "Conversation not found" }, { status: 404 });
	}

	const marcados = await db
		.update(leads)
		.set({ isSimulated })
		.where(eq(leads.conversationId, id))
		.returning({ id: leads.id });

	// A régua sai junto. Só a linha ATIVA (é a única que o ciclo dispara); linha
	// já terminal não é reescrita — a marcação não pode apagar "o cliente
	// respondeu" nem "pediu para sair" com um motivo de teste.
	const segurados = isSimulated
		? await db
				.update(remarketingTouches)
				.set({ status: "RESPONDEU", motivoSaida: MOTIVO_SAIDA_TESTE })
				.where(
					and(eq(remarketingTouches.conversationId, id), eq(remarketingTouches.status, "ATIVO")),
				)
				.returning({ id: remarketingTouches.id })
		: [];

	return Response.json({
		id: atualizada.id,
		isSimulated: atualizada.isSimulated,
		leadsMarcados: marcados.length,
		// Quantas linhas da régua foram seguradas por esta marcação (0 quando a
		// conversa nunca entrou, ou quando ela foi desmarcada).
		toquesSegurados: segurados.length,
	});
}
