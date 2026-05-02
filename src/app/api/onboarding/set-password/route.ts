import { hashPassword } from "better-auth/crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { account, user as userTable } from "@/db/schema";
import { setPasswordSchema } from "@/lib/validations/attendant";

/**
 * GET /api/onboarding/set-password?token=<hex>
 * Validates the invite token and returns minimal user info for the onboarding form.
 * Returns 410 Gone when the token is unknown or expired (the link is no longer usable).
 */
export async function GET(req: Request) {
	const url = new URL(req.url);
	const token = url.searchParams.get("token");

	if (!token) {
		return Response.json({ error: "Token ausente" }, { status: 400 });
	}

	const attendant = await db.query.user.findFirst({
		where: and(eq(userTable.inviteToken, token), gt(userTable.inviteExpiresAt, new Date())),
		columns: { email: true, name: true },
	});

	if (!attendant) {
		return Response.json({ error: "Link invalido ou expirado" }, { status: 410 });
	}

	return Response.json({ email: attendant.email, name: attendant.name });
}

/**
 * POST /api/onboarding/set-password
 * Body: { token, password }
 * Consumes the invite token, sets the user password, activates the account.
 * Does NOT create a session — the client signs in after success via authClient.
 */
export async function POST(req: Request) {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "JSON invalido" }, { status: 400 });
	}

	const parsed = setPasswordSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Dados invalidos", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	const { token, password } = parsed.data;

	const attendant = await db.query.user.findFirst({
		where: and(eq(userTable.inviteToken, token), gt(userTable.inviteExpiresAt, new Date())),
	});

	if (!attendant) {
		return Response.json({ error: "Link invalido ou expirado" }, { status: 410 });
	}

	const hashed = await hashPassword(password);

	const updated = await db
		.update(account)
		.set({ password: hashed })
		.where(and(eq(account.userId, attendant.id), eq(account.providerId, "credential")))
		.returning({ id: account.id });

	if (updated.length === 0) {
		console.error(
			`[onboarding] No credential account for user ${attendant.id} — signUpEmail did not create one`,
		);
		return Response.json({ error: "Falha ao atualizar credenciais" }, { status: 500 });
	}

	await db
		.update(userTable)
		.set({
			emailVerified: true,
			isActive: true,
			inviteToken: null,
			inviteExpiresAt: null,
		})
		.where(eq(userTable.id, attendant.id));

	return Response.json({ success: true, email: attendant.email });
}
