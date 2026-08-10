"use client";

import { Paperclip, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { validarAnexo } from "@/lib/whatsapp/media-kind";

// FIX-87 + templates HSM: caixa de mensagem do operador → WhatsApp oficial.
// Compartilhada entre LeadDetailPanel e ContactDetailPanel (aba Atendimento) pra não
// re-duplicar a UI. Quando a janela de 24h fecha (429 WindowClosed), o box troca pro
// MODO TEMPLATE: lista os templates APPROVED (GET /api/admin/whatsapp/templates) e envia
// um HSM pra reabrir a conversa (a rota /message aceita {templateName, languageCode}).

interface TemplateRow {
	id: string;
	metaName: string;
	language: string;
	status: string;
	bodyPreview: string | null;
}
type ApprovedTemplate = Omit<TemplateRow, "status">;

const FIELD_CLASS =
	"w-full rounded border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

export function ClientChatBox({
	conversationId,
	onSent,
}: {
	conversationId?: string | null;
	onSent?: () => void;
}) {
	const [message, setMessage] = useState("");
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [windowClosed, setWindowClosed] = useState(false);
	const [templates, setTemplates] = useState<ApprovedTemplate[]>([]);
	const [loadingTemplates, setLoadingTemplates] = useState(false);
	const [selectedTemplateId, setSelectedTemplateId] = useState("");
	const [anexo, setAnexo] = useState<File | null>(null);
	const inputArquivo = useRef<HTMLInputElement>(null);

	// Reset ao trocar de conversa (não vazar rascunho/estado entre cards).
	// biome-ignore lint/correctness/useExhaustiveDependencies: conversationId é o gatilho do reset
	useEffect(() => {
		setMessage("");
		setError(null);
		setWindowClosed(false);
		setSelectedTemplateId("");
		setAnexo(null);
	}, [conversationId]);

	/** Valida com a MESMA regra do servidor (`media-kind.ts`): o atendente
	 *  descobre que o arquivo é grande demais na hora de escolher, não depois de
	 *  esperar o upload subir pra ser recusado. */
	function escolherAnexo(file: File | null) {
		setError(null);
		if (!file) {
			setAnexo(null);
			return;
		}
		const v = validarAnexo({ mimeType: file.type, tamanho: file.size, nome: file.name });
		if (!v.ok) {
			setError(v.motivo);
			setAnexo(null);
			if (inputArquivo.current) inputArquivo.current.value = "";
			return;
		}
		setAnexo(file);
	}

	async function enviarAnexo() {
		if (!conversationId || !anexo) return;
		setSending(true);
		setError(null);
		try {
			const form = new FormData();
			form.append("file", anexo);
			if (message.trim()) form.append("caption", message.trim());

			const res = await fetch(`/api/admin/conversations/${conversationId}/attachment`, {
				method: "POST",
				body: form,
			});
			const data = await res.json().catch(() => ({}));

			if (res.status === 429 && data.error === "WindowClosed") {
				setWindowClosed(true);
				setError(data.message ?? "A janela de 24h está fechada. Reabra com um template.");
				return;
			}
			if (!res.ok) {
				setError(data.message ?? "Falha ao enviar o anexo");
				return;
			}
			setAnexo(null);
			setMessage("");
			if (inputArquivo.current) inputArquivo.current.value = "";
			onSent?.();
		} catch {
			setError("Erro de conexão. Tente novamente.");
		} finally {
			setSending(false);
		}
	}

	// Ao detectar a janela fechada, busca os templates APPROVED (uma vez por abertura).
	useEffect(() => {
		if (!windowClosed) return;
		let alive = true;
		setLoadingTemplates(true);
		fetch("/api/admin/whatsapp/templates")
			.then((r) => (r.ok ? r.json() : { templates: [] }))
			.then((d: { templates?: TemplateRow[] }) => {
				if (!alive) return;
				setTemplates(
					(d.templates ?? [])
						.filter((t) => t.status === "APPROVED")
						.map(({ id, metaName, language, bodyPreview }) => ({
							id,
							metaName,
							language,
							bodyPreview,
						})),
				);
			})
			.catch(() => {
				if (alive) setTemplates([]);
			})
			.finally(() => {
				if (alive) setLoadingTemplates(false);
			});
		return () => {
			alive = false;
		};
	}, [windowClosed]);

	async function postMessage(payload: Record<string, unknown>) {
		return fetch(`/api/admin/conversations/${conversationId}/message`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ conversationId, ...payload }),
		});
	}

	async function handleSendText() {
		if (!conversationId || !message.trim()) return;
		setSending(true);
		setError(null);
		try {
			const res = await postMessage({ text: message });
			const data = await res.json().catch(() => ({}));
			// Janela de 24h fechada → oferece template pra reabrir (não é dead-end).
			if (res.status === 429 && data.error === "WindowClosed") {
				setWindowClosed(true);
				setError(
					data.message ??
						"A janela de 24h do WhatsApp está fechada. Envie um template HSM para reabrir a conversa.",
				);
				return;
			}
			if (!res.ok) {
				setError(data.message ?? "Falha ao enviar mensagem");
				return;
			}
			setMessage("");
			onSent?.();
		} catch {
			setError("Erro de conexão. Tente novamente.");
		} finally {
			setSending(false);
		}
	}

	async function handleSendTemplate() {
		const tpl = templates.find((t) => t.id === selectedTemplateId);
		if (!conversationId || !tpl) return;
		setSending(true);
		setError(null);
		try {
			const res = await postMessage({ templateName: tpl.metaName, languageCode: tpl.language });
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				setError(data.message ?? "Falha ao enviar o template");
				return;
			}
			// O template reabre a janela — volta pro modo texto.
			setWindowClosed(false);
			setSelectedTemplateId("");
			setMessage("");
			onSent?.();
		} catch {
			setError("Erro de conexão. Tente novamente.");
		} finally {
			setSending(false);
		}
	}

	const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

	return (
		<div className="space-y-2">
			<h4 className="text-sm font-semibold">Chat com o cliente</h4>

			{error && (
				<div className="p-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded">
					{error}
				</div>
			)}

			{!conversationId ? (
				<p className="text-xs text-muted-foreground">Sem conversa ativa para este contato.</p>
			) : windowClosed ? (
				<div className="space-y-2">
					<label className="block text-xs font-medium text-muted-foreground" htmlFor="hsm-template">
						Template para reabrir a conversa
					</label>
					<select
						id="hsm-template"
						aria-label="Template para reabrir a conversa"
						value={selectedTemplateId}
						onChange={(e) => setSelectedTemplateId(e.target.value)}
						disabled={sending || loadingTemplates}
						className={FIELD_CLASS}
					>
						<option value="">
							{loadingTemplates ? "Carregando templates…" : "Selecione um template…"}
						</option>
						{templates.map((t) => (
							<option key={t.id} value={t.id}>
								{t.metaName} ({t.language})
							</option>
						))}
					</select>
					{!loadingTemplates && templates.length === 0 && (
						<p className="text-xs text-muted-foreground">
							Nenhum template aprovado disponível. Cadastre e aprove um em Admin → WhatsApp →
							Templates.
						</p>
					)}
					{selectedTemplate?.bodyPreview && (
						<p className="text-xs text-muted-foreground italic">"{selectedTemplate.bodyPreview}"</p>
					)}
					<div className="flex justify-end">
						<Button
							size="sm"
							onClick={handleSendTemplate}
							disabled={!selectedTemplateId || sending}
						>
							<Send className="size-4 mr-2" />
							{sending ? "Enviando…" : "Enviar template"}
						</Button>
					</div>
				</div>
			) : (
				<div className="space-y-2">
					<textarea
						placeholder={
							anexo ? "Legenda do anexo (opcional)…" : "Digite sua mensagem para o cliente..."
						}
						value={message}
						onChange={(e) => setMessage(e.target.value)}
						rows={3}
						className={`resize-none ${FIELD_CLASS}`}
						disabled={sending}
					/>

					{anexo && (
						<div className="flex items-center gap-2 rounded border bg-muted/40 px-2 py-1.5 text-xs">
							<Paperclip className="size-3.5 shrink-0" aria-hidden />
							<span className="min-w-0 flex-1 truncate">{anexo.name}</span>
							<span className="shrink-0 text-muted-foreground">
								{(anexo.size / 1024 / 1024).toFixed(1)} MB
							</span>
							<button
								type="button"
								onClick={() => escolherAnexo(null)}
								aria-label="Remover anexo"
								className="shrink-0 rounded p-0.5 hover:bg-accent"
								disabled={sending}
							>
								<X className="size-3.5" aria-hidden />
							</button>
						</div>
					)}

					<input
						ref={inputArquivo}
						type="file"
						className="sr-only"
						data-testid="input-anexo"
						accept="image/jpeg,image/png,application/pdf,audio/*,.doc,.docx,.xls,.xlsx"
						onChange={(e) => escolherAnexo(e.target.files?.[0] ?? null)}
					/>

					<div className="flex justify-between gap-2">
						<Button
							size="sm"
							variant="outline"
							onClick={() => inputArquivo.current?.click()}
							disabled={sending}
						>
							<Paperclip className="size-4 mr-2" />
							Anexo
						</Button>
						<Button
							size="sm"
							onClick={anexo ? enviarAnexo : handleSendText}
							disabled={sending || (!anexo && !message.trim())}
						>
							<Send className="size-4 mr-2" />
							{sending ? "Enviando..." : anexo ? "Enviar anexo" : "Enviar"}
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
