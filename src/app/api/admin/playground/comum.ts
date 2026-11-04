// Peças comuns das rotas do playground (D-0056): guarda de ambiente, schemas e
// o detector, sempre no SERVIDOR (a UI só espelha).
import { z } from "zod";
import type { ProposalGateway } from "@/lib/adapters/proposal-gateway";
import type { GroupSummary } from "@/lib/adapters/types";
import { requireRole } from "@/lib/admin/require-role";
import { type DepsDasToolsLivres, simularCotaDaCarta } from "@/lib/agent/pi/tools-livres";
import { PARTES_PADRAO } from "@/lib/agent/prompt-do-vendedor";
import { isPlaygroundEnabled } from "@/lib/playground/ambiente";
import { detectarPromessaDeContemplacao } from "@/lib/playground/detector-de-promessa";
import type { fixtureDiscoveryAdapter } from "@/lib/playground/dubles/fixture-discovery-adapter";
import { ler } from "@/lib/playground/orientacao-em-partes";
import {
	AGRESSIVIDADES,
	CONTATOS_DO_PRESET,
	type ParteId,
	PROATIVIDADES,
	TONS,
} from "@/lib/playground/tipos";

export const atributosSchema = z.object({
	agressividade: z.enum(AGRESSIVIDADES),
	proatividade: z.enum(PROATIVIDADES),
	tecnicidade: z.enum(["leigo", "neutro", "expert"]),
	tom: z.enum(TONS),
});

// 40 000: o envelope JSON das 7 partes (D-0078, Q10) cabe no campo `orientacao`.
export const orientacaoSchema = z.string().max(40000, "A orientação passa de 40000 caracteres.");

export const fonteDeDadosSchema = z.enum(["duble", "bevi-dev"]);
export type FonteDeDados = z.infer<typeof fonteDeDadosSchema>;
export const contatoSchema = z.enum(CONTATOS_DO_PRESET);
export const partesSchema = z.record(
	z.enum(Object.keys(PARTES_PADRAO) as [ParteId, ...ParteId[]]),
	z.string().max(8000),
);
/** Validado e guardado; a ligação à fila é do líder depois do merge de F2 (Q6). */
export const dublesDaFilaSchema = z.object({
	atendentes: z.number().int().min(0),
	horaFixa: z.string().optional(),
});

/**
 * Texto que o detector examina: o `livre` e cada parte que DIFERE do padrão.
 * O texto padrão diz "nunca prometa data de contemplação" e seria acusado (Q3).
 */
export function textoParaDetector(
	orientacao: string,
	partes?: Partial<Record<ParteId, string>>,
): string {
	const lida = ler(orientacao);
	const todas = { ...lida.partes, ...partes };
	const editadas = (Object.keys(todas) as ParteId[])
		.filter((id) => todas[id] !== undefined && todas[id] !== PARTES_PADRAO[id])
		.map((id) => todas[id] as string);
	return [lida.livre, ...editadas].join("\n\n");
}

export interface DublesDaConversa {
	adapter: ReturnType<typeof fixtureDiscoveryAdapter>;
	gateway: ProposalGateway;
	grupos: Map<string, GroupSummary>;
}

/** Q8: `bevi-dev` usa busca e simulação reais; a proposta segue dublê. */
export function depsDaFonte(
	fonte: FonteDeDados,
	d: DublesDaConversa,
): {
	busca?: DepsDasToolsLivres["buscarGrupos"];
	simularCota?: DepsDasToolsLivres["simularCota"];
	gateway: ProposalGateway;
} {
	if (fonte === "bevi-dev") return { gateway: d.gateway };
	return {
		busca: async (params) => {
			const grupos = await d.adapter.searchGroups(params);
			for (const gr of grupos) d.grupos.set(gr.id, gr);
			return grupos;
		},
		simularCota: (params) =>
			simularCotaDaCarta({ adapter: d.adapter, params, grupo: d.grupos.get(params.groupId) }),
		gateway: d.gateway,
	};
}

export function naoEncontrado(): Response {
	return new Response("Not Found", { status: 404 });
}

/** 404 fora de dev; depois, admin. Devolve `resposta` pronta quando barra. */
export async function guarda(): Promise<
	{ resposta: Response; email: null } | { resposta: null; email: string | null }
> {
	if (!isPlaygroundEnabled()) return { resposta: naoEncontrado(), email: null };
	const { error, session } = await requireRole("admin");
	if (error) return { resposta: error, email: null };
	return { resposta: null, email: session.user.email ?? null };
}

/** Devolve a resposta 422 se a orientação promete contemplação; senão `null`. */
export function barrarPromessa(
	orientacao: string,
	partes?: Partial<Record<ParteId, string>>,
): Response | null {
	const r = detectarPromessaDeContemplacao(textoParaDetector(orientacao, partes));
	if (r.ok) return null;
	return Response.json(
		{ error: `Orientação recusada: ${r.motivo}`, motivo: r.motivo },
		{ status: 422 },
	);
}

export async function lerJson(req: Request): Promise<{ corpo: unknown } | { resposta: Response }> {
	try {
		return { corpo: await req.json() };
	} catch {
		return { resposta: Response.json({ error: "Corpo da requisição inválido." }, { status: 400 }) };
	}
}

export function corpoInvalido(erro: z.ZodError): Response {
	return Response.json(
		{ error: "Corpo da requisição inválido.", detalhes: erro.flatten() },
		{ status: 400 },
	);
}

export const idSchema = z.string().uuid();
