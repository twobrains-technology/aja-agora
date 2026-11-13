/**
 * Quem responde este cliente agora: o agente ou uma pessoa?
 *
 * Esta é a ÚNICA pergunta que todo caminho de fala com o cliente deve fazer —
 * webhook do WhatsApp, chat da web, reengajamento. Um ponto de decisão, não um
 * guard novo a cada bug.
 *
 * ## Por que existe
 *
 * A trava do agente nasceu gravada na LINHA da conversa (`conversations.status =
 * 'handed_off'`) e consultada por igualdade exata de `waId`. Entre 2026-08-10 e
 * 12/11/2026 ela passou a valer para a PESSOA (qualquer conversa `handed_off` do
 * mesmo telefone calava todas as outras, para sempre); ver "A inversão" abaixo,
 * que voltou ao escopo da conversa por decisão do dono.
 *
 * O incidente que empurrou a regra para o telefone: em prod (2026-08-10) o
 * atendente assumiu o caso pelo painel (conversa web, `62992496793`, marcada
 * `handed_off`), o cliente respondeu pelo WhatsApp (conversa `556292496793`, ainda
 * `active`), e o AGENTE respondeu por cima do humano que estava atendendo.
 *
 * ## A inversão (12/11/2026)
 *
 * A pergunta é sobre a CONVERSA, nunca sobre a pessoa: "nesta conversa, alguém
 * assumiu?" Um `handed_off` de outra conversa — mesmo do mesmo telefone — não
 * cala o agente aqui.
 *
 * A decisão por telefone foi REMOVIDA em 12/11/2026 por decisão do dono (Kairo:
 * *"tira essa regra do handed_off, se o cara entrar ele continua conversando sem
 * problema"*). Ela era a allowlist por pessoa ("havendo atendimento humano aberto
 * para ela, a resposta é não, em canal nenhum"), e o preço era o oposto do que se
 * queria: um registro velho perseguia o cliente. Em produção (09/11) a conversa
 * web `62992496793` ficou `handed_off` com um caso de mesa; três dias depois o
 * cliente voltou, pediu carta de R$ 250 mil e o agente não respondeu — "Mensagem
 * enviada para Consultor", sem ninguém do outro lado. A conversa morreu por causa
 * de um registro velho. O dono decidiu: a trava vale para a conversa onde o
 * humano atende, e a conversa nova é do agente.
 *
 * O que se perde com isso, registrado sem omissão: o caso de 2026-08-10 — humano
 * atendendo no WhatsApp e cliente voltando pela WEB — agora fala com o agente. Era
 * o incidente que justificou a regra por telefone; deixou de ser o comportamento
 * desejado. P11 continua valendo dentro da conversa: onde um humano assumiu, o
 * agente não fala por cima.
 *
 * ## Dono, nome real e o estado sem dono
 *
 * `handed_off` + caso na mesa dizia "humano" mesmo quando ninguém havia assumido
 * — o cliente escrevia, o agente calava, e a única coisa que ele lia era
 * "Mensagem enviada para Consultor. Aguarde a resposta aqui." sem nenhum humano
 * do outro lado (dev, 2026-11). "Consultor" era o nome inventado no lugar de um
 * dono que não existia: a mesa deixa `handedOffUserId` nulo de propósito
 * (`src/lib/mesa/handoff.ts`) e o dono real dela é
 * `mesa_handoffs.mesa_attendant_id`, que este módulo não lia.
 *
 * Por isso a decisão passou a nomear três estados, não dois:
 *
 * - `humano` — alguém assumiu, e com NOME (`users.name` ou `mesa_attendants.nome`);
 * - `atendimento-sem-dono` — o caso está aberto e ninguém assumiu. A conversa não
 *   pode morrer aí (P0): o turno acontece, na voz da acolhida, não da venda;
 * - `agente` — não há atendimento aberto.
 *
 * A raia do funil NÃO entra nessa conta: mover card não solta nem prende o
 * agente. Quem devolve a conversa é o "Encerrar atendimento", explicitamente.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { conversations, mesaHandoffs } from "@/db/schema";
import { ACTIVE_HANDOFF_STATUSES } from "@/lib/mesa/handoff";

/** Quem assumiu o atendimento — com o NOME de quem atende, que é o que o cliente lê. */
export type DonoDoAtendimento =
	| { tipo: "vendedor"; userId: string; nome: string }
	| { tipo: "mesa"; attendantId: string; handoffId: string; nome: string };

