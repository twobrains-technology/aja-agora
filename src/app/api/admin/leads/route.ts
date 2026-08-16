import { desc } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { dedupLeadsByContact } from "@/lib/admin/kanban-dedup";
import type { LeadStage } from "@/lib/admin/lead-transitions";
import { cardsDaMesaExterna } from "@/lib/admin/mesa-externa-cards";
import { origemDaVisita } from "@/lib/admin/origem-label";
import { requireRole } from "@/lib/admin/require-role";
import { isMesaExterna, raiasVisiveisPara } from "@/lib/admin/role-scope";
import {
	getActiveHandoffsByLead,
	getLeadIdsDoAtendente,
	getMesaAttendantByUserId,
} from "@/lib/mesa/handoff";

export async function GET() {
	const { error, session, role } = await requireRole(
		"admin",
		"viewer",
		"attendant",
		"mesa_externa",
	);
	if (error) return error;

	// Pipeline mostra TODOS os leads (incl. simulados) — o simulador é
	// considerado "demo path" pro stakeholder e deve refletir o fluxo real.
	// Dashboard de métricas comerciais (dashboard-queries.ts) continua
	// filtrando is_simulated=false — esse é caso separado.
	const allLeads = await db.query.leads.findMany({
		orderBy: [desc(leads.updatedAt)],
		with: {
			conversation: {
				columns: {
					channel: true,
					createdAt: true,
					updatedAt: true,
				},
				// A visita é o que responde "de qual campanha veio este lead?" — a
				// pipeline mostrava o canal (web/WhatsApp) e nunca a campanha, então
				// a pergunta só tinha resposta agregada, na tela de Performance.
				with: {
					visit: {
						columns: {
							utmSource: true,
							utmMedium: true,
							utmCampaign: true,
							utmContent: true,
							ctwaSourceId: true,
							ctwaHeadline: true,
							referrer: true,
						},
					},
				},
			},
		},
	});

	const comDataEmTexto = allLeads.map((l) => ({
		...l,
		updatedAt: l.updatedAt.toISOString(),
		// `null` quando não há visita, e isso NÃO é o mesmo que "direto": conversa
		// que nasceu fora da landing (WhatsApp orgânico, importação) nunca teve
		// chegada medida, e chamá-la de direta afirmaria um fato que ninguém viu.
		origem: l.conversation?.visit ? origemDaVisita(l.conversation.visit) : null,
	}));

	// Recorte da MESA EXTERNA — feito aqui, no servidor, e não escondendo coluna
	// no componente: o que a rota devolve é o que existe pra aquele login. Um
	// `hidden` no front deixaria o funil inteiro a um `fetch` de distância.
	const raiasVisiveis = raiasVisiveisPara(role);

	// FIX-45: dedup por CONTATO — o mesmo cliente em web + WhatsApp vira UM card
	// (não dois). Leads anônimos (sem contactId) ficam individuais. Cada card
	// carrega `channels` (badge multi-canal) e `contactId` (abre a visão
	// consolidada). Lógica pura em @/lib/admin/kanban-dedup.
	//
	// Pra mesa externa o recorte vem ANTES do dedup (`mesa-externa-cards.ts`):
	// deduplicar primeiro deixa um lead alheio ao atendimento eleger o card e o
	// caso some do quadro de quem está atendendo.
	let cards: Array<(typeof comDataEmTexto)[number] & { channels: string[] }>;

	if (isMesaExterna(role)) {
		const atendente = await getMesaAttendantByUserId(session.user.id);
		// Conta sem atendente vinculado (ou desativado) não é "vê tudo": é vê nada.
		if (!atendente || !atendente.isActive) {
			return Response.json({ leads: vazio(raiasVisiveis), stages: raiasVisiveis });
		}
		cards = cardsDaMesaExterna(comDataEmTexto, await getLeadIdsDoAtendente(atendente.id));
	} else {
		cards = dedupLeadsByContact(comDataEmTexto);
	}

	// Visibilidade (spec 2026-07-03): anexa o responsável da mesa (handoff ativo) a cada card,
	// pro selo do kanban e o bloco "Responsável". card.id = lead representativo do contato.
	const handoffs = await getActiveHandoffsByLead(cards.map((c) => c.id));
	const cardsWithHandoff = cards.map((c) => ({
		...c,
		activeHandoff: handoffs.get(c.id) ?? null,
	}));

	// Agrupa os cards por raia — só nas raias que esta role enxerga.
	const groupedLeads: Record<string, typeof cardsWithHandoff> = vazio(raiasVisiveis);
	for (const card of cardsWithHandoff) {
		const stage = card.stage as LeadStage;
		if (groupedLeads[stage]) {
			groupedLeads[stage].push(card);
		}
	}

	return Response.json({ leads: groupedLeads, stages: raiasVisiveis });
}

/** Mapa raia → [] para exatamente as raias permitidas. */
function vazio<T>(raias: readonly string[]): Record<string, T[]> {
	const m: Record<string, T[]> = {};
	for (const r of raias) m[r] = [];
	return m;
}
