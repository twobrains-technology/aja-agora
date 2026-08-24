import type { NextRequest } from "next/server";
import { listarPercurso } from "@/lib/admin/percurso-queries";
import {
	type ModoDoPasso,
	ORDEM_DOS_PASSOS,
	type PassoDoPercurso,
} from "@/lib/admin/percurso-types";
import { resolverPeriodo } from "@/lib/admin/periodo";
import { requireRole } from "@/lib/admin/require-role";

const LIMITE_PADRAO = 50;
const LIMITE_MAXIMO = 200;

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
 * Degrau desconhecido vira `null`, não erro 400.
 *
 * O link que traz para cá é montado pelo funil da tela de Performance, e um
 * link velho (de um degrau renomeado, de um favorito antigo) tem que mostrar a
 * lista inteira — nunca uma tela de erro no lugar do relatório. Mesma escolha
 * do `filtro-origem` para chave de canal desconhecida.
 */
function parsePasso(raw: string | null): PassoDoPercurso | null {
	if (!raw) return null;
	return (ORDEM_DOS_PASSOS as readonly string[]).includes(raw) ? (raw as PassoDoPercurso) : null;
}

export async function GET(req: NextRequest) {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	const sp = req.nextUrl.searchParams;

	// Dia inteiro, no fuso do negócio, e HOJE quando não vem nada — a mesma regra
	// que o filtro da tela usa (`periodo.ts`).
	const periodo = resolverPeriodo(sp.get("from"), sp.get("to"));

	if (!periodo) {
		return Response.json(
			{ error: "Formato de data inválido. Use ISO 8601 (ex.: 2026-08-01)." },
			{ status: 400 },
		);
	}

	const { de: from, ate: to } = periodo;

	const modo: ModoDoPasso = sp.get("modo") === "alcancou" ? "alcancou" : "parou";

	const resposta = await listarPercurso({
		from,
		to,
		origem: sp.get("origem"),
		campanha: sp.get("campanha"),
		passo: parsePasso(sp.get("passo")),
		modo,
		q: sp.get("q"),
		limit: parseLimit(sp.get("limit")),
		offset: parseOffset(sp.get("offset")),
	});

	return Response.json(resposta);
}
