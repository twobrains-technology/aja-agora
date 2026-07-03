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
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import {
	administradoraDocs,
	administradoras,
	leads,
	mesaAttendants,
	mesaCopilotMessages,
	mesaHandoffs,
} from "@/db/schema";
import {
	generateMesaCopilotOpening,
	generateMesaCopilotReply,
	type MesaCopilotCaso,
} from "@/lib/agent/mesa-copilot";
import { claimMesaHandoff } from "@/lib/mesa/handoff";
import { formatTextForWhatsApp, splitMessage } from "../formatter";
import {
	type AdministradoraRef,
	type AvulsoSession,
	getAvulsoSession,
	resolveAdministradora,
	setAvulsoSession,
} from "./avulso";
import { handoffIdFromClaimReply } from "./claim";
import { notifyMesaAttendant } from "./notify";

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
		// Sem caso ativo → modo CONSULTA AVULSA de manual (o atendente pode tirar dúvida sobre
		// uma administradora específica citando o nome). NUNCA cai em vendas (roteado por número).
		await handleMesaManualConsulta(from, text);
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
		await notifyMesaAttendant(from, chunk);
	}
}

// ── Consulta AVULSA de manual (sem caso ativo) ───────────────────────────────

/**
 * CONSULTA AVULSA de manual (Kairo, 2026-07-03): sem caso ativo, o atendente pode tirar dúvida
 * sobre uma administradora ESPECÍFICA citando o nome (casado com o cadastro). Resolve a
 * administradora no allowlist, carrega o manual dela e responde pelo copiloto em modo `avulso`.
 * Continuidade via sessão in-memory por telefone (./avulso): follow-ups sem citar o nome de novo
 * usam a última administradora. Sem nome e sem sessão viva → oferece a escolha (lista as que têm
 * manual). NÃO persiste no DB — é consulta de referência, não um caso.
 */
async function handleMesaManualConsulta(from: string, text: string): Promise<void> {
	const admins: AdministradoraRef[] = await db
		.select({ id: administradoras.id, nome: administradoras.nome, slug: administradoras.slug })
		.from(administradoras);

	const resolved = resolveAdministradora(text, admins);
	// Working session sem updatedAt (o carimbo é do setAvulsoSession); getAvulsoSession devolve
	// a sessão completa, compatível com este tipo mais frouxo.
	let session: Omit<AvulsoSession, "updatedAt"> | null = getAvulsoSession(from);

	// Nome citado (primeira consulta ou troca de administradora) → zera o histórico do tópico.
	if (resolved && (!session || session.administradoraId !== resolved.id)) {
		session = { administradoraId: resolved.id, administradoraNome: resolved.nome, history: [] };
	}

	if (!session) {
		// Sem administradora citada e sem sessão viva → oferece a escolha.
		await notifyMesaAttendant(from, await buildConsultaPrompt());
		return;
	}

	const docs = await db
		.select({
			titulo: administradoraDocs.titulo,
			tipo: administradoraDocs.tipo,
			textoExtraido: administradoraDocs.textoExtraido,
		})
		.from(administradoraDocs)
		.where(
			and(
				eq(administradoraDocs.administradoraId, session.administradoraId),
				eq(administradoraDocs.isActive, true),
			),
		);

	const historyForCopilot = [...session.history, { role: "attendant" as const, content: text }];
	const caso: MesaCopilotCaso = {
		modo: "avulso",
		administradoraNome: session.administradoraNome,
		docs,
	};

	const reply = await generateMesaCopilotReply({ caso, history: historyForCopilot });

	// Continuidade dos follow-ups: guarda o turno completo na sessão in-memory (não no DB).
	setAvulsoSession(from, {
		administradoraId: session.administradoraId,
		administradoraNome: session.administradoraNome,
		history: [...historyForCopilot, { role: "assistant", content: reply }],
	});

	for (const chunk of splitMessage(formatTextForWhatsApp(reply))) {
		await notifyMesaAttendant(from, chunk);
	}
}

/**
 * Mensagem de "escolha a administradora" quando o atendente está sem caso e não citou nenhuma.
 * Lista (limitado a 12) as administradoras que TÊM manual processado; sem nenhuma, orienta o admin.
 */
async function buildConsultaPrompt(): Promise<string> {
	const comManual = await db
		.selectDistinct({ nome: administradoras.nome })
		.from(administradoras)
		.innerJoin(administradoraDocs, eq(administradoraDocs.administradoraId, administradoras.id))
		.where(and(eq(administradoraDocs.isActive, true), isNotNull(administradoraDocs.textoExtraido)));

	const prefix = "👋 Nenhum caso aberto na sua mesa agora.";
	const nomes = comManual.map((c) => c.nome).filter(Boolean);
	if (nomes.length === 0) {
		return `${prefix} Quando um cliente for transbordado pra você, te mando o resumo do caso por aqui. (Ainda não há manual de administradora cadastrado pra consulta.)`;
	}
	const MAX = 12;
	const shown = nomes.slice(0, MAX).join(", ");
	const extra = nomes.length > MAX ? ", entre outras" : "";
	return (
		`${prefix} Se quiser, posso te ajudar com o manual de uma administradora — é só me dizer de qual ` +
		`(ex.: "como faço o boleto na ${nomes[0]}?"). Tenho manual de: ${shown}${extra}.`
	);
}

