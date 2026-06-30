import { randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/email/sendgrid";
import { inviteEmailTemplate } from "@/lib/email/templates/invite";
import { createAttendantSchema } from "@/lib/validations/attendant";
import { invalidateAttendantCache } from "@/lib/whatsapp/proxy";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type AttendantStatus = "pending" | "active" | "inactive";

function deriveStatus(row: { isActive: boolean; inviteToken: string | null }): AttendantStatus {
	if (row.inviteToken) return "pending";
	if (!row.isActive) return "inactive";
	return "active";
}

export async function GET() {
	const { error } = await requireRole("admin", "attendant");
	if (error) return error;

	const rows = await db
		.select({
			id: userTable.id,
			name: userTable.name,
			email: userTable.email,
			phone: userTable.phone,
			isActive: userTable.isActive,
			inviteToken: userTable.inviteToken,
			invitedAt: userTable.invitedAt,
			createdAt: userTable.createdAt,
		})
		.from(userTable)
		.where(eq(userTable.role, "attendant"))
		.orderBy(desc(userTable.createdAt));

	const attendants = rows.map((row) => ({
		id: row.id,
		name: row.name,
		email: row.email,
		phone: row.phone,
		invitedAt: row.invitedAt,
		createdAt: row.createdAt,
		status: deriveStatus(row),
	}));

	return Response.json({ attendants });
}

export async function POST(req: Request) {
	// Criar atendente (envia convite + cria conta de login) é gestão de equipe — só admin.
	const { error, session } = await requireRole("admin");
	if (error) return error;

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "JSON inválido" }, { status: 400 });
	}

	const parsed = createAttendantSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Dados inválidos", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	const { name, email, phone } = parsed.data;

	// Ensure no user already exists with this email
	const existing = await db.query.user.findFirst({
		where: eq(userTable.email, email),
	});
	if (existing) {
		return Response.json({ error: "Já existe um usuário com este email" }, { status: 409 });
	}

	// Create user via better-auth (creates user + account rows with hashed password)
	const throwawayPassword = randomBytes(32).toString("hex");
	let createdUserId: string;
	try {
		const result = await auth.api.signUpEmail({
			body: { email, password: throwawayPassword, name },
		});
		createdUserId = result.user.id;
	} catch (err) {
		const message = err instanceof Error ? err.message : "Erro desconhecido";
		console.error("[attendants] signUpEmail failed:", message);
		return Response.json({ error: `Falha ao criar usuario: ${message}` }, { status: 500 });
	}

	// Generate invite token and update role/phone/status/invite fields
	const inviteToken = randomBytes(32).toString("hex");
	const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);
	const invitedAt = new Date();

	await db
		.update(userTable)
		.set({
			role: "attendant",
			phone,
			isActive: false,
			inviteToken,
			inviteExpiresAt,
			invitedAt,
			invitedBy: session!.user.id,
		})
		.where(eq(userTable.id, createdUserId));

	invalidateAttendantCache();

	// Send invite email
	const appUrl = process.env.APP_URL ?? "http://localhost:3000";
	const link = `${appUrl}/onboarding/set-password?token=${inviteToken}`;
	try {
		const tpl = inviteEmailTemplate({ name, link, expiresAt: inviteExpiresAt });
		await sendEmail({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Erro desconhecido";
		console.error("[attendants] sendEmail failed:", message);
		return Response.json(
			{
				id: createdUserId,
				warning: `Atendente criado, mas o email não foi enviado: ${message}. Use 'Reenviar convite'.`,
			},
			{ status: 201 },
		);
	}

	return Response.json(
		{
			id: createdUserId,
			name,
			email,
			phone,
			status: "pending" as AttendantStatus,
		},
		{ status: 201 },
	);
}
