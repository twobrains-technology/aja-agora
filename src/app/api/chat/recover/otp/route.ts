// FIX-47 — POST /api/chat/recover/otp: solicita OTP de posse pro PRÓPRIO número.
// Anti-enumeração: responde 200 sempre (não revela se o número existe além do
// campo `found`, que a UI usa pra orientar). devCode só ecoa em ambiente local.

import { z } from "zod";
import { requestRecoveryOtp } from "@/lib/chat/recovery";

const schema = z.object({ phone: z.string().trim().min(1) });

export async function POST(req: Request) {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}
	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		return Response.json({ error: "phone required" }, { status: 400 });
	}

	const result = await requestRecoveryOtp(parsed.data.phone);
	return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
