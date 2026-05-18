"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { AutomationGraph } from "@/lib/automation/schema";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onApply: (
		graph: AutomationGraph,
		triggerType: "stage_changed" | "idle_in_stage" | "chat_event",
	) => void;
}

export function AutomationAiDialog({ open, onOpenChange, onApply }: Props) {
	const [prompt, setPrompt] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function generate() {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/admin/automations/ai-build", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ prompt }),
			});
			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as { message?: string };
				throw new Error(data.message ?? `HTTP ${res.status}`);
			}
			const data = (await res.json()) as {
				graph: AutomationGraph;
				triggerType: "stage_changed" | "idle_in_stage" | "chat_event";
			};
			onApply(data.graph, data.triggerType);
			setPrompt("");
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Sparkles className="size-4" /> Gerar automação com IA
					</DialogTitle>
					<DialogDescription>
						Descreva em linguagem natural o que você quer que aconteça. A IA gera o grafo e você
						pode ajustar visualmente depois.
					</DialogDescription>
				</DialogHeader>
				<Textarea
					rows={5}
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					placeholder='Ex: "Quando lead passar de qualificado pra em_negociacao, esperar 2 horas e enviar email com assunto Vamos conversar?"'
				/>
				{error ? <p className="text-sm text-destructive">{error}</p> : null}
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancelar
					</Button>
					<Button onClick={generate} disabled={loading || !prompt.trim()}>
						{loading ? "Gerando..." : "Gerar grafo"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
