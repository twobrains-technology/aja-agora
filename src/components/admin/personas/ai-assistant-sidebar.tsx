"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Loader2, Send, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
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

	const { messages, sendMessage, status } = useChat({ transport });
	const [input, setInput] = useState("");
	const [diffStates, setDiffStates] = useState<Record<string, DiffCardState>>(
		{},
	);

	function applyPatch(patch: PersonaPatch, key: string) {
		if (patch.kind === "voiceTone") {
			formMethods.setValue("voiceTone", patch.after, { shouldDirty: true });
		}
		if (patch.kind === "example.add") {
			const cur = (formMethods.getValues("examples") as unknown[]) ?? [];
			formMethods.setValue("examples", [...cur, patch.after], {
				shouldDirty: true,
			});
		}
		if (patch.kind === "example.remove") {
			const cur =
				(formMethods.getValues("examples") as Array<{ id: string }>) ?? [];
			formMethods.setValue(
				"examples",
				cur.filter((e) => e.id !== patch.targetId),
				{ shouldDirty: true },
			);
		}
		if (patch.kind === "forbiddenTopic.add") {
			const cur =
				(formMethods.getValues("forbiddenTopics") as unknown[]) ?? [];
			formMethods.setValue("forbiddenTopics", [...cur, patch.after], {
				shouldDirty: true,
			});
		}
		if (patch.kind === "forbiddenTopic.remove") {
			const cur =
				(formMethods.getValues("forbiddenTopics") as Array<{ id: string }>) ??
				[];
			formMethods.setValue(
				"forbiddenTopics",
				cur.filter((e) => e.id !== patch.targetId),
				{ shouldDirty: true },
			);
		}
		if (patch.kind === "handoffTrigger.add") {
			const cur =
				(formMethods.getValues("handoffTriggers") as unknown[]) ?? [];
			formMethods.setValue("handoffTriggers", [...cur, patch.after], {
				shouldDirty: true,
			});
		}
		if (patch.kind === "handoffTrigger.remove") {
			const cur =
				(formMethods.getValues("handoffTriggers") as Array<{ id: string }>) ??
				[];
			formMethods.setValue(
				"handoffTriggers",
				cur.filter((e) => e.id !== patch.targetId),
				{ shouldDirty: true },
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
		<aside className="flex h-full flex-col bg-zinc-50 border-l">
			<header className="border-b px-4 py-3 bg-white">
				<h2 className="font-medium flex items-center gap-2">
					<Sparkles className="size-4 text-violet-600" />
					AI Assistant
				</h2>
				<p className="text-xs text-zinc-500 mt-0.5">
					Descreva o que quer ajustar. Eu proponho — você decide.
				</p>
			</header>

			<ScrollArea className="flex-1 px-4 py-3">
				{messages.length === 0 && (
					<div className="text-xs text-zinc-500 italic">
						Exemplos:
						<ul className="list-disc list-inside mt-1 space-y-0.5">
							<li>"deixa menos formal"</li>
							<li>"adiciona exemplo de quando perguntam preço"</li>
							<li>"bloqueia perguntas sobre comissão de corretor"</li>
						</ul>
					</div>
				)}

				{messages.map((m) => (
					<div key={m.id} className="mb-3 space-y-1">
						<div className="text-[10px] font-semibold uppercase text-zinc-400">
							{m.role === "user" ? "Você" : "Assistente"}
						</div>
						{m.parts?.map((part, i) => {
							if (part.type === "text") {
								return (
									<div
										// biome-ignore lint/suspicious/noArrayIndexKey: parts não têm id
										key={`${m.id}-text-${i}`}
										className="text-sm whitespace-pre-wrap"
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
											className="text-xs text-amber-700 bg-amber-50 rounded p-2"
										>
											Proposta rejeitada pelo servidor:{" "}
											<span className="font-medium">{output.error}</span>
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
											className="text-sm rounded bg-blue-50 p-2 text-blue-900"
										>
											❓ {output.question}
										</div>
									);
								}
							}
							return null;
						})}
					</div>
				))}

				{isStreaming && (
					<div className="flex items-center gap-2 text-xs text-zinc-500">
						<Loader2 className="size-3 animate-spin" />
						pensando…
					</div>
				)}
			</ScrollArea>

			<form
				onSubmit={handleSend}
				className="border-t bg-white p-3 space-y-2"
			>
				<Textarea
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder="Ex: deixa o tom menos formal..."
					disabled={isStreaming}
					rows={3}
					className="text-sm resize-none"
				/>
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
