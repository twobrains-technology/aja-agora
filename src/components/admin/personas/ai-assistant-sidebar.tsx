"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Loader2, Send, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { PersonaPatch } from "@/lib/validations/persona-patch";
import { DiffCard, type DiffCardState } from "./diff-card";

type SidebarProps = {
	personaId: string;
	// biome-ignore lint/suspicious/noExplicitAny: form interno do shell tem shape próprio
	formMethods: UseFormReturn<any>;
};

/**
 * Sidebar persistente com chat de AI Assistant.
 * - Usa @ai-sdk/react useChat conectado a /api/admin/personas/[id]/assist
 * - Renderiza propose_patch tool outputs como DiffCard inline
 * - Aplicar = setValue no form parent com shouldDirty (não persiste no banco)
 */
export function AIAssistantSidebar({ personaId, formMethods }: SidebarProps) {
	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				api: `/api/admin/personas/${personaId}/assist`,
			}),
		[personaId],
	);

	const { messages, sendMessage, status, error, regenerate } = useChat({
		transport,
		onError: (err) => {
			console.error("[AIAssistantSidebar] chat error", err);
		},
	});
	const [input, setInput] = useState("");
	const [diffStates, setDiffStates] = useState<Record<string, DiffCardState>>(
		{},
	);

	function friendlyError(e: Error | undefined): string {
		if (!e) return "";
		const msg = e.message ?? "";
		if (/credit/i.test(msg))
			return "Sem crédito na API Anthropic. Avise o admin pra recarregar.";
		if (/rate.?limit|429/i.test(msg))
			return "Muitos pedidos seguidos. Espere uns segundos e tente de novo.";
		if (/401|unauthor/i.test(msg))
			return "Sessão expirou. Recarregue a página e faça login de novo.";
		if (/timeout|network|fetch/i.test(msg))
			return "Conexão caiu. Tente de novo.";
		return `Falhou: ${msg.slice(0, 200)}`;
	}

	function applyPatch(patch: PersonaPatch, key: string) {
		if (patch.kind === "voiceTone") {
			formMethods.setValue("voiceTone", patch.after, { shouldDirty: true, shouldValidate: true });
		}
		if (patch.kind === "example.add") {
			const cur = (formMethods.getValues("examples") as unknown[]) ?? [];
			formMethods.setValue("examples", [...cur, patch.after], {
				shouldDirty: true,
				shouldValidate: true,
			});
		}
		if (patch.kind === "example.remove") {
			const cur =
				(formMethods.getValues("examples") as Array<{ id: string }>) ?? [];
			formMethods.setValue(
				"examples",
				cur.filter((e) => e.id !== patch.targetId),
				{ shouldDirty: true, shouldValidate: true },
			);
		}
		if (patch.kind === "forbiddenTopic.add") {
			const cur =
				(formMethods.getValues("forbiddenTopics") as unknown[]) ?? [];
			formMethods.setValue("forbiddenTopics", [...cur, patch.after], {
				shouldDirty: true,
				shouldValidate: true,
			});
		}
		if (patch.kind === "forbiddenTopic.remove") {
			const cur =
				(formMethods.getValues("forbiddenTopics") as Array<{ id: string }>) ??
				[];
			formMethods.setValue(
				"forbiddenTopics",
				cur.filter((e) => e.id !== patch.targetId),
				{ shouldDirty: true, shouldValidate: true },
			);
		}
		if (patch.kind === "handoffTrigger.add") {
			const cur =
				(formMethods.getValues("handoffTriggers") as unknown[]) ?? [];
			formMethods.setValue("handoffTriggers", [...cur, patch.after], {
				shouldDirty: true,
				shouldValidate: true,
			});
		}
		if (patch.kind === "handoffTrigger.remove") {
			const cur =
				(formMethods.getValues("handoffTriggers") as Array<{ id: string }>) ??
				[];
			formMethods.setValue(
				"handoffTriggers",
				cur.filter((e) => e.id !== patch.targetId),
				{ shouldDirty: true, shouldValidate: true },
			);
		}
		setDiffStates((s) => ({ ...s, [key]: "applied" }));
	}

	function rejectPatch(key: string) {
		setDiffStates((s) => ({ ...s, [key]: "rejected" }));
	}

	function handleSend(e: React.FormEvent) {
		e.preventDefault();
		if (!input.trim() || status === "streaming") return;
		sendMessage({ text: input });
		setInput("");
	}

	const isStreaming = status === "streaming" || status === "submitted";

	return (
		<aside className="flex h-full min-h-0 flex-col bg-card overflow-hidden">
			<header className="border-b px-4 py-3 shrink-0">
				<h2 className="font-medium text-sm flex items-center gap-2 text-foreground">
					<Sparkles className="size-4 text-primary" />
					AI Assistant
				</h2>
				<p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
					Descreva o que quer ajustar — eu proponho, você decide.
				</p>
			</header>

			<ScrollArea className="flex-1 min-h-0">
				<div className="px-4 py-3 space-y-3 break-words">
					{messages.length === 0 && (
						<div className="text-xs text-muted-foreground">
							<p className="font-medium text-foreground/80 mb-2">
								Exemplos do que pedir:
							</p>
							<ul className="space-y-1.5">
								<li className="rounded-md bg-muted/50 px-2.5 py-1.5 border">
									"deixa o tom menos formal"
								</li>
								<li className="rounded-md bg-muted/50 px-2.5 py-1.5 border">
									"adiciona exemplo de quando perguntam preço"
								</li>
								<li className="rounded-md bg-muted/50 px-2.5 py-1.5 border">
									"bloqueia perguntas sobre comissão"
								</li>
							</ul>
						</div>
					)}

					{messages.map((m) => (
						<div key={m.id} className="space-y-1.5">
							<div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
								{m.role === "user" ? "Você" : "Assistente"}
							</div>
							{m.parts?.map((part, i) => {
								if (part.type === "text") {
									return (
										<div
											// biome-ignore lint/suspicious/noArrayIndexKey: parts não têm id
											key={`${m.id}-text-${i}`}
											className={cn(
												"text-sm whitespace-pre-wrap break-words leading-relaxed text-foreground",
												m.role === "user" &&
													"rounded-md bg-muted px-3 py-2",
											)}
										>
											{part.text}
										</div>
									);
								}
								if (part.type === "tool-propose_patch") {
									// biome-ignore lint/suspicious/noExplicitAny: tool part shape varia
									const output = (part as any).output;
									if (output?.ok) {
										const cardKey = `${m.id}-${i}`;
										return (
											<DiffCard
												key={cardKey}
												patch={output.patch}
												state={diffStates[cardKey] ?? "pending"}
												onApply={(p) => applyPatch(p, cardKey)}
												onReject={() => rejectPatch(cardKey)}
											/>
										);
									}
									if (output && !output.ok) {
										return (
											<div
												// biome-ignore lint/suspicious/noArrayIndexKey: parts não têm id
												key={`${m.id}-err-${i}`}
												className="text-xs rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-foreground"
											>
												<span className="block text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1">
													Proposta rejeitada
												</span>
												{output.error}
											</div>
										);
									}
								}
								if (part.type === "tool-ask_clarification") {
									// biome-ignore lint/suspicious/noExplicitAny: tool part shape varia
									const output = (part as any).output;
									if (output?.question) {
										return (
											<div
												// biome-ignore lint/suspicious/noArrayIndexKey: parts não têm id
												key={`${m.id}-q-${i}`}
												className="text-sm rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-foreground"
											>
												{output.question}
											</div>
										);
									}
								}
								return null;
							})}
						</div>
					))}

					{isStreaming && (
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<Loader2 className="size-3 animate-spin" />
							pensando…
						</div>
					)}

					{error && !isStreaming && (
						<div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs space-y-2">
							<div className="flex items-start gap-2 text-foreground">
								<span className="text-[10px] font-semibold uppercase tracking-wider text-destructive shrink-0 mt-0.5">
									Erro
								</span>
								<span className="break-words">{friendlyError(error)}</span>
							</div>
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="h-7 text-xs w-full"
								onClick={() => regenerate()}
							>
								Tentar de novo
							</Button>
						</div>
					)}
				</div>
			</ScrollArea>

			<form
				onSubmit={handleSend}
				className="border-t bg-card p-3 space-y-2 shrink-0"
			>
				<Textarea
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							handleSend(e);
						}
					}}
					placeholder="Ex: deixa o tom menos formal..."
					disabled={isStreaming}
					rows={3}
					maxLength={4000}
					className="text-sm resize-none bg-background max-h-32 overflow-y-auto break-words"
				/>
				<div className="flex items-center justify-between text-[10px] text-muted-foreground">
					<span>Enter envia · Shift+Enter quebra linha</span>
					<span>{input.length}/4000</span>
				</div>
				<Button
					type="submit"
					disabled={isStreaming || !input.trim()}
					className="w-full h-8"
					size="sm"
				>
					{isStreaming ? (
						<Loader2 className="size-3 animate-spin" />
					) : (
						<>
							<Send className="size-3" />
							Enviar
						</>
					)}
				</Button>
			</form>
		</aside>
	);
}
