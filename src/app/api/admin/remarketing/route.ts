import type { NextRequest } from "next/server";
import { periodoDaRequisicao } from "@/lib/admin/periodo-da-requisicao";
import {
	contarElegiveisParaRegua,
	contarLinhasDaRegua,
	listarReguas,
} from "@/lib/admin/remarketing-queries";
import {
	contadoresDe,
	estadoHonestoDaRegua,
	filtrarPorSituacao,
	insightsDaRegua,
	linhasDaTela,
	type RespostaDaRegua,
	situacaoDoParametro,
} from "@/lib/admin/remarketing-tela";
import { requireRole } from "@/lib/admin/require-role";

const LIMITE_PADRAO = 50;
const LIMITE_MAXIMO = 200;

const OBJETIVOS = ["carro", "moto", "imovel"] as const;

function parseLimit(raw: string | null): number {
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0) return LIMITE_PADRAO;
	return Math.min(Math.floor(n), LIMITE_MAXIMO);
}

function parseOffset(raw: string | null): number {
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 0) return 0;
	return Math.floor(n);
}

/**
 * Objetivo desconhecido vira `null` (todos), não `carro`.
 *
 * A diferença importa: `objetivoCanonico` mapeia desconhecido para `carro` — o
 * eixo mais frequente — de propósito, porque lá é o motor escolhendo a arte de
 * um toque que já vai sair. Aqui é um FILTRO de tela: transformar um valor
 * inválido em "carro" mostraria um recorte silencioso, e quem clicasse num link
 * velho acharia que só existem carros na régua. Link quebrado mostra tudo.
 */
function parseObjetivo(raw: string | null): string | null {
	if (!raw) return null;
	return (OBJETIVOS as readonly string[]).includes(raw) ? raw : null;
}

export async function GET(req: NextRequest) {
	// `viewer` entra: a tela é leitura. Quem escreve (segurar/soltar) é a rota da
	// conversa, que exige `admin` ou `attendant`.
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	const sp = req.nextUrl.searchParams;
	// O período da PESSOA (URL > cookie > hoje), resolvido uma vez — a mesma
	// regra que o filtro da tela escreve.
	const { de, ate } = periodoDaRequisicao(req);

	const situacao = situacaoDoParametro(sp.get("situacao"));
	const objetivo = parseObjetivo(sp.get("objetivo"));
	const limit = parseLimit(sp.get("limit"));
	const offset = parseOffset(sp.get("offset"));
	const agora = new Date();

	try {
		// Uma leitura para os dois: os contadores do topo são do RECORTE inteiro
		// (contar depois do filtro de situação zeraria os outros cartões) e a
		// página é o filtro aplicado sobre a mesma lista.
		//
		// Os insights vêm das MESMAS linhas — nenhuma consulta nova de funil. As
		// duas leituras que não dependem do recorte são o histórico total (para
		// separar "régua desligada" de "sem toque no período") e a fila de
		// elegíveis de agora (o número que a tela mostra enquanto não há dado).
		const [doRecorte, totalNoHistorico, elegiveisAgora] = await Promise.all([
			listarReguas({ de, ate, objetivo }),
			contarLinhasDaRegua(),
			contarElegiveisParaRegua(agora),
		]);
		const visiveis = filtrarPorSituacao(doRecorte, situacao);

		const resposta: RespostaDaRegua = {
			linhas: linhasDaTela(visiveis.slice(offset, offset + limit), agora),
			contadores: contadoresDe(doRecorte),
			total: visiveis.length,
			totalDoRecorte: doRecorte.length,
			periodo: { de: de.toISOString(), ate: ate.toISOString() },
			insights: insightsDaRegua(doRecorte),
			estado: estadoHonestoDaRegua({
				totalNoHistorico,
				linhasNoPeriodo: doRecorte.length,
				elegiveisAgora,
			}),
		};
		return Response.json(resposta);
	} catch (err) {
		// Falha de consulta NÃO vira contador zerado: a tela mostra o erro e não
		// exibe número nenhum (dizer "0 na régua" com o banco fora do ar é o pior
		// desfecho possível para quem decide operação por esta tela).
		console.error(
			JSON.stringify({
				level: "error",
				source: "admin-remarketing",
				etapa: "leitura",
				error: err instanceof Error ? err.message : String(err),
			}),
		);
		return Response.json(
			{ error: "Não consegui ler a régua agora. Tente de novo em instantes." },
			{ status: 500 },
		);
	}
}
