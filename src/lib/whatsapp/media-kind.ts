/**
 * As categorias de anexo que o WhatsApp trata como tipos de mensagem próprios.
 *
 * `video` entrou em 2026-08-18: até então vídeo caía no curinga `document` e
 * chegava ao painel como "Documento recebido", com nome `documento.bin`. A Meta
 * tem tipo e limite próprios para vídeo, e quem atende precisa reconhecer na
 * hora que o cliente gravou alguma coisa — não abrir um "documento" para
 * descobrir.
 */
export type TipoDeMidia = "image" | "document" | "audio" | "video";

/**
 * Teto por categoria, em bytes — os limites da Cloud API da Meta.
 * Fonte: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
 */
export const LIMITES_DE_TAMANHO: Record<TipoDeMidia, number> = {
	image: 5 * 1024 * 1024,
	audio: 16 * 1024 * 1024,
	video: 16 * 1024 * 1024,
	document: 100 * 1024 * 1024,
};

const ROTULO: Record<TipoDeMidia, string> = {
	image: "imagem",
	audio: "áudio",
	video: "vídeo",
	document: "documento",
};

/** Formatos que a Meta aceita como imagem. Fora daqui não vira `image`. */
const IMAGENS = new Set(["image/jpeg", "image/png"]);

/**
 * Tipos que NUNCA sobem, independentemente de tamanho.
 *
 * Não é teatro de segurança: o anexo vai parar no WhatsApp de um cliente, com o
 * nome da empresa em cima. Executável não tem uso legítimo nesse fluxo, e o
 * caminho "documento aceita qualquer coisa" tornaria trivial usar o painel como
 * distribuidor de binário.
 */
const BLOQUEADOS = new Set([
	"application/x-msdownload",
	"application/x-msdos-program",
	"application/x-executable",
	"application/vnd.microsoft.portable-executable",
	"application/x-sh",
	"application/x-bat",
]);

/**
 * A categoria de mensagem que este mime vira no WhatsApp.
 *
 * Default é `document` de propósito: mime que ninguém previu ainda é um arquivo
 * legítimo (um .ods, um .dwg), e recusá-lo por desconhecimento seria pior do que
 * mandá-lo como documento — que é justamente o tipo curinga da Meta.
 */
export function tipoDeMidia(mimeType: string): TipoDeMidia | null {
	const mime = mimeType.trim().toLowerCase();
	if (!mime) return null;
	if (IMAGENS.has(mime)) return "image";
	if (mime.startsWith("audio/")) return "audio";
	if (mime.startsWith("video/")) return "video";
	return "document";
}

export type ResultadoDaValidacao = { ok: true; tipo: TipoDeMidia } | { ok: false; motivo: string };

function emMB(bytes: number): string {
	return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * Barra o que a Meta recusaria — ANTES de gastar upload.
 *
 * A mensagem de erro é escrita pro atendente, não pro log: diz o limite e a
 * categoria, pra ele saber se compensa comprimir a foto ou mandar como anexo.
 */
export function validarAnexo(arquivo: {
	mimeType: string;
	tamanho: number;
	nome: string;
}): ResultadoDaValidacao {
	const mime = arquivo.mimeType.trim().toLowerCase();

	if (BLOQUEADOS.has(mime)) {
		return { ok: false, motivo: "Esse tipo de arquivo não é permitido no envio ao cliente." };
	}
	if (!arquivo.nome.trim()) {
		return { ok: false, motivo: "O arquivo precisa ter um nome." };
	}
	if (arquivo.tamanho <= 0) {
		return { ok: false, motivo: "O arquivo está vazio." };
	}

	const tipo = tipoDeMidia(mime);
	if (!tipo) {
		return { ok: false, motivo: "Não foi possível identificar o tipo do arquivo." };
	}

	const limite = LIMITES_DE_TAMANHO[tipo];
	if (arquivo.tamanho > limite) {
		return {
			ok: false,
			motivo: `Esse ${ROTULO[tipo]} tem ${emMB(arquivo.tamanho)} e o limite do WhatsApp é ${emMB(limite)}.`,
		};
	}

	return { ok: true, tipo };
}