/**
 * Por que o agente está autorizado a falar.
 *
 * `sem-atendimento-aberto` é o caso normal. A exceção viva — atendimento aberto
 * sem ninguém do outro lado — deixou de ser um motivo do agente: virou um estado
 * próprio (`atendimento-sem-dono`), porque o turno que responde nele não é o
 * mesmo turno de venda.
 */
export type MotivoDoAgente = "sem-atendimento-aberto";

export type QuemResponde =
	| {
			quem: "humano";
			/** A conversa onde o atendimento vive — a própria conversa de entrada: a
			 * trava não atravessa mais o telefone. */
			conversationId: string;
			/** Nome REAL de quem atende (`users.name` ou `mesa_attendants.nome`). */
			dono: DonoDoAtendimento;
			/** Continua existindo pelo que já é consumido: id do vendedor, quando é vendedor. */
			handedOffUserId: string | null;
	  }
	| {
			quem: "atendimento-sem-dono";
			conversationId: string;
			handoffId: string;
	  }
	| { quem: "agente"; motivo: MotivoDoAgente };

/**
 * Quem responde NESTA conversa: o agente, um humano com nome, ou um atendimento
 * aberto e sem dono.
 *
 * `conv` é a conversa de ENTRADA — a que recebeu a fala do cliente. É só ela que
 * entra na conta: nada de varrer as conversas do mesmo telefone. Sem conversa
 * (ou sem id), não há atendimento aberto a respeitar.
 */
export async function quemRespondePara(
	conv: { id: string; waId: string | null } | null | undefined,
): Promise<QuemResponde> {
	if (!conv?.id) return { quem: "agente", motivo: "sem-atendimento-aberto" };

	// Uma linha, a da conversa de entrada. O dono vem junto (`handedOffUser`): o
	// nome real de quem assumiu é o que o cliente lê.
	const conversa = await db.query.conversations.findFirst({
		where: eq(conversations.id, conv.id),
		columns: { id: true, status: true, handedOffUserId: true },
		with: { handedOffUser: { columns: { id: true, name: true } } },
	});
	if (!conversa) return { quem: "agente", motivo: "sem-atendimento-aberto" };

	// A ordem dos braços é a regra: DONO VENCE SEM-DONO, E SEM-DONO VENCE AGENTE.

	// 1. Claim de vendedor (`handedOffUserId`). O `status` faz parte da conta de
	// propósito: "Encerrar atendimento" (`mesa/handoff.ts`) devolve a conversa ao
	// agente com `status = active` e NÃO limpa `handed_off_user_id` — sem este par,
	// o resíduo da coluna calaria o agente para sempre na conversa encerrada. Sem o
	// registro em `users` (FK quebrada) não há nome real: não serve como dono, e o
	// motivo vai ao rastro.
	if (conversa.status === "handed_off" && conversa.handedOffUserId != null) {
		const nome = conversa.handedOffUser?.name?.trim();
		if (nome) {
			return {
				quem: "humano",
				conversationId: conversa.id,
				dono: { tipo: "vendedor", userId: conversa.handedOffUserId, nome },
				handedOffUserId: conversa.handedOffUserId,
			};
		}
		registrarFkQuebrada({
			origem: "conversations.handed_off_user_id",
			conversationId: conversa.id,
			referencia: conversa.handedOffUserId,
		});
	}

	// Os casos da mesa DESTA conversa, já com o atendente pendurado.
	const casos = await db.query.mesaHandoffs.findMany({
		where: and(
			eq(mesaHandoffs.conversationId, conversa.id),
			inArray(mesaHandoffs.status, [...ACTIVE_HANDOFF_STATUSES]),
		),
		columns: { id: true, status: true, mesaAttendantId: true },
		with: { mesaAttendant: { columns: { id: true, nome: true } } },
	});

	// 2. Caso EM ANDAMENTO com atendente de mesa: este assumiu de verdade.
	for (const caso of casos) {
		if (caso.status !== "em_andamento" || caso.mesaAttendantId == null) continue;
		const nome = caso.mesaAttendant?.nome?.trim();
		if (!nome) {
			registrarFkQuebrada({
				origem: "mesa_handoffs.mesa_attendant_id",
				conversationId: conversa.id,
				referencia: caso.mesaAttendantId,
			});
			continue;
		}
		return {
			quem: "humano",
			conversationId: conversa.id,
			dono: {
				tipo: "mesa",
				attendantId: caso.mesaAttendantId,
				handoffId: caso.id,
				nome,
			},
			handedOffUserId: null,
		};
	}

	// 3. Caso ativo sem dono — `aberto`, com ou sem atendente nomeado (nomeado em
	// `aberto` é fila, não atendimento). É o beco que matou a conversa: existe
	// atendimento e ninguém do outro lado.
	const semDono = casos[0];
	if (semDono) {
		return {
			quem: "atendimento-sem-dono",
			conversationId: conversa.id,
			handoffId: semDono.id,
		};
	}

	// 4. Resíduo: linha `handed_off` sem dono e sem caso na mesa não cala o agente
	// (P8). Este comportamento fechou o incidente de 09/11 e não pode regredir.
	return { quem: "agente", motivo: "sem-atendimento-aberto" };
}

