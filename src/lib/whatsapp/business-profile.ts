/**
 * Perfil corporativo do WhatsApp — leitura e escrita direto na Meta Graph API.
 *
 * É o cartão de visita que o cliente vê quando abre a conversa: foto, recado,
 * descrição do negócio, endereço, e-mail, sites e ramo de atividade.
 *
 * NÃO existe cópia disso no nosso banco, de propósito. O perfil também pode ser
 * editado pelo WhatsApp Business Manager, então uma tabela espelho estaria
 * desatualizada sem aviso e o painel exibiria com confiança um dado que não é
 * mais o que está no ar. A Graph é a fonte; a tela lê dela e escreve nela.
 *
 * Endpoints (Cloud API):
 *   GET  /{PHONE_NUMBER_ID}/whatsapp_business_profile?fields=...
 *   POST /{PHONE_NUMBER_ID}/whatsapp_business_profile
 *
 * A foto é o único campo que não viaja no POST: a Graph só aceita um `handle`
 * devolvido pela Resumable Upload API, e essa sessão de upload abre no APP ID —
 * não no phone number id. Ver `enviarFotoDePerfil`.
 */
import type { PerfilCorporativoInput } from "@/lib/validations/whatsapp-business-profile";
import { GRAPH_API, GRAPH_TIMEOUT_MS } from "./api";

/** Upload de arquivo é mais lento que uma chamada JSON — 15s derruba foto grande. */
const UPLOAD_TIMEOUT_MS = 60_000;

/** Os campos que pedimos no GET. Explícito porque o default da Graph pode mudar. */
const CAMPOS_DO_PERFIL = [
	"about",
	"address",
	"description",
	"email",
	"profile_picture_url",
	"websites",
	"vertical",
] as const;

export interface PerfilCorporativo {
	about?: string;
	address?: string;
	description?: string;
	email?: string;
	profile_picture_url?: string;
	websites?: string[];
	vertical?: string;
}

/**
 * Falha vinda da Meta, já com a mensagem dela preservada.
 *
 * A mensagem da Graph sobe INTEIRA até a tela ("Param about must be a string of
 * length 1-139", "(#131009) Parameter value is not valid") porque ela é a única
 * autoridade sobre o que este perfil aceita — traduzir por conta própria seria
 * inventar uma regra que a Meta pode desmentir na semana seguinte.
 */
export class ErroDaGraph extends Error {
	readonly status: number;
	constructor(message: string, status: number) {
		super(message);
		this.name = "ErroDaGraph";
		this.status = status;
	}
}

/** Configuração de envio/leitura do perfil. Falha alto, como o resto de `api.ts`. */
function configDoPerfil() {
	const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
	const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
	if (!accessToken || !phoneNumberId) {
		throw new Error("WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID precisam estar definidos");
	}
	return { accessToken, phoneNumberId };
}

/**
 * Configuração do upload de foto. Exige a env do APP ID — que é uma env A MAIS
 * que o resto do WhatsApp usa, e por isso tem mensagem própria: sem ela, o único
 * recurso que quebra é a troca de foto, e o operador precisa saber disso em vez
 * de ver "erro ao salvar" numa tela inteira que funciona.
 */
function configDoUpload() {
	const { accessToken } = configDoPerfil();
	const appId = process.env.WHATSAPP_APP_ID;
	if (!appId) {
		throw new Error(
			"WHATSAPP_APP_ID precisa estar definido para enviar a foto — a sessão de upload da Meta abre no ID do app, não no número.",
		);
	}
	return { accessToken, appId };
}

/** Extrai a mensagem de erro da Graph de um corpo que pode nem ser JSON. */
export function mensagemDeErroDaGraph(corpo: string): string {
	try {
		const json = JSON.parse(corpo) as {
			error?: { message?: string; error_user_msg?: string; error_user_title?: string };
		};
		// `error_user_msg` é a versão que a Meta escreveu PARA o usuário final —
		// quando existe, é mais legível que a `message` técnica.
		const msg = json.error?.error_user_msg ?? json.error?.message;
		if (msg) return msg;
	} catch {
		// Corpo não-JSON (HTML de gateway, texto solto): cai no bruto abaixo.
	}
	return corpo.slice(0, 500) || "A Meta recusou a chamada sem detalhar o motivo.";
}

