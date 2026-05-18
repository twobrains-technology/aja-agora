"use client";

import { useEffect, useEffect as useEffectStrict, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { STAGE_ORDER } from "@/lib/admin/lead-stages";

type Node = {
	id: string;
	data: { nodeType: string; config: Record<string, unknown>; label: string };
};

interface Props {
	node: Node | null;
	onClose: () => void;
	onSave: (config: Record<string, unknown>) => void;
}

export function AutomationNodeConfigSheet({ node, onClose, onSave }: Props) {
	const [config, setConfig] = useState<Record<string, unknown>>({});
	const [templates, setTemplates] = useState<Array<{ name: string; metaStatus: string }>>([]);

	useEffect(() => {
		if (node) setConfig({ ...node.data.config });
	}, [node]);

	useEffectStrict(() => {
		if (node?.data.nodeType === "action.send_whatsapp") {
			fetch("/api/admin/whatsapp-templates")
				.then(async (r) => {
					if (!r.ok) return;
					const data = (await r.json()) as {
						templates: Array<{ name: string; metaStatus: string }>;
					};
					setTemplates(data.templates);
				})
				.catch(() => {});
		}
	}, [node]);

	if (!node) return null;
	const type = node.data.nodeType;

	return (
		<Sheet open={Boolean(node)} onOpenChange={(open) => !open && onClose()}>
			<SheetContent className="w-full max-w-md sm:max-w-lg overflow-y-auto">
				<SheetHeader>
					<SheetTitle>{node.data.label}</SheetTitle>
					<SheetDescription>
						Configure este nó. Os valores são validados ao salvar.
					</SheetDescription>
				</SheetHeader>
				<div className="space-y-3 p-4">
					{renderConfigForm(type, config, setConfig, templates)}
					<div className="flex justify-end gap-2 pt-2">
						<Button variant="outline" onClick={onClose}>
							Cancelar
						</Button>
						<Button onClick={() => onSave(config)}>Salvar nó</Button>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}

function renderConfigForm(
	type: string,
	config: Record<string, unknown>,
	setConfig: (c: Record<string, unknown>) => void,
	templates: Array<{ name: string; metaStatus: string }>,
) {
	if (type === "trigger.stage_changed") {
		const cfg = config as { fromStages?: string[]; toStages?: string[] };
		return (
			<>
				<div className="space-y-1">
					<Label>To stages (separados por vírgula)</Label>
					<Input
						value={(cfg.toStages ?? []).join(",")}
						onChange={(e) =>
							setConfig({
								...cfg,
								toStages: e.target.value
									.split(",")
									.map((s) => s.trim())
									.filter(Boolean),
							})
						}
						placeholder="qualificado, em_negociacao"
					/>
					<p className="text-xs text-muted-foreground">
						Valores válidos: {STAGE_ORDER.join(", ")}.
					</p>
				</div>
				<div className="space-y-1">
					<Label>From stages (opcional)</Label>
					<Input
						value={(cfg.fromStages ?? []).join(",")}
						onChange={(e) =>
							setConfig({
								...cfg,
								fromStages: e.target.value
									.split(",")
									.map((s) => s.trim())
									.filter(Boolean),
							})
						}
					/>
				</div>
			</>
		);
	}

	if (type === "trigger.idle_in_stage") {
		const cfg = config as { stage?: string; durationMs?: number };
		return (
			<>
				<div className="space-y-1">
					<Label>Stage</Label>
					<Select
						value={cfg.stage ?? "qualificado"}
						onValueChange={(v) => setConfig({ ...cfg, stage: v })}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{STAGE_ORDER.map((s) => (
								<SelectItem key={s} value={s}>
									{s}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-1">
					<Label>Duração (horas)</Label>
					<Input
						type="number"
						min={1}
						value={Math.round((cfg.durationMs ?? 86_400_000) / 3600_000)}
						onChange={(e) =>
							setConfig({
								...cfg,
								durationMs: Math.max(1, Number(e.target.value)) * 3600_000,
							})
						}
					/>
				</div>
			</>
		);
	}

	if (type === "condition.has_field") {
		const cfg = config as { field?: string; op?: string };
		return (
			<>
				<div className="space-y-1">
					<Label>Campo</Label>
					<Select
						value={cfg.field ?? "email"}
						onValueChange={(v) => setConfig({ ...cfg, field: v })}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="email">email</SelectItem>
							<SelectItem value="phone">phone</SelectItem>
							<SelectItem value="name">name</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-1">
					<Label>Operador</Label>
					<Select value={cfg.op ?? "is_set"} onValueChange={(v) => setConfig({ ...cfg, op: v })}>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="is_set">is_set (preenchido)</SelectItem>
							<SelectItem value="is_empty">is_empty (vazio)</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</>
		);
	}

	if (type === "action.send_whatsapp") {
		const cfg = config as {
			mode?: "template" | "free_text";
			templateName?: string;
			params?: Record<string, string>;
			text?: string;
		};
		const approved = templates.filter((t) => t.metaStatus === "APPROVED");
		return (
			<>
				<div className="space-y-1">
					<Label>Modo</Label>
					<Select
						value={cfg.mode ?? "template"}
						onValueChange={(v) =>
							setConfig({
								mode: v,
								templateName: v === "template" ? "" : undefined,
								params: v === "template" ? {} : undefined,
								text: v === "free_text" ? "" : undefined,
							} as Record<string, unknown>)
						}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="template">Template aprovado</SelectItem>
							<SelectItem value="free_text">Texto livre (só dentro de 24h)</SelectItem>
						</SelectContent>
					</Select>
					<p className="text-xs text-muted-foreground">
						Texto livre só funciona se o lead respondeu nas últimas 24h.
					</p>
				</div>
				{cfg.mode === "template" ? (
					<div className="space-y-1">
						<Label>Template (APPROVED)</Label>
						<Select
							value={cfg.templateName ?? ""}
							onValueChange={(v) => setConfig({ ...cfg, templateName: v })}
						>
							<SelectTrigger>
								<SelectValue placeholder="Selecione um template" />
							</SelectTrigger>
							<SelectContent>
								{approved.length === 0 ? (
									<SelectItem value="__none__" disabled>
										Nenhum template APPROVED disponível
									</SelectItem>
								) : (
									approved.map((t) => (
										<SelectItem key={t.name} value={t.name}>
											{t.name}
										</SelectItem>
									))
								)}
							</SelectContent>
						</Select>
					</div>
				) : (
					<div className="space-y-1">
						<Label>Texto</Label>
						<Textarea
							value={cfg.text ?? ""}
							onChange={(e) => setConfig({ ...cfg, text: e.target.value })}
							rows={4}
							placeholder="Pode usar {{lead.name}}"
						/>
					</div>
				)}
			</>
		);
	}

	if (type === "action.send_email") {
		const cfg = config as { subject?: string; html?: string };
		return (
			<>
				<div className="space-y-1">
					<Label>Assunto</Label>
					<Input
						value={cfg.subject ?? ""}
						onChange={(e) => setConfig({ ...cfg, subject: e.target.value })}
					/>
				</div>
				<div className="space-y-1">
					<Label>HTML</Label>
					<Textarea
						rows={8}
						value={cfg.html ?? ""}
						onChange={(e) => setConfig({ ...cfg, html: e.target.value })}
					/>
				</div>
			</>
		);
	}

	if (type === "action.move_to_stage") {
		const cfg = config as { stage?: string };
		return (
			<div className="space-y-1">
				<Label>Stage de destino</Label>
				<Select
					value={cfg.stage ?? "qualificado"}
					onValueChange={(v) => setConfig({ ...cfg, stage: v })}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{STAGE_ORDER.map((s) => (
							<SelectItem key={s} value={s}>
								{s}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		);
	}

	if (type === "action.add_note") {
		const cfg = config as { text?: string };
		return (
			<div className="space-y-1">
				<Label>Texto da nota</Label>
				<Textarea
					rows={4}
					value={cfg.text ?? ""}
					onChange={(e) => setConfig({ ...cfg, text: e.target.value })}
				/>
			</div>
		);
	}

	if (type === "wait") {
		const cfg = config as { durationMs?: number };
		return (
			<div className="space-y-1">
				<Label>Esperar (minutos)</Label>
				<Input
					type="number"
					min={1}
					value={Math.round((cfg.durationMs ?? 60_000) / 60_000)}
					onChange={(e) => setConfig({ durationMs: Math.max(1, Number(e.target.value)) * 60_000 })}
				/>
			</div>
		);
	}

	return <p className="text-sm text-muted-foreground">Nada pra configurar neste nó.</p>;
}
