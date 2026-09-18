/**
 * `GET /api/admin/exportacao/<tipo>?from&to&formato&completo`
 *
 * Só `admin`. Devolve o arquivo do recorte (CSV ou JSON) e **registra a
 * exportação** na tabela `exportacoes` — a auditoria de LGPD que responde quem
 * levou o quê. Sem esse registro, o switch "Incluir dado pessoal completo"
 * seria uma decisão sem consequência.
 *
 * O período é o da PESSOA (`periodoDaRequisicao`: URL > cookie > hoje), não um
 * filtro próprio desta rota: a exportação é o recorte da tela, e uma janela
 * resolvida aqui por conta própria voltaria a quebrar o período compartilhado.
 *
 * O arquivo NÃO é materializado em disco: as linhas vêm do módulo puro e vão
 * direto para o corpo da resposta. O lote de validação (22/09) usa o MESMO
 * módulo por script — duas implementações discordariam no primeiro campo.
 */

import { NextResponse } from "next/server";
import { diaDoNegocio } from "@/lib/admin/periodo";
import { periodoDaRequisicao } from "@/lib/admin/periodo-da-requisicao";
import { requireRole } from "@/lib/admin/require-role";
import { ehTipoExportacao, exportar, gerar } from "@/lib/exportacao";
import { registrarExportacao } from "@/lib/exportacao/historico";

export async function GET(request: Request, { params }: { params: Promise<{ tipo: string }> }) {
	const { error, session } = await requireRole("admin");
	if (error) return error;

	const { tipo } = await params;
	if (!ehTipoExportacao(tipo)) {
		return NextResponse.json({ error: "Tipo de exportação desconhecido." }, { status: 404 });
	}

	const { de, ate } = periodoDaRequisicao(request);

	const formato = new URL(request.url).searchParams.get("formato") === "json" ? "json" : "csv";
	const completo = ["1", "true", "sim"].includes(
		(new URL(request.url).searchParams.get("completo") ?? "").toLowerCase(),
	);
	const mascarado = !completo;

	const linhas = await exportar(tipo, { de, ate, mascarar: mascarado });
	const corpo = gerar(formato, linhas);

	await registrarExportacao({
		tipo,
		formato,
		de,
		ate,
		mascarado,
		linhas: linhas.length,
		usuarioId: session.user.id ?? null,
		usuarioEmail: session.user.email ?? null,
	});

	const extensao = formato === "json" ? "json" : "csv";
	const tipoDoConteudo =
		formato === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8";
	const nome = `aja-${tipo}-${diaDoNegocio(de)}-${diaDoNegocio(ate)}.${extensao}`;

	// Streaming explícito: o arquivo é montado no servidor, mas não passa por
	// buffer de Node nem por disco.
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(corpo));
			controller.close();
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": tipoDoConteudo,
			"Content-Disposition": `attachment; filename="${nome}"`,
		},
	});
}
