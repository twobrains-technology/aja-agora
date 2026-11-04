// Peças comuns das rotas do playground (D-0056): guarda de ambiente, schemas e
// o detector, sempre no SERVIDOR (a UI só espelha).
import { z } from "zod";
import { requireRole } from "@/lib/admin/require-role";
import { isPlaygroundEnabled } from "@/lib/playground/ambiente";
import { detectarPromessaDeContemplacao } from "@/lib/playground/detector-de-promessa";
import { AGRESSIVIDADES, PROATIVIDADES, TONS } from "@/lib/playground/tipos";

export const atributosSchema = z.object({
	agressividade: z.enum(AGRESSIVIDADES),
	proatividade: z.enum(PROATIVIDADES),
	tecnicidade: z.enum(["leigo", "neutro", "expert"]),
	tom: z.enum(TONS),
});

export const orientacaoSchema = z.string().max(4000, "A orientação passa de 4000 caracteres.");

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
export function barrarPromessa(orientacao: string): Response | null {
	const r = detectarPromessaDeContemplacao(orientacao);
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