/** `true` quando o erro veio do AbortSignal.timeout estourar. */
function ehTimeout(err: unknown): boolean {
	return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}

async function garantirOk(res: Response, oQueFalhou: string): Promise<void> {
	if (res.ok) return;
	const corpo = await res.text();
	console.error(`[whatsapp-perfil] ${oQueFalhou} (${res.status}):`, corpo);
	throw new ErroDaGraph(mensagemDeErroDaGraph(corpo), res.status);
}

/**
 * Lê o perfil corporativo como ele está na Meta AGORA.
 *
 * A resposta da Graph vem embrulhada em `{ data: [ {...} ] }` — lista de um
 * elemento só. Quando o número ainda não tem perfil preenchido, `data` volta
 * vazia, e isso não é erro: é perfil em branco.
 */
export async function lerPerfilCorporativo(): Promise<PerfilCorporativo> {
	const { accessToken, phoneNumberId } = configDoPerfil();
	const url = `${GRAPH_API}/${phoneNumberId}/whatsapp_business_profile?fields=${CAMPOS_DO_PERFIL.join(",")}`;

	let res: Response;
	try {
		res = await fetch(url, {
			headers: { Authorization: `Bearer ${accessToken}` },
			cache: "no-store",
			signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
		});
	} catch (err) {
		if (ehTimeout(err)) {
			throw new ErroDaGraph("A Meta não respondeu a tempo ao ler o perfil.", 504);
		}
		throw err;
	}

	await garantirOk(res, "Falha ao ler o perfil");

	const json = (await res.json()) as { data?: PerfilCorporativo[] };
	return json.data?.[0] ?? {};
}

/**
 * Grava os campos informados. O que não vier no `patch` NÃO é tocado — a Graph
 * faz merge, e é isso que queremos: salvar só o endereço não pode apagar a
 * descrição que ninguém mexeu.
 *
 * `profilePictureHandle` entra separado porque não é campo de formulário: é o
 * retorno do upload, e sai de `enviarFotoDePerfil`.
 */
export async function salvarPerfilCorporativo(
	patch: PerfilCorporativoInput & { profilePictureHandle?: string },
): Promise<void> {
	const { accessToken, phoneNumberId } = configDoPerfil();

	const corpo: Record<string, unknown> = { messaging_product: "whatsapp" };
	if (patch.about !== undefined) corpo.about = patch.about;
	if (patch.address !== undefined) corpo.address = patch.address;
	if (patch.description !== undefined) corpo.description = patch.description;
	if (patch.email !== undefined) corpo.email = patch.email;
	if (patch.vertical !== undefined) corpo.vertical = patch.vertical;
	if (patch.websites !== undefined) corpo.websites = patch.websites;
	if (patch.profilePictureHandle !== undefined) {
		corpo.profile_picture_handle = patch.profilePictureHandle;
	}

	let res: Response;
	try {
		res = await fetch(`${GRAPH_API}/${phoneNumberId}/whatsapp_business_profile`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(corpo),
			signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
		});
	} catch (err) {
		if (ehTimeout(err)) {
			throw new ErroDaGraph("A Meta não respondeu a tempo ao salvar o perfil.", 504);
		}
		throw err;
	}

	await garantirOk(res, "Falha ao salvar o perfil");
}

/**
 * Sobe a imagem pela Resumable Upload API e devolve o `handle`.
 *
 * São dois passos, e o primeiro é onde quase todo tutorial erra: a sessão abre
 * em `/{APP_ID}/uploads`, NÃO em `/{PHONE_NUMBER_ID}/uploads`. Com o phone
 * number id a Graph responde erro de nó inválido, e a mensagem não diz que o
 * problema é o nó — parece problema de permissão do token.
 *
 *   1) POST /{APP_ID}/uploads?file_name&file_length&file_type  →  { id: "upload:..." }
 *   2) POST /{id da sessão}  com  `Authorization: OAuth <token>`  e  `file_offset: 0`
 *      e o binário no corpo                                      →  { h: "<handle>" }
 *
 * O `OAuth` do passo 2 é literal da doc — não é `Bearer`. O handle devolvido é
 * o que vai em `profile_picture_handle` no POST do perfil.
 */
