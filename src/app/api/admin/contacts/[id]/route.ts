// FIX-45 — visão consolidada do CONTATO (cliente unificado).
// Agrega TUDO que o cliente fez: conversas (web + WhatsApp) com mensagens e
// artifacts, propostas Bevi, e o histórico de movimentação no funil (lead_events).
// CPF mascarado por default (DES-CPF-RAW). Lógica em @/lib/admin/contact-detail.

import { z } from "zod";
import { getContactDetail } from "@/lib/admin/contact-detail";
import { marcarConversasComoTeste } from "@/lib/admin/limpeza-queries";
import { requireRole } from "@/lib/admin/require-role";
import { isMesaExterna } from "@/lib/admin/role-scope";
import { contatoPertenceAoAtendente, getMesaAttendantByUserId } from "@/lib/mesa/handoff";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	// A mesa externa abre o dossiê do cliente que ELA atende — é daqui que sai o
	// histórico da tela de atendimento. Sem ela na lista, clicar no próprio card
	// devolvia 403 e o painel abria vazio, como se não houvesse conversa.
	const { error, session, role } = await requireRole(
		"admin",
		"viewer",
		"attendant",
		"mesa_externa",
	);
	if (error) return error;

	const { id } = await params;
	if (!UUID_RE.test(id)) {
		return Response.json({ error: "Invalid contact ID format" }, { status: 400 });
	}

	// …mas só o cliente dela: trocar o id na URL não abre o dossiê do colega.
	if (isMesaExterna(role)) {
		const atendente = await getMesaAttendantByUserId(session.user.id);
		if (!atendente || !atendente.isActive) {
			return Response.json({ error: "Forbidden" }, { status: 403 });
		}
		if (!(await contatoPertenceAoAtendente(id, atendente.id))) {
			return Response.json(
				{ error: "Forbidden", reason: "contato_de_outro_atendente" },
				{ status: 403 },
			);
		}
	}

	const detail = await getContactDetail(id);
	if (!detail) {
		return Response.json({ error: "Contact not found" }, { status: 404 });
	}

	return Response.json(detail);
}

const marcacaoSchema = z.object({
	isSimulated: z.boolean(),
});

/**
 * Marca (ou desmarca) o CONTATO inteiro como teste — todas as conversas dele.
 *
 * **Por que no contato, e não na conversa.** Quem sai da lista de contagem é o
 * cliente, não o canal: o mesmo cliente que falou no site e voltou pelo WhatsApp
 * é UM contato com DUAS conversas. Marcar uma só deixaria a outra contando — e o
 * painel do contato é justamente a tela em que se olha o cliente inteiro. A
 * marcação por conversa continua existindo (tela de Conversas), para quem está
 * olhando uma conversa específica.
 *
 * A operação em si vive em `marcarConversasComoTeste` (a MESMA usada pela rota de
 * conversa e pelo lote): ela leva as três tabelas — conversa, leads e régua. Uma
 * segunda implementação divergiria na primeira tabela nova.
 *
 * **Desmarcar não religa a régua** — mesma decisão de produto da rota de
 * conversa; o motivo está documentado lá.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error } = await requireRole("admin");
	if (error) return error;

	const { id } = await params;
	if (!UUID_RE.test(id)) {
		return Response.json({ error: "Invalid contact ID format" }, { status: 400 });
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

	const detail = await getContactDetail(id);
	if (!detail) {
		return Response.json({ error: "Contact not found" }, { status: 404 });
	}

	const resultado = await marcarConversasComoTeste(
		detail.conversationIds,
		parsed.data.isSimulated,
	);

	return Response.json({
		ok: true,
		isSimulated: parsed.data.isSimulated,
		...resultado,
	});
}
