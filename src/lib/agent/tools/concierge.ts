/**
 * Tools available to the concierge layer (and ONLY the concierge).
 * Specialists do NOT see these tools — they have consorcioTools instead.
 *
 * route_to_specialist is intercepted by the WhatsApp processor when the
 * concierge calls it: instead of feeding the result back to the model,
 * the processor halts the AI loop and dispatches transitionToSpecialist.
 * The tool body returns a placeholder string just so the model has a valid
 * tool result if anything reaches it.
 */
import { tool } from "ai";
import { z } from "zod";

/** Name used by the processor to detect the routing intent in tool-call events. */
export const ROUTE_TO_SPECIALIST_TOOL_NAME = "route_to_specialist";

const routeInputSchema = z.object({
	category: z
		.enum(["imovel", "auto", "servicos"])
		.describe(
			"Categoria de consorcio detectada na mensagem do usuario. imovel = apto/casa/terreno/comercial. auto = carro/moto/veiculo. servicos = reforma/viagem/formatura/saude/qualquer outro.",
		),
});

export type RouteToSpecialistInput = z.infer<typeof routeInputSchema>;

export const conciergeTools = {
	[ROUTE_TO_SPECIALIST_TOOL_NAME]: tool({
		description:
			"Encaminha o usuario pro especialista da categoria correta. Use APENAS quando a categoria estiver clara na mensagem (ex: 'quero um apto', 'to pensando num carro', 'preciso de uma reforma'). Em duvida, NAO chame esta ferramenta — deixe o usuario clicar no botao.",
		inputSchema: routeInputSchema,
		execute: async (args: RouteToSpecialistInput) => {
			return `[encaminhado para especialista de ${args.category}]`;
		},
	}),
};

/** Set of tool names produced by the concierge layer (for fast lookup in route handlers). */
export const CONCIERGE_TOOLS = new Set<string>([ROUTE_TO_SPECIALIST_TOOL_NAME]);