export async function enviarFotoDePerfil(arquivo: {
	bytes: ArrayBuffer;
	mimeType: string;
	nomeArquivo: string;
}): Promise<string> {
	const { accessToken, appId } = configDoUpload();

	const params = new URLSearchParams({
		file_name: arquivo.nomeArquivo,
		file_length: String(arquivo.bytes.byteLength),
		file_type: arquivo.mimeType,
	});

	let sessao: Response;
	try {
		sessao = await fetch(`${GRAPH_API}/${appId}/uploads?${params}`, {
			method: "POST",
			headers: { Authorization: `Bearer ${accessToken}` },
			signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
		});
	} catch (err) {
		if (ehTimeout(err)) {
			throw new ErroDaGraph("A Meta não respondeu a tempo ao abrir o envio da foto.", 504);
		}
		throw err;
	}

	await garantirOk(sessao, "Falha ao abrir a sessão de upload");

	const { id: idDaSessao } = (await sessao.json()) as { id?: string };
	if (!idDaSessao) {
		throw new ErroDaGraph("A Meta não devolveu o identificador da sessão de upload.", 502);
	}

	let envio: Response;
	try {
		envio = await fetch(`${GRAPH_API}/${idDaSessao}`, {
			method: "POST",
			headers: {
				// Literal da doc do Resumable Upload: aqui é `OAuth`, não `Bearer`.
				Authorization: `OAuth ${accessToken}`,
				file_offset: "0",
				"Content-Type": arquivo.mimeType,
			},
			body: arquivo.bytes,
			signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
		});
	} catch (err) {
		if (ehTimeout(err)) {
			throw new ErroDaGraph("A Meta não respondeu a tempo ao receber a foto.", 504);
		}
		throw err;
	}

	await garantirOk(envio, "Falha ao enviar a foto");

	const { h: handle } = (await envio.json()) as { h?: string };
	if (!handle) {
		throw new ErroDaGraph("A Meta aceitou a foto mas não devolveu o handle.", 502);
	}
	return handle;
}

/**
 * O que a tela mostra sobre a ligação com a Meta, sem expor segredo.
 *
 * Só presença: o token e o app secret NUNCA saem daqui, nem mascarados. Saber
 * QUE existe token configurado é o que resolve o "por que a tela não carrega";
 * saber QUAL é o token não ajuda ninguém no painel e transforma uma tela de
 * configuração num ponto de vazamento.
 */
export function estadoDaLigacao(): {
	phoneNumberId: string | null;
	wabaId: string | null;
	appId: string | null;
	temToken: boolean;
	podeTrocarFoto: boolean;
} {
	// `?? null` não bastava: no `.env.local` a variável existe e está VAZIA
	// (`WHATSAPP_PHONE_NUMBER_ID=`), então o `??` a deixava passar como `""` — e o
	// painel recebia uma string vazia onde o contrato diz "ausente". Vazio é
	// ausente, e é assim que a tela precisa ler.
	const semVazio = (v: string | undefined) => (v?.trim() ? v.trim() : null);

	const phoneNumberId = semVazio(process.env.WHATSAPP_PHONE_NUMBER_ID);
	const appId = semVazio(process.env.WHATSAPP_APP_ID);
	const temToken = Boolean(semVazio(process.env.WHATSAPP_ACCESS_TOKEN));
	return {
		phoneNumberId,
		wabaId: semVazio(process.env.WHATSAPP_WABA_ID),
		appId,
		temToken,
		// A foto depende de UMA env a mais que o resto — a tela avisa antes, em vez
		// de deixar o operador escolher o arquivo e só então tomar um erro.
		podeTrocarFoto: temToken && Boolean(appId),
	};
}
