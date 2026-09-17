/**
 * O cadastro da dinâmica do remarketing — leitura e gravação.
 *
 * `GET` devolve cada parâmetro com o valor vigente e de onde ele veio (cadastro
 * ou padrão de fábrica). `PUT` grava os ajustes — e RECUSA valor que o motor não
 * pode ler, com a mensagem no campo, porque o que fica no banco é o que a régua
 * vai ler a cada ciclo.
 *
 * Quem lê é `admin` e `viewer` (a tela é leitura para quem não decide). Quem
 * grava é só `admin`: mudar o teto de toques de uma pessoa é mudar quantas
 * mensagens saem para o cliente.
 *
 * Campo vazio no `PUT` NÃO é erro: apaga a linha e o parâmetro volta ao padrão
 * de fábrica. É o caminho de desfazer, sem migration e sem deploy.
 */

import { z } from "zod";
import {
	gravarCadastro,
	lerCadastroDoRemarketing,
	validarEntradas,
} from "@/lib/admin/remarketing-config";
import { requireRole } from "@/lib/admin/require-role";

const corpoSchema = z.object({
	parametros: z
		.array(
			z.object({
				// O valor chega como o formulário manda (texto). Número é tolerado e
				// vira texto: a validação de inteiro é a mesma para os dois.
				chave: z.string().min(1),
				valor: z.union([z.string(), z.number()]).transform((valor) => String(valor)),
			}),
		)
		.min(1, "Nenhum parâmetro enviado."),
});

export async function GET() {
	const { error } = await requireRole("admin", "viewer");
	if (error) return error;

	try {
		const { vigentes } = await lerCadastroDoRemarketing();
		return Response.json({ parametros: vigentes });
	} catch (err) {
		console.error("[admin/remarketing/config GET]", err);
		return Response.json({ error: "Não foi possível ler o cadastro da régua." }, { status: 500 });
	}
}

export async function PUT(req: Request) {
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
		// O valor vigente vem do banco: a validação do par de horário precisa do
		// fechamento que NÃO foi reenviado, senão subir só a abertura passaria.
		const { parametros: atuais } = await lerCadastroDoRemarketing();
		const validacao = validarEntradas(parsed.data.parametros, atuais);

		if (Object.keys(validacao.erros).length > 0) {
			return Response.json(
				{ error: "Há valores que a régua não pode usar.", erros: validacao.erros },
				{ status: 400 },
			);
		}

		const leitura = await gravarCadastro(validacao, session.user.id);
		return Response.json({ parametros: leitura.vigentes });
	} catch (err) {
		console.error("[admin/remarketing/config PUT]", err);
		return Response.json(
			{ error: "Não foi possível salvar o cadastro da régua." },
			{ status: 500 },
		);
	}
}
