// FIX-46 — GET /api/chat/resume: retomada same-device pela cookie `aja_uid`.
// Sem cookie ou sem conversa retomável → { conversation: null } (primeira vez).
// Sem cache (no-store) — o estado da conversa muda a cada turno.

import { getResumableConversation } from "@/lib/chat/resume";
import { COOKIE_NAME } from "@/lib/memory/identity";

export async function GET(req: Request) {
	const cookieHeader = req.headers.get("cookie") ?? "";
	const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
	const cookieValue = match ? decodeURIComponent(match[1]) : null;

	const conversation = await getResumableConversation(cookieValue);

	return Response.json({ conversation }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
