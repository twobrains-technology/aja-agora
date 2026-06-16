// FIX-47 — POST /api/chat/recover/verify: valida o OTP e, só então, devolve o
// DADO SENSÍVEL (propostas, links, CPF mascarado). Sem OTP válido → 401. É o gate
// anti-pretexting: telefone de terceiro NÃO revela dado sensível sem posse do
// número.

import { z } from "zod";
import { getRecoveredSession, verifyRecoveryOtp } from "@/lib/chat/recovery";

const schema = z.object({
	phone: z.string().trim().min(1),
	code: z
		.string()
		.trim()
		.regex(/^\d{6}$/),
});

export async function POST(req: Request) {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}
	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		return Response.json({ error: "phone and 6-digit code required" }, { status: 400 });
	}

	const verified = await verifyRecoveryOtp(parsed.data.phone, parsed.data.code);
	if (!verified) {
		return Response.json({ error: "Invalid or expired code" }, { status: 401 });
	}

	const session = await getRecoveredSession(verified.contactId);
	if (!session) {
		return Response.json({ error: "Contact not found" }, { status: 404 });
	}

	return Response.json({ recovered: session }, { headers: { "Cache-Control": "no-store" } });
}
