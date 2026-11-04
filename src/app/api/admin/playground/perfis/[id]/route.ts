import { z } from "zod";
import {
	atualizarPerfil,
	historicoDoPerfil,
	obterPerfil,
	PerfilVersionConflictError,
} from "@/lib/playground/repo";
import {
	atributosSchema,
	barrarPromessa,
	corpoInvalido,
	guarda,
	idSchema,
	lerJson,
	naoEncontrado,
	orientacaoSchema,
} from "../../comum";

type Ctx = { params: Promise<{ id: string }> };

const corpoSchema = z.object({
	nome: z.string().trim().min(1, "Dê um nome ao perfil.").max(120),
	atributos: atributosSchema,
	orientacao: orientacaoSchema,
	versao: z.number().int().min(1),
});

export async function GET(_req: Request, { params }: Ctx) {
	const g = await guarda();
	if (g.resposta) return g.resposta;
	const { id } = await params;
	if (!idSchema.safeParse(id).success) return naoEncontrado();
	const perfil = await obterPerfil(id);
	if (!perfil) return naoEncontrado();
	const historico = await historicoDoPerfil(id);
	return Response.json({
		id: perfil.id,
		nome: perfil.nome,
		atributos: perfil.atributos,
		orientacao: perfil.orientacao,
		versao: perfil.versao,
		historico: historico.map((h) => ({
			versao: h.versao,
			salvoPor: h.salvoPor,
			criadoEm: h.criadoEm.toISOString(),
			caixaVersao: h.caixaVersao,
		})),
	});
}

export async function PUT(req: Request, { params }: Ctx) {
	const g = await guarda();
	if (g.resposta) return g.resposta;
	const { id } = await params;
	if (!idSchema.safeParse(id).success) return naoEncontrado();
	const lido = await lerJson(req);
	if ("resposta" in lido) return lido.resposta;
	const parsed = corpoSchema.safeParse(lido.corpo);
	if (!parsed.success) return corpoInvalido(parsed.error);
	const barrado = barrarPromessa(parsed.data.orientacao);
	if (barrado) return barrado;

	try {
		const perfil = await atualizarPerfil(id, {
			nome: parsed.data.nome,
			atributos: parsed.data.atributos,
			orientacao: parsed.data.orientacao,
			versaoEsperada: parsed.data.versao,
			salvoPor: g.email,
		});
		if (!perfil) return naoEncontrado();
		return Response.json({
			id: perfil.id,
			nome: perfil.nome,
			atributos: perfil.atributos,
			orientacao: perfil.orientacao,
			versao: perfil.versao,
		});
	} catch (erro) {
		if (erro instanceof PerfilVersionConflictError) {
			return Response.json(
				{ error: "O perfil foi alterado por outra pessoa. Recarregue.", versaoAtual: erro.atual },
				{ status: 409 },
			);
		}
		throw erro;
	}
}
