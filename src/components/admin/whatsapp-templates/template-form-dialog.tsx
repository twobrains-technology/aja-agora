"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
	CARROSSEL_QTD_CARDS,
	OBJETIVOS_DE_REMARKETING,
	QUICK_REPLY_PADRAO,
	TEMPLATE_CATEGORIES,
} from "@/lib/validations/whatsapp-template";
import type { WhatsappTemplate } from "./templates-table";
import { UploadDeArte } from "./upload-de-arte";

type Mode = "create" | "edit";

/** Os três modos de conteúdo do form. O carrossel é um modo, não um checkbox:
 * ele substitui header/botão de topo (os cards têm os seus). */
type ModoDeConteudo = "TEXT" | "IMAGE" | "CARROSSEL";

const MODOS: Array<{ valor: ModoDeConteudo; rotulo: string }> = [
	{ valor: "TEXT", rotulo: "Cabeçalho de texto" },
	{ valor: "IMAGE", rotulo: "Cabeçalho de imagem (arte)" },
	{ valor: "CARROSSEL", rotulo: "Carrossel de 3 cards" },
];

interface Props {
	mode: Mode;
	template?: WhatsappTemplate;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
}

const SNAKE_CASE = /^[a-z0-9_]+$/;

const CATEGORY_LABELS: Record<string, string> = {
	UTILITY: "Utilitário (confirmações, atualizações)",
	MARKETING: "Marketing (promoções, campanha)",
	AUTHENTICATION: "Autenticação (códigos)",
};

interface CardState {
	headerHandle: string;
	body: string;
	buttonText: string;
}

function handleDoComponente(componente?: { example?: Record<string, unknown> }): string {
	const handle = componente?.example?.header_handle;
	if (Array.isArray(handle) && handle.length > 0) return String(handle[0] ?? "");
	return "";
}

/** Reconstrói o estado do form a partir dos componentes persistidos (edição). */
function extractParts(t?: WhatsappTemplate) {
	const comps = t?.components ?? [];
	const header = comps.find((c) => c.type === "HEADER");
	const body = comps.find((c) => c.type === "BODY");
	const footer = comps.find((c) => c.type === "FOOTER");
	const buttons = comps.find((c) => c.type === "BUTTONS");
	const carousel = comps.find((c) => c.type === "CAROUSEL");

	const cards: CardState[] = (carousel?.cards ?? []).map((card) => {
		const componentes = card.components ?? [];
		const cardHeader = componentes.find((c) => c.type === "HEADER");
		const cardBody = componentes.find((c) => c.type === "BODY");
		const cardButtons = componentes.find((c) => c.type === "BUTTONS");
		const primeiroBotao = (cardButtons?.buttons ?? [])[0];
		return {
			headerHandle: handleDoComponente(cardHeader),
			body: cardBody?.text ?? "",
			buttonText: primeiroBotao?.text ? String(primeiroBotao.text) : "",
		};
	});

	const modo: ModoDeConteudo =
		cards.length > 0 ? "CARROSSEL" : header?.format === "IMAGE" ? "IMAGE" : "TEXT";

	const primeiroBotao = (buttons?.buttons ?? [])[0];

	const usageKey = t?.usageKey ?? "";
	const objetivo = OBJETIVOS_DE_REMARKETING.find((o) => o.usageKey === usageKey)?.valor ?? "";

	return {
		objetivo,
		usageKey,
		metaName: t?.metaName ?? "",
		category: (t?.category ?? "MARKETING") as string,
		language: t?.language ?? "pt_BR",
		modo,
		header: modo === "TEXT" ? (header?.text ?? "") : "",
		headerHandle: header?.format === "IMAGE" ? handleDoComponente(header) : "",
		body: body?.text ?? t?.bodyPreview ?? "",
		footer: footer?.text ?? "",
		quickReplyAtivo: (buttons?.buttons?.length ?? 0) > 0 || false,
		quickReplyText: primeiroBotao?.text ? String(primeiroBotao.text) : QUICK_REPLY_PADRAO,
		carousel:
			cards.length > 0
				? cards
				: Array.from({ length: CARROSSEL_QTD_CARDS }, () => ({
						headerHandle: "",
						body: "",
						buttonText: QUICK_REPLY_PADRAO,
					})),
	};
}

