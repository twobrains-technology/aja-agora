"use client";

import { ChatLayout } from "@/components/chat/chat-layout";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { useChat } from "@/lib/chat/use-chat";

export default function ChatPage() {
  const { messages, isStreaming, sendMessage, reset } = useChat();

  return (
    <ChatLayout onReset={reset}>
      <MessageList messages={messages} isStreaming={isStreaming} />
      <ChatInput onSend={sendMessage} isStreaming={isStreaming} />
    </ChatLayout>
  );
}
