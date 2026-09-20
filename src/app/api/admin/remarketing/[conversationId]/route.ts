import type { NextRequest } from "next/server";
import { gravarAcaoDaRegua, lerLinhaDaRegua } from "@/lib/admin/remarketing-queries";
import {
	type AcaoDaRegua,
	decidirAcao,
	linhaDaTela,
	proximoToqueDe,
	situacaoDe,
} from "@/lib/admin/remarketing-tela";
import { requireRole } from "@/lib/admin/require-role";

/**
 * A RÉGUA DE UMA CONVERSA — leitura para o bloco da ficha.
 *
 * A ficha (`conversation-detail-panel`) mostra em que pé está a régua daquela
 * conversa sem obrigar o operador a abrir a tela da Régua. Devolve a linha já
 * derivada (`LinhaDaTela`), com situação, passo, próximo toque e motivo — o
 * mesmo vocabulário da lista. Sem linha → `{ linha: null }` (a conversa nunca
 * entrou na régua, e a ficha diz isso; não é erro).
 */
export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ conversationId: string }> },
) {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	const { conversationId } = await params;
	const agora = new Date();
	const linha = await lerLinhaDaRegua(conversationId);

	return Response.json({
		linha: linha ? linhaDaTela(linha, agora) : null,
		// O próximo toque só existe em linha ATIVO; a situação separa segurada de
		// respondeu para o bloco não inferir pelos status crus.
		proximoToqueISO: linha ? (proximoToqueDe(linha)?.toISOString() ?? null) : null,
		situacao: linha ? situacaoDe(linha) : null,
	});
}

/**
 * SEGURAR / SOLTAR uma conversa da régua.
 *
 * A régua dispara sozinha a cada 30 s; o que esta rota faz é tirar a linha do
 * conjunto que o ciclo lê (`status` fora de `ATIVO`) e devolver a linha a ele.
 * Quem decide se dá — e por quê — é `decidirAcao`, puro e testado; aqui ficam só
 * as três coisas que exigem servidor: **sessão**, banco e auditoria.
 *
 * `viewer` NÃO entra: o papel é leitura no painel (mesmo critério de
 * `podeArrastarCard`), e segurar é escrita que muda o que o cliente recebe. É a
 * única ação desta tela, e ela é de quem atende.
 */
export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ conversationId: string }> },
) {
	const { error, session } = await requireRole("admin", "attendant");
	if (error) return error;

	const { conversationId } = await params;

	let corpo: unknown;
	try {
		corpo = await req.json();
	} catch {
		return Response.json({ error: "Corpo da requisição inválido." }, { status: 400 });
	}

	const acao = (corpo as { acao?: unknown } | null)?.acao;
	if (acao !== "segurar" && acao !== "soltar") {
		return Response.json({ error: 'Ação inválida: use "segurar" ou "soltar".' }, { status: 400 });
	}

	const linha = await lerLinhaDaRegua(conversationId);
	if (!linha) {
		return Response.json({ error: "Conversa não encontrada na régua." }, { status: 404 });
	}

	const agora = new Date();
	const decisao = decidirAcao(linha, acao as AcaoDaRegua, agora);

	// 409 e não 400: o pedido está bem formado, o ESTADO é que não permite — e é
	// isso que a tela mostra ao operador, com a frase do motivo.
	if (!decisao.ok) {
		return Response.json({ error: decisao.mensagem, motivo: decisao.motivo }, { status: 409 });
	}

	const rastro = {
		tipo: decisao.acao,
		por: session.user.name ?? session.user.email ?? "—",
		porId: session.user.id,
		em: agora.toISOString(),
	};

	await gravarAcaoDaRegua({
		conversationId,
		status: decisao.status,
		motivoSaida: decisao.motivoSaida,
		rastro,
	});

	console.log(
		JSON.stringify({
			level: "info",
			source: "admin-remarketing",
			acao: decisao.acao,
			conversation_id: conversationId,
			por: rastro.porId,
		}),
	);

	// Relê para devolver a linha como ela ficou — já com o rastro que acabou de
	// ser gravado no metadata. A tela não remonta estado no cliente.
	const atualizada = await lerLinhaDaRegua(conversationId);
	return Response.json({ linha: atualizada ? linhaDaTela(atualizada, agora) : null });
}
