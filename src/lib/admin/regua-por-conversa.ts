/**
 * A RÉGUA, CONVERSA A CONVERSA — server-only.
 *
 * Duas telas fazem a MESMA pergunta ("esta conversa está na régua? se não, por
 * quê?"): a lista de Conversas (coluna Remarketing) e o Percurso (coluna Régua,
 * quando o filtro é ≥ "Se identificou"). Responder em dois lugares com duas
 * consultas é como as duas respostas passam a divergir na primeira mudança de
 * guarda — então a leitura mora aqui, uma vez.
 *
 * `avaliarRegua` é PURA sobre fatos já lidos (o motivo é
 * `motivoForaDaRegua`, o dicionário único). `fatosDeConversas` busca esses
 * fatos por id, numa consulta só — sem N+1 —, para quem parte de uma lista de
 * conversas em vez de já ter as colunas em mãos (o caso do Percurso, cuja
 * consulta é de outro bloco e não pode ganhar a coluna).
 *
 * O que NÃO muda: a régua lê `channel='whatsapp'` e a lista mostra o motivo
 * para quem ficou fora. A conversa que JÁ tem linha em `remarketing_touches` não
 * ganha motivo — ela está na régua, e o que a tela mostra é o passo dela.
 */

import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contacts, conversations, remarketingTouches } from "@/db/schema";
import { ESPERA_SILENCIO_MS, type StatusRegua } from "@/lib/remarketing/regua";
import { chaveTelefoneBR } from "@/lib/whatsapp/mesmo-numero";
import {
	type ConversaAvaliavel,
	JANELA_DE_ENTRADA_MS,
	type MotivoForaDaRegua,
	motivoForaDaRegua,
} from "./motivo-fora-da-regua";

export interface LinhaDaReguaResumida {
	status: StatusRegua;
	step: number;
	nextTouchAt: Date | null;
	ultimoToqueEm: Date | null;
}

/** Os fatos de uma conversa que o motivo e a coluna precisam. */
export interface FatosDaConversa {
	conversationId: string;
	channel: string;
	status: string;
	isSimulated: boolean;
	contactId: string | null;
	lastInboundAt: Date | null;
	waId: string | null;
	/** `contacts.phone` — para mascarar e completar o telefone alcançável. */
	telefone: string | null;
	/** A linha da régua, quando existe. */
	regua: LinhaDaReguaResumida | null;
}

export interface AvaliacaoDaRegua {
	motivo: MotivoForaDaRegua | null;
	regua: LinhaDaReguaResumida | null;
	ehDaEquipe: boolean;
	/** Telefone mascarado para exibição (`55629***6793` → `(62) 9…-6793`). */
	telefoneMascarado: string | null;
	/** A conversa tem telefone alcançável (wa_id ou contacts.phone). */
	temTelefone: boolean;
}

/**
 * O conjunto de telefones da equipe, montado UMA vez.
 *
 * Compara pela chave canônica do BR (mesmo nono dígito/DDI do `ehTelefoneInterno`),
 * senão o mesmo aparelho com e sem "55" driblaria a guarda. Falha do banco NÃO
 * libera: quem não puder ser verificado fica marcado como equipe, porque o erro
 * que não se pode cometer é tocar quem é de dentro.
 */
export async function telefonesDaEquipe(): Promise<(telefone: string) => boolean> {
	const internos = new Set<string>();
	try {
		const [{ getAttendantList }, { getMesaAttendantList }] = await Promise.all([
			import("@/lib/whatsapp/proxy"),
			import("@/lib/whatsapp/mesa/routing"),
		]);
		const [atendentes, mesa] = await Promise.all([getAttendantList(), getMesaAttendantList()]);
		for (const a of atendentes) {
			const chave = chaveTelefoneBR(a.phone);
			if (chave) internos.add(chave);
		}
		for (const m of mesa) {
			const chave = chaveTelefoneBR(m.whatsapp);
			if (chave) internos.add(chave);
		}
	} catch {
		// Banco fora: devolve um predicado que trata TODO telefone como equipe.
		return () => true;
	}

	const { ehTelefoneInterno } = await import("@/lib/remarketing/motor");
	return (telefone: string) => {
		if (ehTelefoneInterno(telefone)) return true;
		const chave = chaveTelefoneBR(telefone);
		return chave !== null && internos.has(chave);
	};
}

