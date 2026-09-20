/**
 * `GET /api/admin/exportacao?from&to`
 *
 * O que a tela precisa ANTES de baixar: quantas linhas cada recorte tem no
 * período e as últimas exportações feitas. É uma leitura separada do download
 * de propósito — contar não deve gerar arquivo nem gravar auditoria.
 */

import { NextResponse } from "next/server";
import { periodoDaRequisicao } from "@/lib/admin/periodo-da-requisicao";
import { requireRole } from "@/lib/admin/require-role";
import { contar, TIPOS_DE_EXPORTACAO } from "@/lib/exportacao";
import { listarUltimasExportacoes } from "@/lib/exportacao/historico";

export async function GET(request: Request) {
	const { error } = await requireRole("admin");
	if (error) return error;

	const { de, ate } = periodoDaRequisicao(request);

	const contagens = {} as Record<(typeof TIPOS_DE_EXPORTACAO)[number], number>;
	for (const tipo of TIPOS_DE_EXPORTACAO) {
		contagens[tipo] = await contar(tipo, { de, ate });
	}

	const ultimas = await listarUltimasExportacoes();

	return NextResponse.json({ contagens, ultimas });
}
