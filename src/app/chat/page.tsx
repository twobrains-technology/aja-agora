// FIX-46 — retomada same-device. Server component lê o cookie `aja_uid`, busca a
// última conversa web ativa daquele cookie e hidrata o ChatProvider com
// initialConversationId + initialMessages. Sem cookie / sem conversa → primeira
// vez intacta (provider gera UUID novo, começa vazio).

import { cookies } from "next/headers";
import { ChatProvider } from "@/lib/chat/provider";
import { getResumableConversation } from "@/lib/chat/resume";
import type { AjaUIMessage } from "@/lib/chat/ui-message";
import { COOKIE_NAME } from "@/lib/memory/identity";
import { ChatPageContent } from "./chat-page-content";

export default async function ChatPage() {
	const cookieStore = await cookies();
	const cookieValue = cookieStore.get(COOKIE_NAME)?.value ?? null;
	const resumed = await getResumableConversation(cookieValue);

	const initialMessages = resumed?.messages.map(
		(m) =>
			({
				id: m.id,
				role: m.role,
				parts: [{ type: "text", text: m.content }],
			}) as AjaUIMessage,
	);

	return (
		<ChatProvider initialConversationId={resumed?.conversationId} initialMessages={initialMessages}>
			<ChatPageContent />
		</ChatProvider>
	);
}
