import { z } from "zod";
import { criarPerfil, listarPerfis } from "@/lib/playground/repo";
import {
	atributosSchema,
	barrarPromessa,
	corpoInvalido,
	guarda,
	lerJson,
	orientacaoSchema,
} from "../comum";

const corpoSchema = z.object({
	nome: z.string().trim().min(1, "Dê um nome ao perfil.").max(120),
	atributos: atributosSchema,
	orientacao: orientacaoSchema,
});

export async function GET() {
	const g = await guarda();
	if (g.resposta) return g.resposta;
	const perfis = await listarPerfis();
	return Response.json({
		perfis: perfis.map((p) => ({
			id: p.id,
			nome: p.nome,
			atributos: p.atributos,
			orientacao: p.orientacao,
			versao: p.versao,
		})),
	});
}

export async function POST(req: Request) {
	const g = await guarda();
	if (g.resposta) return g.resposta;
	const lido = await lerJson(req);
	if ("resposta" in lido) return lido.resposta;
	const parsed = corpoSchema.safeParse(lido.corpo);
	if (!parsed.success) return corpoInvalido(parsed.error);
	const barrado = barrarPromessa(parsed.data.orientacao);
	if (barrado) return barrado;

	const perfil = await criarPerfil({ ...parsed.data, salvoPor: g.email });
	return Response.json(
		{
			id: perfil.id,
			nome: perfil.nome,
			atributos: perfil.atributos,
			orientacao: perfil.orientacao,
			versao: perfil.versao,
		},
		{ status: 201 },
	);
}
