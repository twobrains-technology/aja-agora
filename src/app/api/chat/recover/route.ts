// FIX-47 — POST /api/chat/recover: contexto LEVE por telefone/CPF (sem OTP).
// Livre porque é o que a pessoa já contou — NUNCA inclui CPF, proposta ou link.
// Opt-in: a UI só chama isto quando o usuário pede ("já comecei antes").

import { z } from "zod";
import { getLightContext } from "@/lib/chat/recovery";

const schema = z.object({
	phone: z.string().trim().min(1).optional(),
	cpf: z.string().trim().min(1).optional(),
});

export async function POST(req: Request) {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}
	const parsed = schema.safeParse(body);
	if (!parsed.success || (!parsed.data.phone && !parsed.data.cpf)) {
		return Response.json({ error: "phone or cpf required" }, { status: 400 });
	}

	const light = await getLightContext(parsed.data);
	return Response.json(light, { headers: { "Cache-Control": "no-store" } });
}
