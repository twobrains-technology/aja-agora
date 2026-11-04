// A TOOL DE HANDOFF DO VENDEDOR — `falar_com_humano`, separada de `tools-livres.ts`.
import { tool } from "ai";
import { z } from "zod";
import { abrirCasoNaMesa, clientePedeHumano, nomeDitoNaConversa } from "@/lib/agent/pi/handoff";
import { type ContextoDasTools, garantirLeadDoFecho } from "@/lib/agent/pi/tools-livres";
import { loadIdentity } from "@/lib/conversation/identity";
import { loadConversationHistory } from "@/lib/conversation/messages";
import { saveContactName } from "@/lib/leads/contact-capture";
import { normalizePhoneBR } from "@/lib/leads/phone";
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

export function criarToolsHumano(ctx: ContextoDasTools) {
	const falar_com_humano = tool({
		description:
			"Abre o caso na mesa. Use quando o cliente pedir para falar com uma pessoa, estiver insatisfeito, ou o assunto fugir do que você resolve. Não prometa prazo nem 'está a caminho': avise em uma linha que o caso foi aberto.",
		inputSchema: z.object({
			motivo: z.string().min(3).describe("Por que está chamando o especialista"),
		}),
		execute: async ({ motivo }) => {
			// O GATE DA MESA (P5/P7): o caso só abre quando o CLIENTE pede uma pessoa. Falha de
			// ferramenta, objeção ("e se eu não for contemplado"), dúvida de taxa ou conversa
			// difícil são trabalho do vendedor — mandar para a mesa é desistir da venda. O modelo
			// continua dono de COMO conduzir; o que não é dele é decidir que a conversa acabou.
			const pediuAgora = clientePedeHumano(ctx.userText);
			// O histórico serve a DUAS coisas: o pedido de pessoa num turno anterior e o nome
			// que o cliente disse antes (o caso da mesa vai com o contato — ver abaixo).
			const historico = await loadConversationHistory(ctx.conversationId).catch(() => []);
			const pediuAntes =
				pediuAgora ||
				historico
					.filter((m) => m.role === "user")
					.slice(-8)
					.some((m) => clientePedeHumano(m.content));
			if (!pediuAntes) {
				return "Caso NÃO aberto: o cliente não pediu para falar com uma pessoa, e passar o atendimento para a mesa no meio da venda é desistir dele. Siga você: responda o que ele perguntou, resolva o que falhou (se uma ferramenta falhou, diga em UMA frase e tente de novo) e leve para o próximo passo da compra.";
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
