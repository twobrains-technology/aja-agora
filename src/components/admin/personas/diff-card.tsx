"use client";

import { Check, Pencil, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { PersonaPatch } from "@/lib/validations/persona-patch";

export type DiffCardState = "pending" | "applied" | "rejected";

const KIND_LABEL: Record<PersonaPatch["kind"], string> = {
	voiceTone: "Tom de voz",
	"example.add": "+ Exemplo",
	"example.remove": "− Exemplo",
	"forbiddenTopic.add": "+ Tópico proibido",
	"forbiddenTopic.remove": "− Tópico proibido",
	"handoffTrigger.add": "+ Trigger de handoff",
	"handoffTrigger.remove": "− Trigger de handoff",
};

function describeAfter(patch: PersonaPatch): string {
	if (patch.kind === "voiceTone") return patch.after;
	if (patch.kind === "example.add") {
		return `Usuário: ${patch.after.userMessage}\n\nAgente: ${patch.after.assistantResponse}`;
	}
	if (patch.kind === "forbiddenTopic.add") {
		return `Tópico: ${patch.after.topic}\n\nResposta orientada: ${patch.after.responseWhenAsked}`;
	}
	if (patch.kind === "handoffTrigger.add") {
		return patch.after.condition;
	}
	return "";
}

/**
 * Constrói novo patch a partir do texto editado pelo admin.
 * Mantém kind, rationale, personaVersionSeen + atualiza o campo editável.
 *
 * Editar só faz sentido em patches com texto livre — voiceTone.after,
 * example.add.assistantResponse, forbiddenTopic.add.responseWhenAsked,
 * handoffTrigger.add.condition. Para *.remove e tópico do forbidden,
 * editar é desabilitado.
 */
function applyEdit(patch: PersonaPatch, edited: string): PersonaPatch {
	if (patch.kind === "voiceTone") {
		return { ...patch, after: edited };
	}
	if (patch.kind === "example.add") {
		return {
			...patch,
			after: { ...patch.after, assistantResponse: edited },
		};
	}
	if (patch.kind === "forbiddenTopic.add") {
		return {
			...patch,
			after: { ...patch.after, responseWhenAsked: edited },
		};
	}
	if (patch.kind === "handoffTrigger.add") {
		return { ...patch, after: { ...patch.after, condition: edited } };
	}
	return patch;
}

function canEdit(patch: PersonaPatch): boolean {
	return (
		patch.kind === "voiceTone" ||
		patch.kind === "example.add" ||
		patch.kind === "forbiddenTopic.add" ||
		patch.kind === "handoffTrigger.add"
	);
}

function initialEditText(patch: PersonaPatch): string {
	if (patch.kind === "voiceTone") return patch.after;
	if (patch.kind === "example.add") return patch.after.assistantResponse;
	if (patch.kind === "forbiddenTopic.add") return patch.after.responseWhenAsked;
	if (patch.kind === "handoffTrigger.add") return patch.after.condition;
	return "";
}

export function DiffCard({
	patch,
	state = "pending",
	onApply,
	onReject,
}: {
	patch: PersonaPatch;
	state?: DiffCardState;
	onApply: (p: PersonaPatch) => void;
	onReject: () => void;
}) {
	const [editing, setEditing] = useState(false);
	const [editText, setEditText] = useState(() => initialEditText(patch));

	const hasBefore = patch.kind === "voiceTone";
	const isRemove =
		patch.kind === "example.remove" ||
		patch.kind === "forbiddenTopic.remove" ||
		patch.kind === "handoffTrigger.remove";
	const editable = canEdit(patch);

	function handleSaveEdit() {
		const edited = applyEdit(patch, editText.trim());
		setEditing(false);
		onApply(edited);
	}

	function handleCancelEdit() {
		setEditText(initialEditText(patch));
		setEditing(false);
	}

	function handleStartEdit() {
		setEditText(initialEditText(patch));
		setEditing(true);
	}

	return (
		<Card
			className={cn(
				"border-l-4 transition-opacity gap-2 py-3",
				state === "applied" && "border-l-emerald-500 opacity-70",
				state === "rejected" && "border-l-muted-foreground/30 opacity-40",
				state === "pending" && "border-l-primary",
			)}
		>
			<CardHeader className="px-3 pb-1">
				<div className="flex items-start justify-between gap-2">
					<div className="space-y-1 min-w-0">
						<Badge variant="secondary" className="text-[10px] px-1.5 py-0">
							{KIND_LABEL[patch.kind]}
						</Badge>
						<CardTitle className="text-xs font-medium leading-snug text-foreground">
							{patch.rationale}
						</CardTitle>
					</div>
					{state === "applied" && (
						<Badge className="bg-emerald-600 hover:bg-emerald-600 text-[10px] shrink-0">
							✓ aplicado
						</Badge>
					)}
					{state === "rejected" && (
						<Badge variant="outline" className="text-muted-foreground text-[10px] shrink-0">
							✕ descartado
						</Badge>
					)}
				</div>
			</CardHeader>
			<CardContent className="space-y-2 text-xs px-3 pb-2">
				{hasBefore && "before" in patch && (
					<div className="rounded-md border border-destructive/20 bg-destructive/5 p-2 whitespace-pre-wrap break-words">
						<span className="block text-[10px] font-semibold text-destructive/80 mb-1 tracking-wide">
							ANTES
						</span>
						<span className="line-through text-foreground/70">{patch.before}</span>
					</div>
				)}
				{!isRemove && !editing && "after" in patch && (
					<div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2 whitespace-pre-wrap break-words text-foreground">
						<span className="block text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mb-1 tracking-wide">
							DEPOIS
						</span>
						{describeAfter(patch)}
					</div>
				)}
				{isRemove && "targetId" in patch && (
					<div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-foreground">
						<span className="block text-[10px] font-semibold text-amber-600 dark:text-amber-400 mb-1 tracking-wide">
							REMOVER
						</span>
						Item id <code className="text-[11px] text-muted-foreground">{patch.targetId}</code>
					</div>
				)}
				{editing && (
					<div className="space-y-1">
						<span className="block text-[10px] font-semibold text-primary tracking-wide">
							EDITANDO
						</span>
						<Textarea
							value={editText}
							onChange={(e) => setEditText(e.target.value)}
							rows={4}
							className="text-xs resize-none bg-background"
							aria-label="Editar texto da proposta"
						/>
					</div>
				)}
				{state === "pending" && !editing && (
					<div className="flex gap-2 pt-1">
						<Button
							size="sm"
							onClick={() => onApply(patch)}
							className="h-7 text-xs"
						>
							<Check className="size-3" />
							Aplicar
						</Button>
						{editable && (
							<Button
								size="sm"
								variant="outline"
								onClick={handleStartEdit}
								className="h-7 text-xs"
							>
								<Pencil className="size-3" />
								Editar
							</Button>
						)}
						<Button
							size="sm"
							variant="ghost"
							onClick={onReject}
							className="h-7 text-xs"
						>
							<X className="size-3" />
							Descartar
						</Button>
					</div>
				)}
				{state === "pending" && editing && (
					<div className="flex gap-2 pt-1">
						<Button
							size="sm"
							onClick={handleSaveEdit}
							disabled={!editText.trim()}
							className="h-7 text-xs"
						>
							<Check className="size-3" />
							Salvar
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={handleCancelEdit}
							className="h-7 text-xs"
						>
							<X className="size-3" />
							Cancelar
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
