// O que acontece quando o cliente manda uma foto, um PDF ou um áudio no WhatsApp.
//
// Ponto ÚNICO de entrada da mídia inbound — antes eram dois caminhos paralelos
// disparados lado a lado pelo webhook (`document-inbound` consumia a foto como
// slot de KYC, `media-inbound` registrava no histórico), e nenhum dos dois fazia
// a pergunta que todo caminho de fala com o cliente faz: QUEM RESPONDE ele agora.
//
// Em 2026-08-18 isso custou uma venda em atendimento. A conversa estava com um
// humano, todo texto do cliente virava `User→AllAttendants` — e às 20:10 chegou
// um `type: document` que não gerou relay nenhum. O atendente pediu o documento
// de renda, o cliente mandou, e do lado de cá não apareceu nada. Pior: como a
// busca da conversa era por igualdade exata de `wa_id` (a Meta entrega número BR
// sem o nono dígito), o arquivo não entrou nem no histórico — o painel também
// não tinha o que mostrar — e ainda sobrava o agente respondendo "manda um oi
// que eu começo com você" por cima do humano que estava atendendo.
//
// A regra aqui é a mesma do texto: mídia é fala. Ela entra no histórico da
// conversa da PESSOA (resolvida por `conversaDoNumero`, nunca por string crua) e
// segue para quem está no comando — o atendente, se há atendimento humano; o
// KYC do agente, se não há.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { quemRespondePara } from "@/lib/agent/quem-responde";
import { publishMessage } from "@/lib/chat/message-bus";
import { getClientDocsStorageConfig, getSignedDownloadUrl, putObject } from "@/lib/storage";
import { simulatorNow } from "@/lib/utils/simulator-clock";
import { downloadMedia, sendTextMessage } from "./api";
import { withConversationLock } from "./conversation-lock";
import { conversaDoNumero } from "./destino";
import {
	type DocumentInboundInput,
	defaultDocumentInboundDeps,
	handleDocumentInbound,
} from "./document-inbound";
import { type TipoDeMidia, tipoDeMidia } from "./media-kind";
import { isMesaAttendantPhone } from "./mesa/routing";
import {
	type AnexoDoCliente,
	isAttendantPhone,
	relayAvisoAoAtendente,
	relayUserMediaToAgent,
} from "./proxy";

/**
 * A Meta BUSCA o arquivo na URL que a gente manda — ela não recebe os bytes.
 * Mesma folga que o painel usa no sentido oposto (atendente → cliente).
 */
const EXPIRACAO_PARA_A_META_SEGUNDOS = 15 * 60;

const EXTENSAO_POR_MIME: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"application/pdf": "pdf",
	"audio/ogg": "ogg",
	"audio/mpeg": "mp3",
	"audio/mp4": "m4a",
	"audio/amr": "amr",
};

/** O que a timeline mostra quando o anexo veio sem legenda. */
const DESCRICAO: Record<TipoDeMidia, string> = {
	image: "Imagem recebida",
	document: "Documento recebido",
	audio: "Áudio recebido",
};

/**
 * O `type` que a Meta manda no webhook — mais largo que `TipoDeMidia`, porque
 * o cliente também grava vídeo e manda figurinha, e o botão do vídeo fica ao
 * lado do de áudio. Vídeo e sticker viram `document` no histórico (é o tipo
 * curinga), mas NUNCA entram no KYC: documento de identidade é foto ou PDF.
 */
export type TipoInboundDoWhatsApp = TipoDeMidia | "video" | "sticker";

export interface MidiaDoClienteInput {
	/** waId do cliente (o `from` do webhook). */
	from: string;
	/** id da mídia na Graph API. */
	mediaId: string;
	/** O `type` da mensagem no webhook — o mime baixado tem a palavra final. */
	tipo: TipoInboundDoWhatsApp;
	/** Nome original, quando o WhatsApp manda (documento tem; imagem não). */
	filename?: string;
	/** Legenda que o cliente digitou junto do anexo. */
	caption?: string;
}

export interface MidiaDoClienteDeps {
	baixar: (mediaId: string) => Promise<{ bytes: Uint8Array; mimeType: string }>;
	guardar: (key: string, bytes: Uint8Array, mimeType: string) => Promise<void>;
	assinarLink: (key: string) => Promise<string>;
	/** Resposta direta a quem mandou — usada só para atendente, nunca para cliente. */
	avisar: (para: string, texto: string) => Promise<unknown>;
	/** Passo 6 (KYC) do agente — só roda quando é o agente que está no comando. */
	kyc: (
		input: DocumentInboundInput,
		jaBaixada?: { bytes: Uint8Array; mimeType: string },
	) => Promise<void>;
}

