/**
 * `GET /api/admin/exportacao?from&to`
 *
 * O que a tela precisa ANTES de baixar: quantas linhas cada recorte tem no
 * período e as últimas exportações feitas. É uma leitura separada do download
 * de propósito — contar não deve gerar arquivo nem gravar auditoria.
 */

import { NextResponse } from "next/server";
import { recorteDaRequisicao } from "@/lib/admin/filtro-variante";
import {
	type ModoDoPasso,
	ORDEM_DOS_PASSOS,
	type PassoDoPercurso,
} from "@/lib/admin/percurso-types";
import { periodoDaRequisicao } from "@/lib/admin/periodo-da-requisicao";
import { requireRole } from "@/lib/admin/require-role";
import { contar, TIPOS_DE_EXPORTACAO } from "@/lib/exportacao";
import { listarUltimasExportacoes } from "@/lib/exportacao/historico";

function parsePasso(raw: string | null): PassoDoPercurso | null {
	if (!raw) return null;
	return (ORDEM_DOS_PASSOS as readonly string[]).includes(raw) ? (raw as PassoDoPercurso) : null;
}

export async function GET(request: Request) {
	const { error } = await requireRole("admin");
	if (error) return error;

	const { de, ate } = periodoDaRequisicao(request);

	// O cartão conta o MESMO recorte que o arquivo leva; sem isto o número da
	// tela diria "todos os degraus" enquanto o botão baixasse um só (FIX-383).
	const sp = new URL(request.url).searchParams;
	const modo: ModoDoPasso = sp.get("modo") === "alcancou" ? "alcancou" : "parou";
	// O recorte por braço de experimento (`?ab=…` > cookie `aja_ab` > nenhum), pelo
	// mesmo trilho do período: sem isto o cartão contaria "todas" enquanto o botão
	// baixasse o recorte da tela.
	const recorteDaTela = recorteDaRequisicao(request);
	const recorte = {
		de,
		ate,
		passo: parsePasso(sp.get("passo")),
		modo,
		origem: sp.get("origem"),
		campanha: sp.get("campanha"),
		q: sp.get("q"),
		recorte: recorteDaTela,
	};

	const contagens = {} as Record<(typeof TIPOS_DE_EXPORTACAO)[number], number>;
	for (const tipo of TIPOS_DE_EXPORTACAO) {
		contagens[tipo] = await contar(tipo, recorte);
	}

	const ultimas = await listarUltimasExportacoes();

	return NextResponse.json({ contagens, ultimas });
}