/**
 * Monta a avaliação de cada conversa. PURA exceto pelo predicado de equipe.
 *
 * `ehEquipe` é passado de fora porque a resposta é uma LISTA (atendentes +
 * mesa), lida uma vez para o lote inteiro — resolvê-la linha a linha seria uma
 * consulta por conversa.
 */
export function avaliarRegua(
	fatos: readonly FatosDaConversa[],
	agora: Date,
	ehEquipe: (telefone: string) => boolean,
	env: Record<string, string | undefined> = process.env,
): Map<string, AvaliacaoDaRegua> {
	const avaliações = new Map<string, AvaliacaoDaRegua>();
	for (const f of fatos) {
		const telefone = f.waId ?? f.telefone;
		const ehDaEquipe = telefone ? ehEquipe(telefone) : false;
		const entrada: ConversaAvaliavel = {
			channel: f.channel,
			status: f.status,
			isSimulated: f.isSimulated,
			contactId: f.contactId,
			lastInboundAt: f.lastInboundAt,
			temTelefone: Boolean(f.waId || f.telefone),
			ehDaEquipe,
			temLinhaNaRegua: f.regua !== null,
		};
		avaliações.set(f.conversationId, {
			motivo: motivoForaDaRegua(entrada, agora, env),
			regua: f.regua,
			ehDaEquipe,
			telefoneMascarado: mascararTelefone(f.waId ?? f.telefone),
			temTelefone: Boolean(f.waId || f.telefone),
		});
	}
	return avaliações;
}

/**
 * Telefone para exibir: `(83) 9…-9307`. Reaproveita a máscara do painel e a
 * chave canônica do BR — o `wa_id` da Meta chega com "55" na frente e mascarar
 * o E.164 cru mostraria "55" como DDD.
 */
function mascararTelefone(telefone: string | null): string | null {
	if (!telefone) return null;
	const chave = chaveTelefoneBR(telefone);
	if (!chave) return null;
	const ddd = chave.slice(0, 2);
	const finais = chave.slice(-4);
	return `(${ddd}) 9…-${finais}`;
}

/** Os fatos (conversa + contato + linha da régua) de um lote de conversas. */
export async function fatosDeConversas(
	conversationIds: readonly string[],
): Promise<FatosDaConversa[]> {
	const ids = [...new Set(conversationIds.filter(Boolean))];
	if (ids.length === 0) return [];

	const linhas = await db
		.select({
			conversationId: conversations.id,
			channel: conversations.channel,
			status: conversations.status,
			isSimulated: conversations.isSimulated,
			contactId: conversations.contactId,
			lastInboundAt: conversations.lastInboundAt,
			waId: conversations.waId,
			telefone: contacts.phone,
			reguaStatus: remarketingTouches.status,
			reguaStep: remarketingTouches.step,
			reguaNextTouchAt: remarketingTouches.nextTouchAt,
			reguaUltimoToqueEm: remarketingTouches.ultimoToqueEm,
		})
		.from(conversations)
		.leftJoin(contacts, eq(contacts.id, conversations.contactId))
		.leftJoin(remarketingTouches, eq(remarketingTouches.conversationId, conversations.id))
		.where(inArray(conversations.id, ids));

	return linhas.map((l) => ({
		conversationId: l.conversationId,
		channel: l.channel,
		status: l.status,
		isSimulated: l.isSimulated,
		contactId: l.contactId ?? null,
		lastInboundAt: l.lastInboundAt ?? null,
		waId: l.waId ?? null,
		telefone: l.telefone ?? null,
		regua: l.reguaStatus
			? {
					status: l.reguaStatus as StatusRegua,
					step: Number(l.reguaStep ?? 0),
					nextTouchAt: l.reguaNextTouchAt ?? null,
					ultimoToqueEm: l.reguaUltimoToqueEm ?? null,
				}
			: null,
	}));
}

/** Atalho para quem parte de ids: busca os fatos e já avalia. */
export async function avaliarReguaPorIds(
	conversationIds: readonly string[],
	agora: Date,
): Promise<Map<string, AvaliacaoDaRegua>> {
	const fatos = await fatosDeConversas(conversationIds);
	const ehEquipe = await telefonesDaEquipe();
	return avaliarRegua(fatos, agora, ehEquipe);
}

// Reexportado para quem precisa da janela sem importar o dicionário inteiro.
export { JANELA_DE_ENTRADA_MS, ESPERA_SILENCIO_MS };
