/**
 * Roteamento inbound do COPILOTO DE MESA (FIX-66).
 *
 * Spec: docs/visao/mesa-de-operacao.md §5 + §8 (sem colisão de canal).
 * Decisões: docs/decisoes/blocos/2026-06-21-bloco-mesa-c.md.
 *
 * Mensagem vinda do WhatsApp de um ATENDENTE DE MESA cadastrado é roteada para
 * o copiloto (NUNCA para o agente de vendas) pelo hook no `processor.ts`. Aqui:
 *   - `isMesaAttendantPhone` decide o roteamento (cache curto, como o
 *     `getAttendantList` do proxy de handoff de chat).
 *   - `handleMesaCopilot` resolve o handoff aberto do atendente, persiste a fala
 *     em `mesa_copilot_messages`, chama o copiloto com o dossiê do caso (manual
 *     da administradora + cota + cliente) e devolve a orientação por WhatsApp.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { administradoraDocs, mesaAttendants, mesaCopilotMessages, mesaHandoffs } from "@/db/schema";
import { generateMesaCopilotReply, type MesaCopilotCaso } from "@/lib/agent/mesa-copilot";
import { sendTextMessage } from "../api";
import { formatTextForWhatsApp, splitMessage } from "../formatter";

interface MesaAttendant {
	id: string;
	nome: string;
	whatsapp: string;
}

const CACHE_TTL_MS = 60_000;
let cache: { data: MesaAttendant[]; fetchedAt: number } | null = null;

/** Lista de atendentes de mesa ativos (cache curto in-memory). */
export async function getMesaAttendantList(): Promise<MesaAttendant[]> {
	if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
		return cache.data;
	}
	const rows = await db
		.select({ id: mesaAttendants.id, nome: mesaAttendants.nome, whatsapp: mesaAttendants.whatsapp })
		.from(mesaAttendants)
		.where(eq(mesaAttendants.isActive, true));
	cache = { data: rows, fetchedAt: Date.now() };
	return rows;
}

/** Invalida o cache — chamar após mutação no CRUD de atendentes de mesa. */
export function invalidateMesaAttendantCache(): void {
	cache = null;
}

/** True se o número pertence a um atendente de mesa ativo. */
export async function isMesaAttendantPhone(phone: string): Promise<boolean> {
	const list = await getMesaAttendantList();
	return list.some((a) => a.whatsapp === phone);
}

const OPEN_STATUSES = ["aberto", "em_andamento"] as const;

const NO_OPEN_HANDOFF_REPLY =
	"👋 Nenhum caso aberto na sua mesa agora. Assim que um cliente for transbordado pra você, " +
	"te mando o resumo do caso por aqui.";

/**
 * Trata uma mensagem do WhatsApp de um atendente de mesa: resolve o handoff
 * aberto mais recente, persiste a fala, chama o copiloto com o dossiê e envia
 * a orientação. Sem handoff aberto → ack amigável e retorna (nunca vendas).
 */
export async function handleMesaCopilot(from: string, text: string): Promise<void> {
	const attendant = (await getMesaAttendantList()).find((a) => a.whatsapp === from);
	// Defensivo: só chega aqui quando isMesaAttendantPhone já deu true.
	if (!attendant) return;

	const handoff = await db.query.mesaHandoffs.findFirst({
		where: and(
			eq(mesaHandoffs.mesaAttendantId, attendant.id),
			inArray(mesaHandoffs.status, [...OPEN_STATUSES]),
		),
		orderBy: [desc(mesaHandoffs.createdAt)],
		with: {
			administradora: true,
			beviProposal: true,
			lead: true,
		},
	});

	if (!handoff) {
		await sendTextMessage(from, NO_OPEN_HANDOFF_REPLY);
		return;
	}

	// Persiste a fala do atendente ANTES de carregar o histórico — assim o turno
	// atual já entra no contexto enviado ao copiloto.
	await db
		.insert(mesaCopilotMessages)
		.values({ mesaHandoffId: handoff.id, role: "attendant", content: text });

	const caso = await buildCaso(handoff);

	const historyRows = await db
		.select({ role: mesaCopilotMessages.role, content: mesaCopilotMessages.content })
		.from(mesaCopilotMessages)
		.where(eq(mesaCopilotMessages.mesaHandoffId, handoff.id))
		.orderBy(asc(mesaCopilotMessages.createdAt));

	const history = historyRows.map((r) => ({ role: r.role, content: r.content }));

	const reply = await generateMesaCopilotReply({ caso, history });

	// Persiste o reply CRU (histórico = palavras reais do agente; formatação é só
	// apresentação). Ao ENVIAR, formata pro WhatsApp e divide em chunks ≤ 4096 —
	// mesmo pipeline de saída do caminho de vendas (adapter.ts). WhatsApp rejeita
	// mensagem > 4096 chars e não renderiza markdown (##/**).
	await db
		.insert(mesaCopilotMessages)
		.values({ mesaHandoffId: handoff.id, role: "assistant", content: reply });

	for (const chunk of splitMessage(formatTextForWhatsApp(reply))) {
		await sendTextMessage(from, chunk);
	}
}

type HandoffWithRelations = NonNullable<
	Awaited<ReturnType<typeof db.query.mesaHandoffs.findFirst>>
> & {
	administradora?: { id: string; nome: string } | null;
	beviProposal?: {
		grupo: string | null;
		creditValue: string | null;
		monthlyPayment: string | null;
		termMonths: number | null;
		segmento: string | null;
		administradora: string | null;
		consortiumProposalLink: string | null;
	} | null;
	lead?: { name: string | null; phone: string | null } | null;
};

/** Monta o dossiê do caso (administradora + docs + cota + cliente) pro copiloto. */
async function buildCaso(handoff: HandoffWithRelations): Promise<MesaCopilotCaso> {
	const admId = handoff.administradora?.id ?? null;
	let administradoraNome = handoff.administradora?.nome ?? null;

	const docs = admId
		? await db
				.select({
					titulo: administradoraDocs.titulo,
					tipo: administradoraDocs.tipo,
					textoExtraido: administradoraDocs.textoExtraido,
				})
				.from(administradoraDocs)
				.where(
					and(
						eq(administradoraDocs.administradoraId, admId),
						eq(administradoraDocs.isActive, true),
					),
				)
		: [];

	const prop = handoff.beviProposal ?? null;
	// Fallback: sem entidade Administradora vinculada, usa o texto da Bevi.
	if (!administradoraNome && prop?.administradora) administradoraNome = prop.administradora;

	return {
		administradoraNome,
		docs,
		grupo: prop?.grupo ?? null,
		creditValue: prop?.creditValue ?? null,
		monthlyPayment: prop?.monthlyPayment ?? null,
		termMonths: prop?.termMonths ?? null,
		segmento: prop?.segmento ?? null,
		proposalLink: prop?.consortiumProposalLink ?? null,
		clienteNome: handoff.lead?.name ?? null,
		clienteContato: handoff.lead?.phone ?? null,
	};
}
