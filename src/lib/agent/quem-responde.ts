/**
 * Quem responde este cliente agora: o agente ou uma pessoa?
 *
 * Esta é a ÚNICA pergunta que todo caminho de fala com o cliente deve fazer —
 * webhook do WhatsApp, chat da web, reengajamento. Um ponto de decisão, não um
 * guard novo a cada bug.
 *
 * ## Por que existe
 *
 * A trava do agente era gravada na LINHA da conversa (`conversations.status =
 * 'handed_off'`) e consultada por igualdade exata de `waId`. Só que quem é
 * atendido é a PESSOA, e uma pessoa tem várias conversas — uma por canal — com o
 * telefone gravado em formatos diferentes em cada uma.
 *
 * Em prod (2026-08-10) isso apareceu do pior jeito: o atendente assumiu o caso
 * pelo painel (conversa web, `62992496793`, marcada `handed_off`), o cliente
 * respondeu pelo WhatsApp (conversa `556292496793`, ainda `active`), e o AGENTE
 * respondeu por cima do humano que estava atendendo.
 *
 * ## A inversão
 *
 * Antes: "esta conversa está bloqueada?" — blocklist, incompleta por construção;
 * sempre falta o canal/formato que ninguém previu.
 *
 * Agora: "o agente está autorizado a falar com esta pessoa?" — allowlist. Havendo
 * atendimento humano ABERTO para ela, a resposta é não, em canal nenhum.
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
import { chaveTelefoneBR } from "@/lib/whatsapp/mesmo-numero";

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
			/** Conversa onde o atendimento vive — nem sempre a do canal de entrada. */
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
 * Resolve pelo telefone, cobrindo todos os formatos do mesmo número.
 *
 * `identificador` é o wa_id de quem falou (ou o telefone da conversa web).
 */
export async function quemRespondePara(
	identificador: string | null | undefined,
): Promise<QuemResponde> {
	if (!identificador) return { quem: "agente", motivo: "sem-atendimento-aberto" };

	// Só as conversas entregues a gente — são poucas, e é o único estado que pode
	// calar o agente. Filtrar aqui evita varrer a tabela pra comparar chave. O dono
	// vem junto (`handedOffUser`): consultar por linha custaria uma ida ao banco
	// para cada candidata.
	const emAtendimento = await db.query.conversations.findMany({
		where: eq(conversations.status, "handed_off"),
		columns: { id: true, waId: true, handedOffUserId: true },
		with: { handedOffUser: { columns: { id: true, name: true } } },
	});

	if (emAtendimento.length === 0) return { quem: "agente", motivo: "sem-atendimento-aberto" };

	const chave = chaveTelefoneBR(identificador);
	const casam = emAtendimento.filter((conv) => {
		// Sem chave utilizável (número fora do padrão BR, id simulado), a
		// comparação cai na igualdade exata — o comportamento que já existia.
		return chave ? chaveTelefoneBR(conv.waId) === chave : conv.waId === identificador;
	});
	if (casam.length === 0) return { quem: "agente", motivo: "sem-atendimento-aberto" };

	// Uma consulta só para os casos ativos de TODAS as conversas da pessoa,
	// já com o atendente de mesa pendurado.
	const casosDaPessoa = await db.query.mesaHandoffs.findMany({
		where: and(
			inArray(
				mesaHandoffs.conversationId,
				casam.map((c) => c.id),
			),
			inArray(mesaHandoffs.status, [...ACTIVE_HANDOFF_STATUSES]),
		),
		columns: { id: true, conversationId: true, status: true, mesaAttendantId: true },
		with: { mesaAttendant: { columns: { id: true, nome: true } } },
	});

	// Caso sem conversa é caso de lead, não de atendimento: não há onde falar com
	// o cliente, então não serve para decidir quem fala.
	const casos = casosDaPessoa.flatMap((caso) =>
		caso.conversationId ? [{ ...caso, conversationId: caso.conversationId }] : [],
	);

	// A ordem dos braços é a regra: DONO VENCE SEM-DONO, E SEM-DONO VENCE AGENTE.
	// Parar na primeira linha sem dono devolveria o estado errado enquanto outra
	// conversa da mesma pessoa tem dono.

	// 1. Claim de vendedor (`handedOffUserId`). Sem o registro em `users` (FK
	// quebrada) não há nome real: não serve como dono, e o motivo vai ao rastro.
	for (const conv of casam) {
		if (conv.handedOffUserId == null) continue;
		const nome = conv.handedOffUser?.name?.trim();
		if (!nome) {
			registrarFkQuebrada({
				origem: "conversations.handed_off_user_id",
				conversationId: conv.id,
				referencia: conv.handedOffUserId,
			});
			continue;
		}
		return {
			quem: "humano",
			conversationId: conv.id,
			dono: { tipo: "vendedor", userId: conv.handedOffUserId, nome },
			handedOffUserId: conv.handedOffUserId,
		};
	}

	// 2. Caso EM ANDAMENTO com atendente de mesa: este assumiu de verdade.
	for (const caso of casos) {
		if (caso.status !== "em_andamento" || caso.mesaAttendantId == null) continue;
		const nome = caso.mesaAttendant?.nome?.trim();
		if (!nome) {
			registrarFkQuebrada({
				origem: "mesa_handoffs.mesa_attendant_id",
				conversationId: caso.conversationId,
				referencia: caso.mesaAttendantId,
			});
			continue;
		}
		return {
			quem: "humano",
			conversationId: caso.conversationId,
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
			conversationId: semDono.conversationId,
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
