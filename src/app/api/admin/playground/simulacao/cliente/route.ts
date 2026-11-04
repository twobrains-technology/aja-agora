// POST /api/admin/playground/simulacao/cliente — próxima fala da IA-cliente.
import { z } from "zod";
import { gerarFalaDoCliente } from "@/lib/playground/simulacao/cliente-ia";
import { IDS_DE_PERFIL, perfilPorId } from "@/lib/playground/simulacao/perfis-de-cliente";
import type { PerfilId } from "@/lib/playground/simulacao/tipos";
import { guardaDaSimulacao } from "../guarda";

export const maxDuration = 60;

const pedidoSchema = z.object({
	perfilId: z.enum(IDS_DE_PERFIL as [PerfilId, ...PerfilId[]]),
	historico: z
		.array(
			z.object({
				autor: z.enum(["cliente", "vendedor"]),
				texto: z.string().max(2000),
				cards: z.array(z.string().max(200)).max(50),
			}),
		)
		.max(60),
	turno: z.number().int().min(0).max(200),
	horaFixa: z
		.string()
		.regex(/^\d{2}:\d{2}$/)
		.optional(),
});

export async function POST(req: Request): Promise<Response> {
	const g = await guardaDaSimulacao();
	if (g.resposta) return g.resposta;

	let corpo: unknown;
	try {
		corpo = await req.json();
	} catch {
		return Response.json({ error: "Corpo da requisição inválido." }, { status: 400 });
	}
	const parsed = pedidoSchema.safeParse(corpo);
	if (!parsed.success) {
		return Response.json(
			{ error: "Corpo da requisição inválido.", detalhes: parsed.error.flatten() },
			{ status: 400 },
		);
	}
	const pedido = parsed.data;

	if (pedido.turno === 0) {
		return Response.json({
			texto: perfilPorId(pedido.perfilId).abertura,
			estado: "continua",
			origem: "semente",
		});
	}
	try {
		return Response.json(await gerarFalaDoCliente(pedido));
	} catch {
		return Response.json({ error: "A IA-cliente falhou." }, { status: 502 });
	}
}