export function TemplateFormDialog({ mode, template, open, onOpenChange, onSuccess }: Props) {
	// Fora de DRAFT o conteúdo é imutável na Meta; só o vínculo (usageKey) é editável.
	const contentLocked = mode === "edit" && template?.status !== "DRAFT";

	const initial = useMemo(() => extractParts(template), [template]);

	const [values, setValues] = useState(initial);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		if (open) {
			setValues(initial);
			setErrors({});
			setSubmitError(null);
		}
	}, [open, initial]);

	function set<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
		setValues((v) => ({ ...v, [key]: value }));
	}

	function setCard(index: number, patch: Partial<CardState>) {
		setValues((v) => ({
			...v,
			carousel: v.carousel.map((card, i) => (i === index ? { ...card, ...patch } : card)),
		}));
	}

	// O objetivo preenche a chave canônica e o formato do conteúdo. Nada trava: o
	// operador pode mudar depois — mas o default já sai com a chave que o motor lê.
	function aplicarObjetivo(valor: string) {
		const objetivo = OBJETIVOS_DE_REMARKETING.find((o) => o.valor === valor);
		if (!objetivo) {
			set("objetivo", valor);
			return;
		}
		setValues((v) => ({
			...v,
			objetivo: valor,
			usageKey: objetivo.usageKey,
			category: "MARKETING",
			modo: objetivo.modo,
			quickReplyAtivo: true,
		}));
	}

	const objetivoSelecionado = OBJETIVOS_DE_REMARKETING.find((o) => o.valor === values.objetivo);

	const ehCampanha =
		values.modo === "CARROSSEL" || (values.modo === "IMAGE" && values.quickReplyAtivo);

	function montarPayload() {
		const botaoDeTopo =
			values.modo !== "CARROSSEL" && values.quickReplyAtivo
				? values.quickReplyText.trim() || QUICK_REPLY_PADRAO
				: undefined;

		return {
			usageKey: values.usageKey,
			metaName: values.metaName,
			category: values.category,
			language: values.language,
			headerFormat: values.modo === "IMAGE" ? "IMAGE" : "TEXT",
			header: values.modo === "TEXT" ? values.header : undefined,
			headerHandle: values.modo === "IMAGE" ? values.headerHandle : undefined,
			body: values.body,
			footer: values.footer,
			quickReplyText: botaoDeTopo,
			carousel:
				values.modo === "CARROSSEL"
					? values.carousel.map((card) => ({
							headerHandle: card.headerHandle,
							body: card.body,
							buttonText: card.buttonText.trim() || QUICK_REPLY_PADRAO,
						}))
					: undefined,
		};
	}

	function validate(): boolean {
		const next: Record<string, string> = {};
		if (values.usageKey.trim() && !SNAKE_CASE.test(values.usageKey.trim())) {
			next.usageKey = "Use apenas letras minúsculas, números e _ (snake_case)";
		}
		if (!contentLocked) {
			if (!values.metaName.trim()) next.metaName = "Obrigatório";
			else if (!SNAKE_CASE.test(values.metaName.trim()))
				next.metaName = "Use apenas letras minúsculas, números e _ (snake_case)";
			if (!values.category) next.category = "Obrigatório";
			if (!values.body.trim()) next.body = "O corpo (BODY) é obrigatório";

			if (values.modo === "IMAGE" && !values.headerHandle) {
				next.headerHandle = "Envie a arte do cabeçalho antes de criar o template.";
			}
			if (values.modo === "CARROSSEL") {
				values.carousel.forEach((card, i) => {
					if (!card.headerHandle) next[`card${i}`] = "Envie a arte deste card.";
					else if (!card.body.trim()) next[`card${i}`] = "Escreva o corpo deste card.";
				});
			}
			if (ehCampanha && values.category !== "MARKETING") {
				next.category =
					"Template com arte (imagem com botão, ou carrossel) precisa da categoria Marketing.";
			}
		}
		setErrors(next);
		return Object.keys(next).length === 0;
	}

	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		if (!validate()) return;
		setSubmitError(null);
		setSubmitting(true);

		try {
			// `template!` escondia o caso real de abrir em modo edição sem objeto
			// (a URL viraria .../undefined e o PATCH morreria em 404 silencioso).
			const editing = mode === "create" ? null : template;
			if (mode !== "create" && !editing) {
				setSubmitError("Não foi possível identificar o template a editar.");
				return;
			}
			const url = editing
				? `/api/admin/whatsapp/templates/${editing.id}`
				: "/api/admin/whatsapp/templates";
			const method = editing ? "PATCH" : "POST";

			// Fora de DRAFT: só o vínculo. Caso contrário: payload completo.
			const payload = contentLocked ? { usageKey: values.usageKey } : montarPayload();

			const res = await fetch(url, {
				method,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(body.error ?? `HTTP ${res.status}`);
			}

			onOpenChange(false);
			onSuccess();
		} catch (err) {
			setSubmitError(err instanceof Error ? err.message : String(err));
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{mode === "create" ? "Novo template" : "Editar template"}</DialogTitle>
					<DialogDescription>
						{contentLocked
							? "Este template já foi submetido à Meta — o conteúdo é imutável. Você pode ajustar apenas a chave de uso (usageKey)."
							: "O corpo aceita variáveis no formato {{1}}, {{2}}. A chave de uso (usageKey) liga este template a um ponto de disparo e pode ser definida agora ou depois."}
					</DialogDescription>
				</DialogHeader>

				<div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
					Conteúdo submetido não pode ser corrigido — mudança de copy exige um <strong>v2</strong> e
					uma nova aprovação da Meta.
				</div>

				<form onSubmit={onSubmit} className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="objetivo">Objetivo da campanha</Label>
						<Select
							value={values.objetivo}
							onValueChange={(v) => {
								if (v) aplicarObjetivo(v);
							}}
							disabled={submitting || contentLocked}
						>
							<SelectTrigger id="objetivo">
								<SelectValue placeholder="Selecione para preencher a chave canônica" />
							</SelectTrigger>
							<SelectContent>
								{OBJETIVOS_DE_REMARKETING.map((o) => (
									<SelectItem key={o.valor} value={o.valor}>
										{o.rotulo}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">
							Lista as chaves de uso canônicas que o motor lê. O motor escolhe o template pela chave
							— um nome fora desta lista só enfileira o toque e a campanha não sai.
						</p>
						{objetivoSelecionado && (
							<p className="text-xs text-muted-foreground">
								Arte esperada em <code>public/kv/remarketing/</code>:{" "}
								<span className="font-medium">{objetivoSelecionado.arte}</span>
							</p>
						)}
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="usageKey">Chave de uso (opcional)</Label>
						<Input
							id="usageKey"
							placeholder="Ex: confirmacao_contratacao"
							value={values.usageKey}
							onChange={(e) => set("usageKey", e.target.value)}
							disabled={submitting}
						/>
						{errors.usageKey && <p className="text-sm text-destructive">{errors.usageKey}</p>}
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="metaName">Nome na Meta</Label>
						<Input
							id="metaName"
							placeholder="Ex: aja_confirmacao_v1"
							value={values.metaName}
							onChange={(e) => set("metaName", e.target.value)}
							disabled={submitting || contentLocked}
						/>
						{errors.metaName && <p className="text-sm text-destructive">{errors.metaName}</p>}
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="category">Categoria</Label>
							<Select
								value={values.category}
								onValueChange={(v) => {
									if (v) set("category", v);
								}}
								disabled={submitting || contentLocked}
							>
								<SelectTrigger id="category">
									<SelectValue placeholder="Selecione" />
								</SelectTrigger>
								<SelectContent>
									{TEMPLATE_CATEGORIES.map((c) => (
										<SelectItem key={c} value={c}>
											{CATEGORY_LABELS[c] ?? c}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{errors.category && <p className="text-sm text-destructive">{errors.category}</p>}
						</div>

						<div className="space-y-1.5">
							<Label htmlFor="language">Idioma</Label>
							<Input
								id="language"
								placeholder="pt_BR"
								value={values.language}
								onChange={(e) => set("language", e.target.value)}
								disabled={submitting || contentLocked}
							/>
						</div>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="modo">Conteúdo do cabeçalho</Label>
						<Select
							value={values.modo}
							onValueChange={(v) => {
								if (v) set("modo", v as ModoDeConteudo);
							}}
							disabled={submitting || contentLocked}
						>
							<SelectTrigger id="modo">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{MODOS.map((m) => (
									<SelectItem key={m.valor} value={m.valor}>
										{m.rotulo}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{values.modo === "TEXT" && (
						<div className="space-y-1.5">
							<Label htmlFor="header">Cabeçalho de texto (opcional)</Label>
							<Input
								id="header"
								placeholder="Ex: Aja Agora"
								value={values.header}
								onChange={(e) => set("header", e.target.value)}
								disabled={submitting || contentLocked}
							/>
						</div>
					)}

					{values.modo === "IMAGE" && (
						<UploadDeArte
							id="headerHandle"
							rotulo="Arte do cabeçalho"
							handle={values.headerHandle}
							onHandle={(h) => set("headerHandle", h)}
							disabled={submitting || contentLocked}
						/>
					)}
					{values.modo === "IMAGE" && errors.headerHandle && (
						<p className="text-sm text-destructive">{errors.headerHandle}</p>
					)}

					<div className="space-y-1.5">
						<Label htmlFor="body">
							{values.modo === "CARROSSEL" ? "Texto de abertura (BODY)" : "Corpo (BODY)"}
						</Label>
						<Textarea
							id="body"
							rows={4}
							placeholder="Olá {{1}}, sua reserva de cota foi confirmada! 🎉"
							value={values.body}
							onChange={(e) => set("body", e.target.value)}
							disabled={submitting || contentLocked}
						/>
						{errors.body && <p className="text-sm text-destructive">{errors.body}</p>}
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="footer">Rodapé (opcional)</Label>
						<Input
							id="footer"
							placeholder="Ex: Time Aja Agora"
							value={values.footer}
							onChange={(e) => set("footer", e.target.value)}
							disabled={submitting || contentLocked}
						/>
					</div>

					{values.modo !== "CARROSSEL" && (
						<div className="space-y-2 rounded-md border p-3">
							<label className="flex items-center gap-2 text-sm font-medium">
								<input
									type="checkbox"
									checked={values.quickReplyAtivo}
									onChange={(e) => set("quickReplyAtivo", e.target.checked)}
									disabled={submitting || contentLocked}
									className="size-4"
								/>
								Incluir botão de resposta rápida (QUICK_REPLY)
							</label>
							{values.quickReplyAtivo && (
								<div className="space-y-1.5">
									<Label htmlFor="quickReplyText">Texto do botão</Label>
									<Input
										id="quickReplyText"
										placeholder={QUICK_REPLY_PADRAO}
										value={values.quickReplyText}
										onChange={(e) => set("quickReplyText", e.target.value)}
										disabled={submitting || contentLocked}
									/>
									<p className="text-xs text-muted-foreground">
										O texto do botão volta como resposta do cliente — use exatamente o que o agente
										espera ler (padrão: {QUICK_REPLY_PADRAO}).
									</p>
								</div>
							)}
						</div>
					)}

					{values.modo === "CARROSSEL" && (
						<div className="space-y-3">
							<p className="text-sm text-muted-foreground">
								Os {CARROSSEL_QTD_CARDS} cards do carrossel de autoridade. Cada card tem a própria
								arte, o próprio texto e o botão.
							</p>
							{values.carousel.map((card, index) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: o card É a posição (1/2/3), não há id natural e a ordem não muda
								<div key={`card-${index}`} className="space-y-3 rounded-md border p-3">
									<p className="text-sm font-medium">Card {index + 1}</p>
									<UploadDeArte
										id={`cardHandle-${index}`}
										rotulo={`Arte do card ${index + 1}`}
										handle={card.headerHandle}
										onHandle={(h) => setCard(index, { headerHandle: h })}
										disabled={submitting || contentLocked}
									/>
									<div className="space-y-1.5">
										<Label htmlFor={`cardBody-${index}`}>Corpo do card {index + 1}</Label>
										<Textarea
											id={`cardBody-${index}`}
											rows={2}
											maxLength={160}
											value={card.body}
											onChange={(e) => setCard(index, { body: e.target.value })}
											disabled={submitting || contentLocked}
										/>
									</div>
									<div className="space-y-1.5">
										<Label htmlFor={`cardButton-${index}`}>
											Texto do botão do card {index + 1}
										</Label>
										<Input
											id={`cardButton-${index}`}
											placeholder={QUICK_REPLY_PADRAO}
											value={card.buttonText}
											onChange={(e) => setCard(index, { buttonText: e.target.value })}
											disabled={submitting || contentLocked}
										/>
									</div>
									{errors[`card${index}`] && (
										<p className="text-sm text-destructive">{errors[`card${index}`]}</p>
									)}
								</div>
							))}
						</div>
					)}

					{submitError && (
						<div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
							{submitError}
						</div>
					)}

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={submitting}
						>
							Cancelar
						</Button>
						<Button type="submit" disabled={submitting}>
							{submitting ? "Salvando…" : mode === "create" ? "Criar rascunho" : "Salvar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
