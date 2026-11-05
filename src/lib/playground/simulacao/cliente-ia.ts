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

/**
 * O modelo da IA-cliente da simulação (P12), com override opcional por env,
 * mesmo padrão de `modeloDoAgente` (model-provider.ts): `?.trim() ||` de
 * propósito, porque o compose materializa `${AI_CLIENT_MODEL:-}` como string
 * VAZIA e `??` não cairia no default.
 */
export function modeloDaIaCliente(): string {
	return process.env.AI_CLIENT_MODEL?.trim() || MODELO_DA_IA_CLIENTE;
}

type GenerateObjectFn = typeof generateObject;
let generateObjectImpl: GenerateObjectFn = generateObject;

export function __setGenerateObjectDoClienteForTests(fn: GenerateObjectFn | null): void {
	generateObjectImpl = fn ?? generateObject;
}

/** Tolerância no schema: estado fora do enum vira "continua"; a fala importa é o texto (P12).
 *  O texto vazio segue reprovando: sem fala não há turno. */
export const falaDoClienteSchema: z.ZodType<{ texto: string; estado: EstadoDoCliente }> = z.object({
	texto: z.string().min(1).max(2000),
	estado: z.preprocess(
		(v) => (v === "objetivo-atingido" || v === "desiste" ? v : "continua"),
		z.enum(["continua", "objetivo-atingido", "desiste"]),
	),
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

/** Uma repetição com o erro no prompt: rota do gateway pode falhar (502 no modelo local,
 *  strata-mac). Depois das duas tentativas, o erro sobe ao chamador (erro-do-cliente). */
const MAX_TENTATIVAS = 2;
const cortoErro = (e: unknown): string => String(e instanceof Error ? e.message : e).slice(0, 200);

export async function gerarFalaDoCliente(
	pedido: PedidoDeFalaDoCliente,
): Promise<RespostaDeFalaDoCliente> {
	const perfil = perfilPorId(pedido.perfilId);
	const anthropic = createGatewayAnthropic();
	let erroAnterior = "";
	let ultimoErro: unknown;
	for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
		const base = montarPromptDoCliente(perfil, pedido.historico, pedido.turno);
		const prompt = erroAnterior
			? `${base}\n\nA tentativa anterior falhou com o erro: ${erroAnterior}. Responda de novo, no formato pedido.`
			: base;
		try {
			const r = await generateObjectImpl({
				model: anthropic(modeloDaIaCliente()),
				schema: falaDoClienteSchema,
				system: montarSystemDoCliente(perfil, pedido.horaFixa),
				prompt,
				// `temperature` saiu: o upstream Anthropic passou a rejeitá-la ("temperature is
				// deprecated for this model") e derrubava a rota inteira da IA-cliente (502).
			});
			const objeto = falaDoClienteSchema.parse(r.object);
			return { texto: objeto.texto, estado: objeto.estado, origem: "ia" };
		} catch (e) {
			ultimoErro = e;
			erroAnterior = cortoErro(e);
		}
	}
	throw ultimoErro;
}
