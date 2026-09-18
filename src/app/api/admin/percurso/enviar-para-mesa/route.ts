import { and, eq, inArray } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { createMesaHandoff } from "@/lib/mesa/handoff";

/**
 * "ENVIAR PARA A MESA" EM LOTE — o handoff a partir da lista do Percurso.
 *
 * A Bruna pediu (15/09) um jeito de mandar para a mesa quem parou no caminho,
 * sem abrir conversa por conversa. A lista do Percurso é o lugar natural: é a
 * única tela que mostra a PESSOA que não está na régua (canal web, parada há
 * mais de 7 dias, sem telefone) — exatamente quem precisa de ação humana.
 *
 * O handoff NÃO é inventado aqui: usa `createMesaHandoff`, o mesmo caminho do
 * transbordo normal (calar o agente, mover o lead para `em_atendimento`,
 * resolver a cota). Esta rota só resolve o lead de cada conversa e chama o
 * mecanismo existente.
 *
 * Só conversa de WhatsApp entra: o atendente atende pelo WhatsApp, e um lead
 * que chegou pela web não tem aparelho para ele responder. Quem tenta mandar
 * uma pessoa web recebe a recusa por id, com o motivo escrito.
 */

interface ResultadoDoEnvio {
	conversationId: string;
	ok: boolean;
	motivo?: string;
	handoffId?: string;
}

export async function POST(req: NextRequest) {
	const { error, session } = await requireRole("admin", "attendant");
	if (error) return error;

	let corpo: unknown;
	try {
		corpo = await req.json();
	} catch {
		return Response.json({ error: "Corpo da requisição inválido." }, { status: 400 });
	}

	const idsBrutos = (corpo as { ids?: unknown } | null)?.ids;
	if (!Array.isArray(idsBrutos) || idsBrutos.length === 0) {
		return Response.json({ error: "Informe ao menos uma conversa." }, { status: 400 });
	}
	const ids = [...new Set(idsBrutos.filter((i): i is string => typeof i === "string"))];
	if (ids.length === 0) {
		return Response.json({ error: "Nenhum id válido foi enviado." }, { status: 400 });
	}

	const conversas = await db
		.select({ id: conversations.id, channel: conversations.channel })
		.from(conversations)
		.where(inArray(conversations.id, ids));

	const porId = new Map(conversas.map((c) => [c.id, c.channel]));

	const resultados: ResultadoDoEnvio[] = [];
	let enviados = 0;

	for (const id of ids) {
		const canal = porId.get(id);
		if (canal === undefined) {
			resultados.push({ conversationId: id, ok: false, motivo: "Conversa não encontrada." });
			continue;
		}
		if (canal !== "whatsapp") {
			resultados.push({ conversationId: id, ok: false, motivo: "Só para conversas de WhatsApp." });
			continue;
		}

		const [lead] = await db
			.select({ id: leads.id })
			.from(leads)
			.where(and(eq(leads.conversationId, id), eq(leads.isSimulated, false)))
			.limit(1);

		if (!lead) {
			resultados.push({ conversationId: id, ok: false, motivo: "Sem lead para enviar à mesa." });
			continue;
		}

		const handoff = await createMesaHandoff({
			leadId: lead.id,
			createdBy: session.user.id,
		});

		if (handoff.ok) {
			enviados += 1;
			resultados.push({ conversationId: id, ok: true, handoffId: handoff.handoff.id });
		} else if (handoff.reason === "handoff_ativo_existe") {
			resultados.push({
				conversationId: id,
				ok: false,
				motivo: "Esta pessoa já está com um atendimento aberto.",
			});
		} else {
			resultados.push({
				conversationId: id,
				ok: false,
				motivo: "Não consegui abrir o atendimento.",
			});
		}
	}

	return Response.json({ enviados, total: ids.length, resultados });
}
