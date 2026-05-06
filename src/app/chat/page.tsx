"use client";

import { ChatInput } from "@/components/chat/chat-input";
import { ChatLayout } from "@/components/chat/chat-layout";
import { MessageList } from "@/components/chat/message-list";
import { ChatProvider, useChatContext } from "@/lib/chat/provider";

export default function ChatPage() {
	return (
		<ChatProvider>
			<ChatPageContent />
		</ChatProvider>
	);
}

function ChatPageContent() {
	const { messages, status, regenerate, reset, error } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";

	return (
		<ChatLayout onReset={reset} error={error?.message ?? null}>
			<MessageList
				messages={messages}
				isStreaming={isStreaming}
				hasError={!!error}
				onRetry={regenerate}
			/>
			<ChatInput isStreaming={isStreaming} />
		</ChatLayout>
	);
}
