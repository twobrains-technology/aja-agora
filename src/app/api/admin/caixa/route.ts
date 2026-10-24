/**
 * A conduta do vendedor pela porta HTTP — leitura do que está no ar e publicação
 * de versão nova.
 *
 * Até 23/10 o único caminho para publicar era
 * `pnpm exec tsx scripts/publicar-prompt-do-vendedor.ts` na máquina do Kairo: a
 * dona do produto não conseguia ler nem escrever a conduta do próprio vendedor.
 *
 * `GET` devolve a versão VIVA (a que o turno usa agora) e o histórico da label do
 * ambiente — com o texto de cada versão, porque a tela mostra a versão escolhida
 * e o diff dela com a vigente. `POST` publica: cria uma versão nova, nunca edita.
 *
 * Não há `PUT` nem `DELETE`: versão publicada não se altera nem se apaga. Desfazer
 * é publicar o texto antigo de novo — o histórico é a auditoria.
 *
 * A LABEL É SEMPRE A DO SERVIDOR. Aceitar label no corpo é o acidente de 17/10:
 * a label do prompt era compartilhada e publicar para testar em dev mudou a
 * conduta de produção, com três versões publicadas e revertidas.
 */

import { z } from "zod";
import { requireRole } from "@/lib/admin/require-role";
import {
	labelDaCaixa,
	lerCaixa,
	listarVersoes,
	NOME_DA_CAIXA,
	publicarCaixa,
} from "@/lib/agent/box/caixa";

/** Quantas versões a resposta carrega. Conduta é texto longo: 20 versões já é
 * histórico suficiente para a tela e não pesa na resposta. */
const MAX_VERSOES = 20;

const corpoSchema = z.object({
	texto: z
		.string()
		.trim()
		.min(
			200,
			"A conduta precisa de pelo menos 200 caracteres — o modelo recebe este texto inteiro como instrução do vendedor.",
		),
});

export async function GET() {
	const { error } = await requireRole("admin");
	if (error) return error;

	const label = labelDaCaixa();

	try {
		const viva = await lerCaixa({ label });
		const historico = await listarVersoes(NOME_DA_CAIXA, label);

		return Response.json({
			label,
			vivo: {
				versao: viva.versao,
				texto: viva.texto,
				origem: viva.origem,
				// A versão do código não tem data de publicação; a do banco tem.
				criadoEm: historico.find((v) => v.versao === viva.versao)?.criadoEm.toISOString() ?? null,
			},
			historico: historico.slice(0, MAX_VERSOES),
		});
	} catch (err) {
		console.error("[admin/caixa GET]", err);
		return Response.json({ error: "Não foi possível ler a conduta do vendedor." }, { status: 500 });
	}
}

export async function POST(req: Request) {
	const { error, session } = await requireRole("admin");
	if (error) return error;

	let corpo: unknown;
	try {
		corpo = await req.json();
	} catch {
		return Response.json({ error: "Corpo da requisição inválido." }, { status: 400 });
	}

	const parsed = corpoSchema.safeParse(corpo);
	if (!parsed.success) {
		return Response.json(
			{ error: "Corpo da requisição inválido.", detalhes: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	try {
		const { versao, label } = await publicarCaixa({
			texto: parsed.data.texto,
			// Do SERVIDOR, sempre — o corpo não escolhe label.
			label: labelDaCaixa(),
			publicadoPor: session.user.email ?? null,
		});
		return Response.json({ versao, label });
	} catch (err) {
		console.error("[admin/caixa POST]", err);
		return Response.json(
			{ error: "Não foi possível publicar a conduta do vendedor." },
			{ status: 500 },
		);
	}
}
