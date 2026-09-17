import { requireRole } from "@/lib/admin/require-role";
import { recusaDaArte } from "@/lib/validations/whatsapp-template";
import { ErroDaMeta, uploadTemplateHeaderMedia } from "@/lib/whatsapp/api";

/**
 * Sobe a arte de um header de template (imagem) e devolve o `handle`.
 *
 * Rota separada da criação do template porque o caminho é outro: a criação grava
 * o DRAFT no banco, e a imagem precisa virar `header_handle` ANTES — o
 * `buildTemplateComponents` só monta o componente se o handle existir. A Graph
 * não aceita URL no header de template (isso é do ENVIO de mensagem), só o
 * handle da Resumable Upload API, que `uploadTemplateHeaderMedia` resolve.
 *
 * A arte entra por `multipart/form-data`, campo `arte`.
 */
export async function POST(req: Request) {
	const { error } = await requireRole("admin");
	if (error) return error;

	// A sessão de upload abre no APP ID, uma env a mais que o resto do canal. Sem
	// ela o erro só apareceria depois de escolher o arquivo; aqui ele diz o que falta.
	if (!process.env.WHATSAPP_APP_ID?.trim()) {
		return Response.json(
			{
				error:
					"Falta configurar WHATSAPP_APP_ID no ambiente — a sessão de upload da Meta abre no ID do app, não no número.",
			},
			{ status: 503 },
		);
	}

	let form: FormData;
	try {
		form = await req.formData();
	} catch {
		return Response.json(
			{ error: "Envio inválido — esperado multipart/form-data." },
			{ status: 400 },
		);
	}

	const arquivo = form.get("arte");
	if (!(arquivo instanceof File)) {
		return Response.json({ error: "Nenhuma arte enviada." }, { status: 400 });
	}

	// Recusa antes de gastar viagem à Meta. O erro dela para formato inválido não
	// diz qual é o formato aceito.
	const recusa = recusaDaArte({ type: arquivo.type, size: arquivo.size });
	if (recusa) return Response.json({ error: recusa }, { status: 400 });

	try {
		const handle = await uploadTemplateHeaderMedia({
			bytes: await arquivo.arrayBuffer(),
			mimeType: arquivo.type.toLowerCase(),
			nomeArquivo: arquivo.name || "arte.png",
		});
		return Response.json({ handle });
	} catch (err) {
		if (err instanceof ErroDaMeta) {
			// 400/422 é conteúdo recusado (o operador troca a arte); o resto é falha
			// do lado da Meta e vira 502. Repassar 401/403 dela expulsaria do painel
			// um admin logado.
			const status = err.status === 400 || err.status === 422 ? 400 : 502;
			return Response.json({ error: err.message }, { status });
		}
		const message = err instanceof Error ? err.message : String(err);
		console.error("[api/admin/whatsapp/templates/media]", message);
		return Response.json({ error: message }, { status: 500 });
	}
}
