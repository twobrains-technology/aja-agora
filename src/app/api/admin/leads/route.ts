import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { periodoEfetivoDoPipeline } from "@/components/admin/pipeline/periodo-do-pipeline";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { dedupLeadsByContact } from "@/lib/admin/kanban-dedup";
import type { LeadStage } from "@/lib/admin/lead-transitions";
import { cardsDaMesaExterna } from "@/lib/admin/mesa-externa-cards";
import { origemDaVisita } from "@/lib/admin/origem-label";
import { fimDoDia, inicioDoDia, instanteDoParametro } from "@/lib/admin/periodo";
import { requireRole } from "@/lib/admin/require-role";
import { isMesaExterna, raiasVisiveisPara } from "@/lib/admin/role-scope";
import { conversaIdentificada } from "@/lib/admin/sinais-do-funil";
import {
	getActiveHandoffsByLead,
	getLeadIdsDoAtendente,
	getMesaAttendantByUserId,
} from "@/lib/mesa/handoff";

/**
 * O recorte "identificável" em SQL — o lead cuja CONVERSA o cliente
 * identificou (`conversaIdentificada`): WhatsApp, ou web com contato coletado.
 *
 * `EXISTS` sobre `conversations` porque o predicado do funil mede CONVERSA, e o
 * card do quadro é do LEAD. É a mesma fonte da lista de Conversas e do degrau do
 * funil — não há segunda definição para divergir.
 */
const recorteIdentificavel = sql`EXISTS (
  SELECT 1 FROM conversations c
  WHERE c.id = ${leads.conversationId}
    AND ${conversaIdentificada(sql`c`)}
)`;

/**
 * O recorte do quadro mora no SERVIDOR.
 *
 * Até aqui a rota devolvia a base INTEIRA e o período era aplicado no cliente
 * (`pipeline-filters.tsx`): o chip do cabeçalho dizia "30 dias" enquanto a
 * resposta carregava todo o histórico, e o lead simulado — que é demo — entrava
 * no mesmo número da operação. Duas afirmações diferentes na mesma tela.
 *
 * O período agora é resolvido aqui pela MESMA regra do resto do painel
 * (`periodoEfetivoDoPipeline`: URL > cookie > "desde o início"), e o simulado só
 * aparece com opt-in explícito (`?include_simulated=true`), como em
 * `/api/admin/conversations`. O filtro "identificável" (`?identificavel=true`)
 * também é daqui, com o predicado único do funil (`conversaIdentificada`).
 */
export async function GET(request?: Request) {
	const { error, session, role } = await requireRole(
		"admin",
		"viewer",
		"attendant",
		"mesa_externa",
	);
	if (error) return error;

	const busca = request ? new URL(request.url).searchParams : null;
	// Aceita só o literal "true": qualquer outra string é false, para que
	// `?include_simulated=1` ou `=sim` não liguem o recorte por acidente.
	const includeSimulated = busca?.get("include_simulated") === "true";
	// O filtro "identificável" (AJA-23 T2) é do SERVIDOR, e usa o MESMO predicado
	// das telas de Conversas, do funil e do Percurso (`conversaIdentificada`).
	// Antes ele rodava no cliente com uma reimplementação em JS que nem checava
	// `is_simulated` — com "Mostrar testes" ligado, o mesmo lead simulado aparecia
	// no Kanban como identificável e sumia da lista de Conversas. Duas verdades
	// para o mesmo rótulo, e o teste de paridade não executava o SQL para pegar.
	const identificavel = busca?.get("identificavel") === "true";

	// `from`/`to` chegam como DIA do negócio (`YYYY-MM-DD`) ou ISO completo, e a
	// janela resultante usa `inicioDoDia`/`fimDoDia` — os mesmos que o recorte do
	// cliente usava, agora sobre o `created_at` do lead.
	const periodo = periodoEfetivoDoPipeline(
		instanteDoParametro(busca?.get("from") ?? ""),
		instanteDoParametro(busca?.get("to") ?? ""),
		// O cabeçalho CRU (`aja_periodo=...`), não o valor: `periodoEfetivoDoPipeline`
		// procura `nome=valor` e devolve `null` para um valor solto — passar o valor
		// já extraído faria o cookie ser ignorado em silêncio e a tela mostrar uma
		// janela enquanto a rota recortava outra.
		request?.headers.get("cookie") ?? null,
	);

	const allLeads = await db.query.leads.findMany({
		where: and(
			gte(leads.createdAt, inicioDoDia(periodo.de)),
			lte(leads.createdAt, fimDoDia(periodo.ate)),
			...(includeSimulated ? [] : [eq(leads.isSimulated, false)]),
			...(identificavel ? [recorteIdentificavel] : []),
		),
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
							// O id da CAMPANHA da Meta: é a chave que resolve o nome real
							// (`meta_entities`). Sem ele, o card só tem a UTM — texto que o
							// anunciante digitou — e o painel volta a rotular pelo sufixo de
							// seis dígitos, que casa com dois anúncios diferentes.
							campaignId: true,
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
