/**
 * FIX-397 — leitura do resultado do teste A/B do telefone para o dono.
 *
 * No dia 01/10 é daqui que sai "qual caminho foi melhor": por variante, quantas
 * visitas caíram nela, quantas deixaram telefone e quantas chegaram à
 * comparação. Sem dado de um lado, a resposta é **"não calculável"** — nunca
 * zero (ver `resultado-do-teste-do-telefone.ts`).
 *
 * Só LEITURA, e para ADMIN, VIEWER e ATTENDANT — o mesmo trio da rota irmã
 * `/api/admin/performance` (o código manda; este comentário estava atrás dele).
 * Nada aqui dispara evento para a Meta: é consulta ao que já está no banco.
 *
 * A tela que lê isto é o card `teste-do-telefone.tsx`, montado em
 * `/admin/performance` com o mesmo `from`/`to` do resto da página. Este endpoint
 * continua sendo só o dado.
 */

import { periodoDaRequisicao } from "@/lib/admin/periodo-da-requisicao";
import { requireRole } from "@/lib/admin/require-role";
import {
	resultadoDoTesteDoTelefone,
	totalDoTesteDoTelefone,
} from "@/lib/chat/resultado-do-teste-do-telefone";

export async function GET(request: Request) {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	const { de, ate } = periodoDaRequisicao(request);
	const variantes = await resultadoDoTesteDoTelefone(de, ate);

	return Response.json({
		periodo: { de: de.toISOString(), ate: ate.toISOString() },
		variantes,
		total: totalDoTesteDoTelefone(variantes),
		/** Repetido no corpo de propósito: quem lê a resposta do dia 01/10
		 *  precisa da régua junto do número, não num ADR distante. */
		regra:
			"sem dado em uma variante = não calculável (null), nunca zero. Meta: ≥30 leads por variante.",
	});
}
