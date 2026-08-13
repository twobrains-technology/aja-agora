import { requireRole } from "@/lib/admin/require-role";
import { perfilCorporativoSchema } from "@/lib/validations/whatsapp-business-profile";
import {
	ErroDaGraph,
	estadoDaLigacao,
	lerPerfilCorporativo,
	salvarPerfilCorporativo,
} from "@/lib/whatsapp/business-profile";

/**
 * Perfil corporativo do WhatsApp — o cartão de visita que o cliente vê.
 *
 * `admin` e ninguém mais, no GET inclusive: o perfil traz o e-mail e o endereço
 * do negócio, e quem lê é quem pode escrever nesta tela. A trava de navegação
 * está em `role-scope.ts`; esta aqui é a que impede um `fetch` direto.
 */

/**
 * Falha da Graph → resposta HTTP, com a mensagem da Meta preservada.
 *
 * O status NÃO é repassado como veio. O 401/403 da Meta é sobre a credencial do
 * SERVIDOR, e os mesmos códigos, na nossa API, significam "sua sessão do painel
 * caiu" — indistinguíveis do lado do navegador. Repassando, um token da Meta
 * vencido expulsaria para o login um admin perfeitamente logado, e o erro
 * apontaria para o lugar errado.
 *
 * Só o 400/422 continua: aí a Meta recusou o CONTEÚDO, e quem digitou corrige.
 * Todo o resto é falha de quem está do outro lado — 502.
 */
function respostaDeErro(err: unknown) {
	if (err instanceof ErroDaGraph) {
		const status = err.status === 400 || err.status === 422 ? 400 : 502;
		return Response.json({ error: err.message }, { status });
	}
	const message = err instanceof Error ? err.message : String(err);
	console.error("[api/admin/whatsapp/perfil]", message);
	return Response.json({ error: message }, { status: 500 });
}

export async function GET() {
	const { error } = await requireRole("admin");
	if (error) return error;

	const ligacao = estadoDaLigacao();

	// Sem credencial não há o que perguntar à Meta. Devolve 200 com o diagnóstico
	// em vez de 500: a tela precisa abrir justamente para explicar o que falta —
	// um erro seco aqui deixaria o operador sem nenhuma pista do motivo.
	if (!ligacao.temToken || !ligacao.phoneNumberId) {
		return Response.json({ ligacao, perfil: null, erroDoPerfil: null });
	}

	// A LEITURA sempre responde 200, e a falha da Meta viaja no corpo. Duas razões,
	// as duas vistas no smoke de 13/08 com um token inválido:
	//
	// 1. `ligacao` sai de env e não depende da Meta — sumir junto com o perfil
	//    fazia a tela pintar "não configurado" para variáveis que ESTAVAM setadas,
	//    e ainda somar "Sem WHATSAPP_ACCESS_TOKEN" embaixo de um erro que só
	//    existe porque há token. É o diagnóstico se contradizendo.
	// 2. Um 401 da Meta virava 401 nosso, que o navegador lê como sessão expirada.
	//
	// A leitura falhar não é a página falhar: é um aviso dentro de uma página que
	// continua útil.
	try {
		const perfil = await lerPerfilCorporativo();
		return Response.json({ ligacao, perfil, erroDoPerfil: null });
	} catch (err) {
		const erroDoPerfil =
			err instanceof ErroDaGraph ? err.message : err instanceof Error ? err.message : String(err);
		if (!(err instanceof ErroDaGraph)) {
			console.error("[api/admin/whatsapp/perfil] leitura falhou:", erroDoPerfil);
		}
		return Response.json({ ligacao, perfil: null, erroDoPerfil });
	}
}

export async function POST(req: Request) {
	const { error } = await requireRole("admin");
	if (error) return error;

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "JSON inválido" }, { status: 400 });
	}

	const parsed = perfilCorporativoSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Dados inválidos", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	try {
		await salvarPerfilCorporativo(parsed.data);
		// Relê da Meta em vez de devolver o que acabamos de mandar: a Graph
		// normaliza campo (e pode ignorar o que não aceitou), então ecoar o pedido
		// mostraria na tela um perfil que talvez não seja o que está no ar.
		const perfil = await lerPerfilCorporativo();
		return Response.json({ perfil });
	} catch (err) {
		return respostaDeErro(err);
	}
}
