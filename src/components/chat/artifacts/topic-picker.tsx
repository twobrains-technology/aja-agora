"use client";

import { ArrowLeft } from "lucide-react";
import { useChatContext } from "@/lib/chat/provider";
import type { TopicPickerPayload } from "@/lib/chat/types";

export function TopicPicker({ payload }: { payload: TopicPickerPayload }) {
	const { sendAction, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";

	const handleTopic = (topic: string) => {
		if (isStreaming) return;
		void sendAction({ kind: "interest", administradora: "topic-picker", label: topic }, topic);
	};

	const handleBack = () => {
		if (isStreaming) return;
		void sendAction(
			{ kind: "interest", administradora: "topic-picker", label: "voltar" },
			"voltar",
		);
	};

	return (
		<div className="w-full max-w-[340px] bg-card border border-border rounded-[12px] shadow-[var(--shadow-md)] p-[18px] flex flex-col gap-[13px]">
			{payload.prompt && (
				<p className="text-xs font-medium text-muted-foreground">{payload.prompt}</p>
			)}

			<div className="flex flex-wrap gap-2">
				{payload.topics.map((topic) => (
					<button
						key={topic}
						type="button"
						onClick={() => handleTopic(topic)}
						disabled={isStreaming}
						className="inline-flex items-center h-[30px] px-[12px] border border-[rgb(5_36_64/.4)] rounded-full bg-transparent text-xs font-semibold text-[var(--aja-ink)] cursor-pointer transition-colors hover:bg-[var(--aja-sand)] disabled:cursor-default disabled:opacity-50"
					>
						{topic}
					</button>
				))}
			</div>

			{payload.includeBackButton && (
				<button
					type="button"
					onClick={handleBack}
					disabled={isStreaming}
					data-testid="topic-picker-back"
					className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium text-muted-foreground cursor-pointer transition-colors hover:bg-muted hover:text-foreground self-start disabled:cursor-default disabled:opacity-50"
				>
					<ArrowLeft className="size-3.5" />
					Voltar
				</button>
			)}
		</div>
	);
}