// ── Claim do transbordo (FIX-124/125, D15/D16) ───────────────────────────────
const CLAIM_NOT_FOUND_REPLY =
	"🤔 Não encontrei esse caso — ele pode ter sido encerrado. Assim que chegar um novo, te aviso por aqui.";

/**
 * Dispatch do clique "Vou atender" de um atendente de mesa. Reivindica o handoff via claim
 * atômico (FIX-125): o 1º que clica ASSUME; os demais recebem "já assumido". Espelha o
 * handleAgentMessage do chat de vendas (proxy.ts) — mesma mecânica, canal WhatsApp da mesa.
 *
 * Best-effort no canal: só chega aqui quando isMesaAttendantPhone já deu true (processor).
 */
export async function handleMesaClaim(from: string, replyId: string): Promise<void> {
	const list = await getMesaAttendantList();
	const attendant = list.find((a) => a.whatsapp === from);
	if (!attendant) return; // defensivo — precedência já garantiu que é atendente de mesa

	const handoffId = handoffIdFromClaimReply(replyId);
	const result = await claimMesaHandoff(handoffId, attendant.id);

	if (result.ok) {
		const clienteNome = await clientNameForHandoff(result.handoff.leadId);
		await notifyMesaAttendant(
			from,
			`✅ Você assumiu o caso${clienteNome ? ` de *${clienteNome}*` : ""}. ` +
				"Já começo a te guiar na contratação por aqui — é só me chamar com qualquer dúvida.",
		);
		// Avisa os demais atendentes que o caso já foi assumido (espelha proxy.ts:527-537).
		for (const other of list) {
			if (other.id !== attendant.id) {
				await notifyMesaAttendant(
					other.whatsapp,
					`ℹ️ *${attendant.nome}* já assumiu o caso${clienteNome ? ` de *${clienteNome}*` : ""}.`,
				);
			}
		}
		// Empurra a orientação INICIAL do copiloto (passo a passo de cadastro na administradora,
		// manual injetado) sem o atendente precisar perguntar — o "empurrão proativo".
		await pushOpeningOrientation(result.handoff.id, from);
		return;
	}

	if (result.reason === "ja_assumido") {
		const owner = result.ownerAttendantId
			? list.find((a) => a.id === result.ownerAttendantId)
			: undefined;
		await notifyMesaAttendant(
			from,
			`⏳ Esse caso já foi assumido${owner ? ` por *${owner.nome}*` : ""}. Fica de olho que já já cai outro. 🤝`,
		);
		return;
	}

	// handoff_not_found
	await notifyMesaAttendant(from, CLAIM_NOT_FOUND_REPLY);
}

/** Nome do cliente de um handoff (pra mensagem do claim). Best-effort — null se não achar. */
async function clientNameForHandoff(leadId: string): Promise<string | null> {
	const [lead] = await db
		.select({ name: leads.name })
		.from(leads)
		.where(eq(leads.id, leadId))
		.limit(1);
	return lead?.name ?? null;
}

/**
 * Empurra a orientação INICIAL do copiloto no WhatsApp do atendente que ACABOU de assumir o
 * caso — sem ele precisar perguntar (o "empurrão proativo"). Gera o passo a passo de cadastro
 * na administradora (manual injetado no copiloto), persiste como `assistant` (contexto pro
 * copiloto não repetir no 1º turno real) e envia formatado/chunkado, mesmo pipeline de saída
 * do Q&A (formatTextForWhatsApp + splitMessage ≤ 4096).
 *
 * BEST-EFFORT: o claim já venceu (fonte de verdade). Falha de LLM/WhatsApp aqui NÃO desfaz o
 * caso — loga e segue; o copiloto continua disponível de forma reativa (handleMesaCopilot).
 */
async function pushOpeningOrientation(handoffId: string, attendantPhone: string): Promise<void> {
	try {
		const handoff = await db.query.mesaHandoffs.findFirst({
			where: eq(mesaHandoffs.id, handoffId),
			with: { administradora: true, beviProposal: true, lead: true },
		});
		if (!handoff) return;

		const caso = await buildCaso(handoff);
		const opening = await generateMesaCopilotOpening({ caso });
		if (!opening?.trim()) return;

		await db
			.insert(mesaCopilotMessages)
			.values({ mesaHandoffId: handoffId, role: "assistant", content: opening });

		for (const chunk of splitMessage(formatTextForWhatsApp(opening))) {
			await notifyMesaAttendant(attendantPhone, chunk);
		}
	} catch (err) {
		console.error(
			JSON.stringify({
				level: "error",
				source: "mesa-claim-opening",
				handoff_id: handoffId,
				error: err instanceof Error ? err.message : String(err),
				note: "orientação inicial do copiloto falhou (claim mantido; copiloto segue reativo)",
			}),
		);
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
