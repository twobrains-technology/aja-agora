// FIX-45 — visão consolidada do CONTATO (cliente unificado).
// Agrega TUDO que o cliente fez: conversas (web + WhatsApp) com mensagens e
// artifacts, propostas Bevi, e o histórico de movimentação no funil (lead_events).
// CPF mascarado por default (DES-CPF-RAW). Lógica em @/lib/admin/contact-detail.

import { getContactDetail } from "@/lib/admin/contact-detail";
import { requireRole } from "@/lib/admin/require-role";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	const { id } = await params;
	if (!UUID_RE.test(id)) {
		return Response.json({ error: "Invalid contact ID format" }, { status: 400 });
	}

	const detail = await getContactDetail(id);
	if (!detail) {
		return Response.json({ error: "Contact not found" }, { status: 404 });
	}

	return Response.json(detail);
}
