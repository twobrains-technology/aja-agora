import type { NextRequest } from "next/server";
import { reentrarEmLote } from "@/lib/admin/remarketing-reentrada";
import { requireRole } from "@/lib/admin/require-role";

/**
 * A REENTRADA DO BOLO PARADO — a porta de admin da decisão pura.
 *
 * É a ação que a janela de entrada de 7 dias não deixa acontecer sozinha: a
 * cliente quer retomar o bolo de conversas paradas, e a reentrada é
 * **deliberada e em lote** (decisão do dono, 28/09). O ciclo continua respeitando
 * os 7 dias; quem afrouxa a janela é esta rota, por decisão de gente.
 *
 * GET  → preview: quantas vão entrar e por que o resto fica de fora (não escreve).
 * POST → executa e devolve quantas entraram de fato.
 *
 * `viewer` NÃO entra no POST: o papel é leitura no painel, e reentrar muda o que
 * o cliente recebe — mesmo critério de segurar/soltar. O GET (preview) aceita
 * `viewer`, porque não escreve nada.
 */
export async function GET(_req: NextRequest) {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	try {
		const preview = await reentrarEmLote({
			agora: new Date(),
			por: "—",
			porId: "—",
			dryRun: true,
		});
		return Response.json(preview);
	} catch (err) {
		console.error(
			JSON.stringify({
				level: "error",
				source: "admin-remarketing-reentrada",
				etapa: "preview",
				error: err instanceof Error ? err.message : String(err),
			}),
		);
		return Response.json(
			{ error: "Não consegui calcular a reentrada agora. Tente de novo em instantes." },
			{ status: 500 },
		);
	}
}

export async function POST(_req: NextRequest) {
	const { error, session } = await requireRole("admin", "attendant");
	if (error) return error;

	const agora = new Date();
	const por = session.user.name ?? session.user.email ?? "—";

	try {
		const resultado = await reentrarEmLote({
			agora,
			por,
			porId: session.user.id,
			dryRun: false,
		});

		console.log(
			JSON.stringify({
				level: "info",
				source: "admin-remarketing-reentrada",
				acao: "reentrada",
				entraram: resultado.entram,
				avaliadas: resultado.avaliadas,
				por: session.user.id,
			}),
		);

		return Response.json(resultado);
	} catch (err) {
		console.error(
			JSON.stringify({
				level: "error",
				source: "admin-remarketing-reentrada",
				etapa: "execucao",
				error: err instanceof Error ? err.message : String(err),
			}),
		);
		return Response.json(
			{ error: "Não consegui reentrar as conversas agora. Tente de novo em instantes." },
			{ status: 500 },
		);
	}
}
