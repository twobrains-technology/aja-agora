"use client";

import { ChatLayout } from "@/components/chat/chat-layout";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { useChat } from "@/lib/chat/use-chat";

export default function ChatPage() {
  const { messages, isStreaming, sendMessage, retry, reset, error } = useChat();

  return (
    <ChatLayout onReset={reset} error={error}>
      <MessageList messages={messages} isStreaming={isStreaming} onRetry={retry} />
      <ChatInput onSend={sendMessage} isStreaming={isStreaming} />
    </ChatLayout>
  );
}