/**
 * O dono apontado pela coluna não existe — FK quebrada. Tratar como sem dono é o
 * certo (não há nome real para o cliente ler), mas o motivo não pode sumir: sem
 * esta linha o próximo incidente começa do zero.
 */
function registrarFkQuebrada(ctx: {
	origem: string;
	conversationId: string;
	referencia: string;
}): void {
	try {
		console.info(
			JSON.stringify({
				level: "info",
				source: "quem-responde",
				evento: "dono-sumiu",
				origem: ctx.origem,
				conversation_id: ctx.conversationId,
				referencia: ctx.referencia,
			}),
		);
	} catch {
		// Rastro não derruba decisão.
	}
}

/**
 * Depois de tentar entregar a mensagem do cliente ao atendimento, o agente cala?
 *
 * Mesa cala sempre: o caso é dela e o painel é onde o dono vê a conversa —
 * reenviar por WhatsApp não é o que faz o atendimento acontecer.
 *
 * Vendedor cala só se a mensagem SAIU pra alguém (`entregue`). Sem entrega, o
 * cliente ficaria esperando por quem nunca foi avisado (OC-31).
 */
export function agenteCalaAposRelay(decisao: QuemResponde, entregue: boolean): boolean {
	if (decisao.quem !== "humano") return false;
	if (decisao.dono.tipo === "mesa") return true;
	return entregue;
}

/** O motivo, em uma palavra, para o rastro. Nunca inventa estado. */
function motivoDoRastro(decisao: QuemResponde): string {
	if (decisao.quem === "agente") return decisao.motivo;
	if (decisao.quem === "atendimento-sem-dono") return "caso-ativo-sem-dono";
	return decisao.dono.tipo === "mesa" ? "assumido-pela-mesa" : "assumido-pelo-vendedor";
}

/** Uma linha JSON com o motivo da decisão — sem isto o próximo incidente é arqueologia. */
export function rastroDaDecisao(
	decisao: QuemResponde,
	ctx: { canal: "web" | "whatsapp"; conversationId: string },
): void {
	try {
		console.info(
			JSON.stringify({
				level: "info",
				source: "quem-responde",
				canal: ctx.canal,
				conversation_id: ctx.conversationId,
				quem: decisao.quem,
				motivo: motivoDoRastro(decisao),
				dono_tipo: decisao.quem === "humano" ? decisao.dono.tipo : null,
				dono_nome: decisao.quem === "humano" ? decisao.dono.nome : null,
				handoff_id:
					decisao.quem === "atendimento-sem-dono"
						? decisao.handoffId
						: decisao.quem === "humano" && decisao.dono.tipo === "mesa"
							? decisao.dono.handoffId
							: null,
			}),
		);
	} catch {
		// Rastro não derruba decisão.
	}
}
