import type { NextRequest } from "next/server";
import { listarPercurso } from "@/lib/admin/percurso-queries";
import {
	type ModoDoPasso,
	ORDEM_DOS_PASSOS,
	type PassoDoPercurso,
} from "@/lib/admin/percurso-types";
import { periodoDaRequisicao } from "@/lib/admin/periodo-da-requisicao";
import { type AvaliacaoDaRegua, avaliarReguaPorIds } from "@/lib/admin/regua-por-conversa";
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

/** O estado da régua que a tabela mostra por linha (AJA-09). */
function reguaDaPessoa(
	avaliacao: AvaliacaoDaRegua | undefined,
	conversationId: string | null,
): {
	naRegua: boolean;
	motivo: string | null;
	status: string | null;
	step: number | null;
	nextTouchAt: string | null;
} {
	if (!conversationId) {
		// Sem conversa não há como entrar na régua: o fato é "sem contato".
		return { naRegua: false, motivo: "sem_contato", status: null, step: null, nextTouchAt: null };
	}
	if (!avaliacao) {
		return { naRegua: false, motivo: null, status: null, step: null, nextTouchAt: null };
	}
	return {
		naRegua: avaliacao.regua !== null,
		motivo: avaliacao.motivo,
		status: avaliacao.regua?.status ?? null,
		step: avaliacao.regua?.step ?? null,
		nextTouchAt: avaliacao.regua?.nextTouchAt?.toISOString() ?? null,
	};
}

export async function GET(req: NextRequest) {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	const sp = req.nextUrl.searchParams;

	// Dia inteiro, no fuso do negócio, com a precedência URL > cookie > hoje — a
	// mesma regra que o filtro da tela usa, resolvida num lugar só.
	const { de: from, ate: to } = periodoDaRequisicao(req);

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

	// A coluna "Régua" (AJA-09) é resolvida por ids, numa consulta só — a query
	// de `percurso-queries` é de outro bloco e não pode ganhar a coluna. O
	// motivo sai do MESMO dicionário da lista de Conversas.
	const ids = resposta.pessoas
		.map((p) => p.conversationId)
		.filter((id): id is string => Boolean(id));
	const avaliacoes = await avaliarReguaPorIds(ids, new Date());

	const pessoas = resposta.pessoas.map((p) => ({
		...p,
		telefoneMascarado: p.conversationId
			? (avaliacoes.get(p.conversationId)?.telefoneMascarado ?? null)
			: null,
		regua: reguaDaPessoa(
			p.conversationId ? avaliacoes.get(p.conversationId) : undefined,
			p.conversationId,
		),
	}));

	return Response.json({ ...resposta, pessoas });
}
