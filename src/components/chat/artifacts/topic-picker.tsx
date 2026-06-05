"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
		<Card className="w-full max-w-sm">
			<CardContent className="space-y-3 pt-4">
				{payload.prompt && <p className="text-sm text-muted-foreground">{payload.prompt}</p>}
				<div className="flex flex-wrap gap-2">
					{payload.topics.map((topic) => (
						<Button
							key={topic}
							type="button"
							variant="outline"
							size="sm"
							onClick={() => handleTopic(topic)}
							disabled={isStreaming}
						>
							{topic}
						</Button>
					))}
				</div>
				{payload.includeBackButton && (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="gap-1"
						onClick={handleBack}
						disabled={isStreaming}
						data-testid="topic-picker-back"
					>
						<ArrowLeft className="size-4" />
						Voltar
					</Button>
				)}
			</CardContent>
		</Card>
	);
}
