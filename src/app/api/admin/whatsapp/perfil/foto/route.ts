import { requireRole } from "@/lib/admin/require-role";
import { recusaDaFoto } from "@/lib/validations/whatsapp-business-profile";
import {
	ErroDaGraph,
	enviarFotoDePerfil,
	estadoDaLigacao,
	lerPerfilCorporativo,
	salvarPerfilCorporativo,
} from "@/lib/whatsapp/business-profile";

/**
 * Troca a foto do perfil corporativo.
 *
 * Rota separada do resto do perfil porque o caminho é outro: a Graph não aceita
 * a imagem no POST do perfil, só um `handle` devolvido pela Resumable Upload
 * API. São duas viagens à Meta antes da terceira, que é a que salva —
 * `enviarFotoDePerfil` cuida das duas primeiras.
 *
 * A foto entra por `multipart/form-data`, campo `foto`.
 */
export async function POST(req: Request) {
	const { error } = await requireRole("admin");
	if (error) return error;

	const ligacao = estadoDaLigacao();
	if (!ligacao.podeTrocarFoto) {
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

	const arquivo = form.get("foto");
	if (!(arquivo instanceof File)) {
		return Response.json({ error: "Nenhuma foto enviada." }, { status: 400 });
	}

	// Recusa antes de gastar viagem à Meta. O erro dela para formato inválido não
	// diz qual é o formato aceito.
	const recusa = recusaDaFoto({ type: arquivo.type, size: arquivo.size });
	if (recusa) {
		return Response.json({ error: recusa }, { status: 400 });
	}

	try {
		const handle = await enviarFotoDePerfil({
			bytes: await arquivo.arrayBuffer(),
			mimeType: arquivo.type.toLowerCase(),
			nomeArquivo: arquivo.name || "perfil.jpg",
		});

		await salvarPerfilCorporativo({ profilePictureHandle: handle });

		// A URL nova só existe depois que a Meta processa — relemos para a tela
		// mostrar a foto que está de fato no ar, e não um preview local que pode
		// diferir do que o cliente vê.
		const perfil = await lerPerfilCorporativo();
		return Response.json({ perfil });
	} catch (err) {
		if (err instanceof ErroDaGraph) {
			// Mesmo mapeamento da rota do perfil: 400/422 é conteúdo recusado (o
			// operador corrige); qualquer outro código é falha do lado da Meta e vira
			// 502. Repassar o 401/403 dela expulsaria do painel um admin logado.
			const status = err.status === 400 || err.status === 422 ? 400 : 502;
			return Response.json({ error: err.message }, { status });
		}
		const message = err instanceof Error ? err.message : String(err);
		console.error("[api/admin/whatsapp/perfil/foto]", message);
		return Response.json({ error: message }, { status: 500 });
	}
}
