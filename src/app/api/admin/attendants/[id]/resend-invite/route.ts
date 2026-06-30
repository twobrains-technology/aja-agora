import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { sendEmail } from "@/lib/email/sendgrid";
import { inviteEmailTemplate } from "@/lib/email/templates/invite";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 2 * 60 * 1000;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error } = await requireRole("admin", "attendant");
	if (error) return error;

	const { id } = await params;

	const attendant = await db.query.user.findFirst({
		where: eq(userTable.id, id),
	});
	if (!attendant || attendant.role !== "attendant") {
		return Response.json({ error: "Atendente não encontrado" }, { status: 404 });
	}

	// Onboarding já concluído — não há porquê reenviar.
	if (attendant.emailVerified && !attendant.inviteToken) {
		return Response.json(
			{ error: "Atendente já ativou a conta. Não é necessário reenviar o convite." },
			{ status: 409 },
		);
	}

	// Cooldown para evitar spam de emails.
	if (attendant.invitedAt) {
		const elapsed = Date.now() - attendant.invitedAt.getTime();
		if (elapsed < RESEND_COOLDOWN_MS) {
			const remainingSec = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
			return Response.json(
				{
					error: `Convite enviado recentemente. Aguarde ${remainingSec}s antes de reenviar.`,
				},
				{ status: 429 },
			);
		}
	}

	const inviteToken = randomBytes(32).toString("hex");
	const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);
	const invitedAt = new Date();

	await db
		.update(userTable)
		.set({ inviteToken, inviteExpiresAt, invitedAt })
		.where(eq(userTable.id, id));

	const appUrl = process.env.APP_URL ?? "http://localhost:3000";
	const link = `${appUrl}/onboarding/set-password?token=${inviteToken}`;

	try {
		const tpl = inviteEmailTemplate({
			name: attendant.name,
			link,
			expiresAt: inviteExpiresAt,
		});
		await sendEmail({
			to: attendant.email,
			subject: tpl.subject,
			html: tpl.html,
			text: tpl.text,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "Erro desconhecido";
		console.error("[attendants] resend-invite sendEmail failed:", message);
		return Response.json({ error: `Falha ao reenviar convite: ${message}` }, { status: 500 });
	}

	return Response.json({ id, resentAt: invitedAt });
}
