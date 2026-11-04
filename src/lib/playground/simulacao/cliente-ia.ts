// IA-cliente da simulação (P12). Seam de teste no padrão de jornada-judge.ts.
import { generateObject } from "ai";
import { z } from "zod";
import { createGatewayAnthropic } from "@/lib/llm/gateway-anthropic";
import { perfilPorId } from "./perfis-de-cliente";
import type {
	EstadoDoCliente,
	FalaDoHistorico,
	PedidoDeFalaDoCliente,
	PerfilDeCliente,
	RespostaDeFalaDoCliente,
} from "./tipos";

export const MODELO_DA_IA_CLIENTE = "claude-sonnet-4-6";

type GenerateObjectFn = typeof generateObject;
let generateObjectImpl: GenerateObjectFn = generateObject;

export function __setGenerateObjectDoClienteForTests(fn: GenerateObjectFn | null): void {
	generateObjectImpl = fn ?? generateObject;
}

export const falaDoClienteSchema: z.ZodType<{ texto: string; estado: EstadoDoCliente }> = z.object({
	texto: z.string().min(1).max(2000),
	estado: z.enum(["continua", "objetivo-atingido", "desiste"]),
});

export function montarSystemDoCliente(p: PerfilDeCliente, horaFixa?: string): string {
	const partes = [
		p.persona,
		`Seu objetivo: ${p.objetivo}`,
		'Responda sempre com a próxima fala do cliente em "texto" e o estado em "estado": "continua" (segue conversando), "objetivo-atingido" (você conseguiu o que queria) ou "desiste" (você desistiu da conversa).',
	];
	if (horaFixa) partes.push(`Agora são ${horaFixa} no horário local.`);
	return partes.join("\n\n");
}

export function montarPromptDoCliente(
	_p: PerfilDeCliente,
	h: FalaDoHistorico[],
	turno: number,
): string {
	const linhas = h.map((f) => {
		const cards = f.cards.length > 0 ? ` [cards: ${f.cards.join(", ")}]` : "";
		return `${f.autor === "cliente" ? "Cliente" : "Vendedor"}: ${f.texto}${cards}`;
	});
	return `Conversa até agora (turno ${turno}):\n${linhas.join("\n") || "(vazia)"}\n\nEscreva a próxima fala do cliente.`;
}

export async function gerarFalaDoCliente(
	pedido: PedidoDeFalaDoCliente,
): Promise<RespostaDeFalaDoCliente> {
	const perfil = perfilPorId(pedido.perfilId);
	const anthropic = createGatewayAnthropic();
	const r = await generateObjectImpl({
		model: anthropic(MODELO_DA_IA_CLIENTE),
		schema: falaDoClienteSchema,
		system: montarSystemDoCliente(perfil, pedido.horaFixa),
		prompt: montarPromptDoCliente(perfil, pedido.historico, pedido.turno),
		temperature: 0.7,
	});
	const objeto = falaDoClienteSchema.parse(r.object);
	return { texto: objeto.texto, estado: objeto.estado, origem: "ia" };
}
