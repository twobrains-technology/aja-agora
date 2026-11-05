/**
 * Publicar o perfil = gravar uma versão nova da conduta viva (`caixa_de_prompt`):
 * conduta viva + bloco compilado. Label SEMPRE do servidor (lição de 17/10) e
 * texto SEMPRE relido do banco, nunca do corpo.
 */
import { z } from "zod";
import { labelDaCaixa, lerCaixa, publicarCaixa } from "@/lib/agent/box/caixa";
import { espelharCaixaDePrompt } from "@/lib/observability/espelho-prompt";
import { aplicarBloco, compilarConduta, compilarPerfil } from "@/lib/playground/compilar-perfil";
import { ehEnvelope, ler } from "@/lib/playground/orientacao-em-partes";
import { carimbarCaixaVersao, obterPerfil } from "@/lib/playground/repo";
import {
	barrarPromessa,
	corpoInvalido,
	guarda,
	idSchema,
	lerJson,
	naoEncontrado,
} from "../../../comum";

type Ctx = { params: Promise<{ id: string }> };

const corpoSchema = z.object({ confirmar: z.literal(true) });

export async function POST(req: Request, { params }: Ctx) {
	const g = await guarda();
	if (g.resposta) return g.resposta;
	const { id } = await params;
	if (!idSchema.safeParse(id).success) return naoEncontrado();
	const lido = await lerJson(req);
	if ("resposta" in lido) return lido.resposta;
	const parsed = corpoSchema.safeParse(lido.corpo);
	if (!parsed.success) return corpoInvalido(parsed.error);

	const perfil = await obterPerfil(id);
	if (!perfil) return naoEncontrado();
	const barrado = barrarPromessa(perfil.orientacao);
	if (barrado) return barrado;

	const label = labelDaCaixa();
	const viva = await lerCaixa({ label, semCache: true });
	const texto = (
		ehEnvelope(perfil.orientacao)
			? compilarConduta({ ...ler(perfil.orientacao), atributos: perfil.atributos })
			: aplicarBloco(viva.texto, compilarPerfil(perfil))
	).trim();
	if (texto.length < 200) {
		return Response.json(
			{ error: "A conduta resultante tem menos de 200 caracteres." },
			{ status: 400 },
		);
	}

	const { versao } = await publicarCaixa({ texto, label, publicadoPor: g.email });
	await carimbarCaixaVersao(id, perfil.versao, versao);
	// Espelho no Langfuse (B13): nunca derruba a publicação — falha só loga, dentro
	// do módulo. Fire-and-forget: a resposta da publicação não espera o Langfuse.
	void espelharCaixaDePrompt();
	return Response.json({ caixaVersao: versao });
}