export const defaultMidiaDoClienteDeps: MidiaDoClienteDeps = {
	baixar: downloadMedia,
	guardar: async (key, bytes, mimeType) => {
		await putObject(key, bytes, mimeType, getClientDocsStorageConfig());
	},
	assinarLink: (key) =>
		getSignedDownloadUrl(key, getClientDocsStorageConfig(), EXPIRACAO_PARA_A_META_SEGUNDOS),
	avisar: sendTextMessage,
	kyc: async (input, jaBaixada) => {
		// Serializado como os demais inbounds: RG frente + verso chegam em sequência
		// e os dois escrevem `documentSlotsSent` no mesmo metadata (lost update se
		// rodarem em paralelo).
		await withConversationLock(input.from, () =>
			handleDocumentInbound(
				input,
				jaBaixada
					? { ...defaultDocumentInboundDeps, download: async () => jaBaixada }
					: defaultDocumentInboundDeps,
			),
		);
	},
};

function nomeDoArquivo(tipo: TipoDeMidia, mimeType: string, filename?: string): string {
	const informado = filename?.trim();
	if (informado) return informado;
	const extensao = EXTENSAO_POR_MIME[mimeType] ?? "bin";
	return `${{ image: "imagem", document: "documento", audio: "audio" }[tipo]}.${extensao}`;
}

/**
 * Recebe a mídia que o cliente mandou e a entrega a quem está no comando.
 *
 * Best-effort de propósito, igual ao resto do webhook: falha de download ou de
 * storage não pode derrubar o turno do cliente nem impedir o 200 que a Meta
 * espera. O que ela NÃO pode mais é sumir em silêncio — havendo atendimento
 * humano, o atendente é avisado mesmo quando o arquivo não pôde ser baixado.
 */
