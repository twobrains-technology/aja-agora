/** Prévia do diff: conduta viva × conduta resultante do perfil salvo. Não grava nada. */
import { labelDaCaixa, lerCaixa } from "@/lib/agent/box/caixa";
import { aplicarBloco, compilarPerfil } from "@/lib/playground/compilar-perfil";
import { obterPerfil } from "@/lib/playground/repo";
import { guarda, idSchema, naoEncontrado } from "../../../comum";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
	const g = await guarda();
	if (g.resposta) return g.resposta;
	const { id } = await params;
	if (!idSchema.safeParse(id).success) return naoEncontrado();
	const perfil = await obterPerfil(id);
	if (!perfil) return naoEncontrado();

	const label = labelDaCaixa();
	const viva = await lerCaixa({ label, semCache: true });
	const bloco = compilarPerfil(perfil);
	return Response.json({
		label,
		viva: { versao: viva.versao, texto: viva.texto },
		resultante: { texto: aplicarBloco(viva.texto, bloco) },
		bloco,
	});
}
