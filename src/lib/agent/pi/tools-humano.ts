// A TOOL DE HANDOFF DO VENDEDOR — `falar_com_humano`, separada de `tools-livres.ts`.
import { tool } from "ai";
import { z } from "zod";
import { abrirCasoNaMesa, nomeDitoNaConversa } from "@/lib/agent/pi/handoff";
import { clientePedeFechar, decidirRota } from "@/lib/agent/pi/rota-do-humano";
import { type ContextoDasTools, garantirLeadDoFecho } from "@/lib/agent/pi/tools-livres";
import { getLatestBeviProposal } from "@/lib/bevi/proposal-repo";
import { loadIdentity } from "@/lib/conversation/identity";
import { loadConversationHistory } from "@/lib/conversation/messages";
import { saveContactName } from "@/lib/leads/contact-capture";
import { normalizePhoneBR } from "@/lib/leads/phone";
import { type FilaDeVendedores, filaDeVendedoresReal } from "@/lib/whatsapp/proxy";
import { isSimulatedWaId } from "@/lib/whatsapp/simulator-bus";

/** O TELEFONE do lead desta conversa, para o caso da mesa.
 *
 * O cliente não digita de novo o que o canal já entregou: a fonte é a identidade que ele
 * deu na conversa (`loadIdentity` → celular) e, sem ela, o `waId` quando é número (no
 * WhatsApp é o próprio telefone da conversa; na web é o que o card de WhatsApp gravou).
 * `SIM-<uuid>` não é telefone — conversa de teste não vira lead por um número inventado.
 *
 * Só o telefone: o CPF não sai daqui. A mesa recebe nome e telefone, não CPF.
 */
async function telefoneDoCasoNaMesa(ctx: ContextoDasTools): Promise<string | null> {
	const identidade = await loadIdentity(ctx.conversationId).catch(() => null);
	const doCanal = ctx.waId && !isSimulatedWaId(ctx.waId) ? ctx.waId : null;
	const celular = identidade?.celular || doCanal;
	return celular ? normalizePhoneBR(celular) : null;
}

export type DepsHumano = { filaDeVendedores?: FilaDeVendedores };

const depsPorContexto = new WeakMap<ContextoDasTools, DepsHumano>();
const filaChamadaPorContexto = new WeakMap<ContextoDasTools, Date>();

/** Injeta as dependências da tool no contexto do turno (o `buildToolsLivres` não as repassa). */
export function definirDepsHumano(ctx: ContextoDasTools, deps: DepsHumano): void {
	depsPorContexto.set(ctx, deps);
}

/** Quando a fila foi chamada NESTE turno (ou null): o turno regrava o marcador depois do `persistMeta`. */
export function filaChamadaNoTurno(ctx: ContextoDasTools): Date | null {
	return filaChamadaPorContexto.get(ctx) ?? null;
}

const SIGA_CONDUZINDO =
	"continue conduzindo a conversa com o cliente; se ninguém assumir, acalme sem inventar horário nem prazo.";

export function criarToolsHumano(ctx: ContextoDasTools, deps: DepsHumano = {}) {
	const falar_com_humano = tool({
		description:
			"Chama uma pessoa. O servidor decide onde cai: antes da proposta, chama a fila de vendedores (todos os ativos recebem o aviso, quem pegar primeiro atende) e você segue conduzindo; com proposta gerada ou pedido de fechar, abre o caso na mesa e você para. Use quando o cliente pedir uma pessoa, a venda estiver para se perder ou na hora de transferir. Não prometa prazo nem 'está a caminho'.",
		inputSchema: z.object({
			motivo: z.string().min(3).describe("Por que está chamando o especialista"),
		}),
		execute: async ({ motivo }) => {
			// A ROTA É DO SERVIDOR (P5/P8): proposta gerada ou pedido de fechar → mesa; o resto → fila
			// de vendedores, e o agente segue conduzindo. O histórico serve também ao nome dito antes.
			const historico = await loadConversationHistory(ctx.conversationId).catch(() => []);
			// Só conta linha com oferta real: a tentativa com carta indisponível grava a linha sem oferta.
			const temProposta =
				((await getLatestBeviProposal(ctx.conversationId).catch(() => null))?.ofertaId ?? null) !=
				null;
			const pediuFechar =
				clientePedeFechar(ctx.userText) ||
				historico
					.filter((m) => m.role === "user")
					.slice(-8)
					.some((m) => clientePedeFechar(m.content));
			if (decidirRota({ temProposta, pediuFechar }) === "fila") {
				const fila =
					deps.filaDeVendedores ??
					depsPorContexto.get(ctx)?.filaDeVendedores ??
					filaDeVendedoresReal;
				try {
					const r = await fila.chamar({
						conversationId: ctx.conversationId,
						userName: ctx.nomeDoCliente ?? "Cliente",
						userWaId: ctx.waId ?? "",
						summary: motivo,
					});
					filaChamadaPorContexto.set(ctx, new Date());
					return `Fila de vendedores chamada (${r.notificados} avisados). Sem prazo prometido: ${SIGA_CONDUZINDO}`;
				} catch {
					return `Não consegui avisar a fila agora. Sem prazo prometido: ${SIGA_CONDUZINDO}`;
				}
			}
			ctx.pediuHumano = true;
			// O CONTATO VAI JUNTO COM O CASO. `mesa_handoffs` guarda só o `leadId`: o nome e o
			// telefone que o atendente lê no dossiê saem do LEAD. Sem gravar no lead, o caso
			// chega anônimo na mesa — foi o defeito da call de 18:36 (*"a transferência perde
			// nome e telefone do lead"*). O nome vem do que o cliente DISSE (contexto, fala do
			// turno ou turno anterior), o telefone da identidade/canal já capturados. O CPF
			// NÃO entra: a mesa recebe nome e telefone, não CPF.
			const dito = nomeDitoNaConversa({ falaDoTurno: ctx.userText, historico });
			const nome = ctx.nomeDoCliente ?? dito?.nome ?? null;
			if (nome && !ctx.nomeDoCliente) {
				const gravado = await saveContactName(ctx.conversationId, nome, {
					ancorarEm: dito?.fala ?? ctx.userText,
				});
				if (gravado.ok) ctx.nomeDoCliente = gravado.name;
			}
			const telefone = await telefoneDoCasoNaMesa(ctx);
			if (telefone) {
				// O MESMO caminho do fecho: lead da conversa com telefone, criado se faltar.
				await garantirLeadDoFecho({ conversationId: ctx.conversationId, celular: telefone, nome });
			}
			const caso = await abrirCasoNaMesa({
				conversationId: ctx.conversationId,
				nome,
				motivo,
			});
			if (!caso.ok) {
				return "Caso NÃO aberto: falta o nome do cliente. Capture o nome em uma linha, sem prometer especialista.";
			}
			ctx.casoAbertoNesteTurno?.();
			return `Caso aberto na mesa${caso.handoffId ? ` (id ${caso.handoffId})` : ""}. Avise em UMA linha, sem prometer prazo, e pare de responder nesta conversa — a mesa assume.`;
		},
	});

	return { falar_com_humano };
}
