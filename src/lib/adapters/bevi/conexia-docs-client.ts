// ConexiaDocsClient — upload de documento AUTOMATIZADO (sem redirect), via o
// backend do portal CONEXIA (`indiky`). Mecanismo reverse-engineered e validado
// na POC: docs/integracoes/bevi-upload-poc.md.
//
// ⚠️ Endpoint NÃO-documentado do parceiro (não é a API de Parceiro). Encapsulado
// aqui num módulo só pra isolar o risco de drift: se mudar, só este arquivo +
// seu contract test quebram, e o chamador cai pro link (getDocumentLinks).
//
// Fluxo: uselink.me → documentsToken → GET slots (referer) → PATCH multipart 'file'.

import type { DocumentSlot, UploadDocumentInput } from "../proposal-gateway";

export interface ConexiaConfig {
	/** Backend do portal CONEXIA (indiky). */
	indikyBaseUrl: string;
	/** Origin/referer que resolve o tenant (sem ele → 404 "Sistema não encontrado"). */
	portalOrigin: string;
}

const DEFAULT_CONFIG: ConexiaConfig = {
	indikyBaseUrl: "https://indiky-production-server-pwp4i.ondigitalocean.app",
	portalOrigin: "https://conexia.agxsoftware.com",
};

const TIMEOUT_MS = 20_000;
const SYSTEM_RETRY = 3; // 404 "Sistema não encontrado" intermitente
const SYSTEM_RETRY_DELAY_MS = 400;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Envelope<T> {
	success: boolean;
	code: number;
	message: string;
	data: T;
}

interface DocSlotApi {
	name: string;
	sort: number;
	_id: string; // documentId
	sectionId: string;
	files: Array<{ _id: string; documentId: string; sectionId: string; proposalId: string }>;
}

interface DocsResponse {
	section: { _id: string };
	documents: DocSlotApi[];
	proposalId: string;
}

export class ConexiaDocsClient {
	private readonly cfg: ConexiaConfig;

	constructor(cfg?: Partial<ConexiaConfig>) {
		this.cfg = { ...DEFAULT_CONFIG, ...cfg };
	}

	private headers(extra: Record<string, string> = {}): Record<string, string> {
		return {
			referer: `${this.cfg.portalOrigin}/`,
			origin: this.cfg.portalOrigin,
			accept: "application/json, text/plain, */*",
			...extra,
		};
	}

	/** Segue o uselink.me (302) e extrai o documentsToken da URL do portal. Se o link
	 * já for a URL do portal (ou só o token), resolve direto. */
	async resolveDocumentsToken(documentsLink: string): Promise<string> {
		const direct = extractToken(documentsLink);
		if (direct) return direct;

		const res = await fetch(documentsLink, {
			method: "GET",
			redirect: "manual",
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		const location = res.headers.get("location") ?? "";
		const token = extractToken(location);
		if (!token) {
			throw new Error(
				`ConexiaDocsClient: não consegui extrair documentsToken de "${documentsLink}".`,
			);
		}
		return token;
	}

	/** GET dos slots de documento. Retry no 404 "Sistema não encontrado" (intermitente). */
	async listDocumentSlots(documentsToken: string): Promise<DocsResponse> {
		const url = `${this.cfg.indikyBaseUrl}/unauth/proposals/documents/${documentsToken}`;
		let last = "";
		for (let attempt = 1; attempt <= SYSTEM_RETRY; attempt++) {
			const res = await fetch(url, {
				method: "GET",
				headers: this.headers(),
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});
			const env = (await res.json()) as Envelope<DocsResponse>;
			if (env.success) return env.data;
			last = env.message;
			if (env.code === 404 && attempt < SYSTEM_RETRY) {
				await sleep(SYSTEM_RETRY_DELAY_MS);
				continue;
			}
			break;
		}
		throw new Error(`ConexiaDocsClient: falha ao listar documentos (${last}).`);
	}

	/** PATCH multipart (campo 'file') no slot correspondente. */
	async upload(input: UploadDocumentInput): Promise<void> {
		const token = await this.resolveDocumentsToken(input.documentsLink);
		const docs = await this.listDocumentSlots(token);
		const slot = pickSlot(docs.documents, input.slot);
		if (!slot) {
			throw new Error(`ConexiaDocsClient: slot "${input.slot}" não encontrado nos documentos.`);
		}
		const fileRef = slot.files[0];
		const url = `${this.cfg.indikyBaseUrl}/unauth/proposals/${docs.proposalId}/section/${slot.sectionId}/document/${slot._id}/client/${fileRef._id}`;

		const form = new FormData();
		const view = new Uint8Array(input.file);
		form.append("file", new Blob([view], { type: input.mimeType }), input.filename);

		const res = await fetch(url, {
			method: "PATCH",
			headers: this.headers(), // NÃO setar Content-Type — o FormData define o boundary
			body: form,
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		const env = (await res.json()) as Envelope<unknown>;
		if (!env.success) {
			throw new Error(`ConexiaDocsClient: upload falhou (${env.message}).`);
		}
	}
}

function extractToken(s: string): string | null {
	if (!s) return null;
	const m = s.match(/documentsToken=([a-f0-9]+)/i);
	if (m) return m[1];
	// só o token (hex de 24)
	if (/^[a-f0-9]{24}$/i.test(s.trim())) return s.trim();
	return null;
}

/** Casa o slot de domínio com o documento do portal por nome/ordem. */
function pickSlot(documents: DocSlotApi[], slot: DocumentSlot): DocSlotApi | undefined {
	if (slot === "comprovante_endereco") {
		// no link de comprovante há só um documento relevante
		return documents.find((d) => /comprovante|endere/i.test(d.name)) ?? documents[0];
	}
	const wantsVerso = slot === "identidade_verso";
	return (
		documents.find((d) => (wantsVerso ? /verso/i.test(d.name) : /frente|aberto/i.test(d.name))) ??
		documents.find((d) => d.sort === (wantsVerso ? 2 : 1))
	);
}