export async function receberMidiaDoCliente(
	input: MidiaDoClienteInput,
	over: Partial<MidiaDoClienteDeps> = {},
): Promise<void> {
	const deps: MidiaDoClienteDeps = { ...defaultMidiaDoClienteDeps, ...over };
	const { from, mediaId, filename, caption } = input;

	// Só mídia de CLIENTE passa daqui. O caminho de texto pergunta isto antes de
	// tudo (`processor.ts`) e a mídia não perguntava: o atendente que fotografava
	// um boleto e mandava pelo número do bot recebia a copy de cliente — "manda um
	// oi que eu começo com você". Anexo do atendente para o cliente é o painel que
	// envia; aqui a resposta honesta é dizer isso a ele.
	if ((await isMesaAttendantPhone(from)) || (await isAttendantPhone(from))) {
		console.log(`[midia-do-cliente] anexo veio de um atendente (${from}) — não é fala de cliente`);
		await deps.avisar(
			from,
			"Anexo enviado por aqui não segue para o cliente. Mande o arquivo pelo painel, na conversa dele.",
		);
		return;
	}

	/** Vídeo e figurinha nunca foram RG: entram no histórico, não no KYC. */
	const podeSerDocumentoDeIdentidade = input.tipo === "image" || input.tipo === "document";

	const decisao = await quemRespondePara(from);
	const humanoAtende = decisao.quem === "humano";

	// Com humano no caso, a mídia pertence à conversa DO ATENDIMENTO — que nem
	// sempre é a do canal de entrada (a pessoa começa na web e volta pelo
	// WhatsApp). É a mesma resolução que `relayUserToAgent` faz para o texto.
	const conv = humanoAtende
		? ((await db.query.conversations.findFirst({
				where: eq(conversations.id, decisao.conversationId),
			})) ?? null)
		: await conversaDoNumero(from);

	if (!conv) {
		// Sem conversa não há onde guardar nem a quem entregar. O agente ainda
		// acolhe o cliente, como sempre fez.
		console.warn(`[midia-do-cliente] nenhuma conversa para ${from} — mídia sem destino`);
		if (!humanoAtende && podeSerDocumentoDeIdentidade) {
			await deps.kyc({ from, mediaId, filename });
		}
		return;
	}

	let media: { bytes: Uint8Array; mimeType: string };
	try {
		media = await deps.baixar(mediaId);
	} catch (err) {
		console.error("[midia-do-cliente] download falhou:", err);
		if (humanoAtende) {
			// Silêncio aqui é exatamente o bug que este módulo existe para matar.
			await relayAvisoAoAtendente(
				from,
				"O cliente enviou um anexo, mas não consegui baixar o arquivo. Peça para ele reenviar.",
			);
		} else if (podeSerDocumentoDeIdentidade) {
			// Sem os bytes: o KYC refaz o download e responde ao cliente o que deu.
			await deps.kyc({ from, mediaId, filename });
		}
		return;
	}

	const tipo = tipoDeMidia(media.mimeType) ?? (input.tipo === "audio" ? "audio" : "document");
	const extensao = EXTENSAO_POR_MIME[media.mimeType] ?? "bin";
	const key = `conversas/${conv.id}/recebidos/${crypto.randomUUID()}.${extensao}`;

	let guardado = true;
	try {
		await deps.guardar(key, media.bytes, media.mimeType);
	} catch (err) {
		// Storage fora do ar não pode levar junto o resto do turno. Antes deste
		// módulo os dois caminhos eram promises independentes, e um `putObject`
		// quebrado não impedia a foto do RG de virar slot da proposta — o cliente
		// continuava recebendo resposta. Aqui é o mesmo: registra o que dá,
		// avisa quem precisa saber, e segue.
		console.error("[midia-do-cliente] upload pro storage falhou:", err);
		guardado = false;
	}

	if (guardado) {
		await registrarNoHistorico({ conv, key, media, caption, filename, tipo });
	}

	if (humanoAtende) {
		if (!guardado) {
			await relayAvisoAoAtendente(
				from,
				"O cliente enviou um anexo, mas não consegui guardar o arquivo. Peça para ele reenviar.",
			);
			return;
		}
		const anexo: AnexoDoCliente = {
			tipo,
			link: await deps.assinarLink(key),
			filename: nomeDoArquivo(tipo, media.mimeType, filename),
			caption,
		};
		const entregue = await relayUserMediaToAgent(from, anexo);
		if (!entregue) {
			console.warn(
				`[midia-do-cliente] ${tipo} de ${conv.id} sem atendente para receber — ficou só no painel`,
			);
		}
		return;
	}

	// Agente no comando: a foto do RG continua virando slot da proposta.
	if (podeSerDocumentoDeIdentidade) {
		await deps.kyc({ from, mediaId, filename }, media);
	}
}

/**
 * Grava o anexo no histórico e acorda a tela de quem atende.
 *
 * Isolado e à prova de exceção de propósito: a entrega ao atendente NÃO pode
 * depender do sucesso desta escrita. `mediaFilename` é `varchar(255)` e recebe
 * um nome escolhido pelo cliente — um arquivo com nome quilométrico derrubaria
 * o insert e, com ele, o relay, reproduzindo o silêncio que este módulo veio
 * matar.
 */
async function registrarNoHistorico(args: {
	conv: { id: string };
	key: string;
	media: { mimeType: string };
	tipo: TipoDeMidia;
	caption?: string;
	filename?: string;
}): Promise<void> {
	const { conv, key, media, tipo, caption, filename } = args;
	const conteudo = caption?.trim() || DESCRICAO[tipo];
	try {
		const [gravada] = await db
			.insert(messages)
			.values({
				conversationId: conv.id,
				role: "user",
				content: conteudo,
				channel: "whatsapp",
				createdAt: simulatorNow(),
				mediaKey: key,
				mediaType: tipo,
				mediaMimeType: media.mimeType.slice(0, 128),
				mediaFilename: filename?.slice(0, 255) ?? null,
			})
			.returning();

		// A TELA de quem atende precisa saber que chegou — sem isto o anexo só
		// aparece para quem recarregar a página, que é o mesmo que não aparecer.
		publishMessage(conv.id, {
			id: gravada?.id ?? crypto.randomUUID(),
			role: "user",
			content: conteudo,
			createdAt: simulatorNow().toISOString(),
		});

		console.log(`[midia-do-cliente] ${tipo} de ${conv.id} registrado no histórico`);
	} catch (err) {
		console.error("[midia-do-cliente] não consegui gravar o anexo no histórico:", err);
	}
}
