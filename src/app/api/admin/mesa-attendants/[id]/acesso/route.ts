import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { mesaAttendants, user as userTable } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/email/sendgrid";
import { inviteEmailTemplate } from "@/lib/email/templates/invite";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const bodySchema = z.object({
	email: z.email("E-mail inválido"),
});

/**
 * Dá ACESSO AO PAINEL a um atendente de mesa que hoje só existe no WhatsApp.
 *
 * Cria a conta (role `mesa_externa`), amarra ao registro de `mesa_attendants` e
 * dispara o mesmo convite por e-mail que os atendentes internos recebem — a
 * pessoa define a própria senha em `/onboarding/set-password`. Ninguém, nem o
 * admin, digita senha por ela.
 *
 * Existe pra que criar esse acesso não dependa de alguém rodar script no
 * servidor: é operação de rotina do dono da operação, então mora na tela.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error, session } = await requireRole("admin");
	if (error) return error;

	const { id } = await params;

	let raw: unknown;
	try {
		raw = await req.json();
	} catch {
		return Response.json({ error: "JSON inválido" }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) {
		return Response.json(
			{ error: "Dados inválidos", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}
	const { email } = parsed.data;

	const [atendente] = await db
		.select()
		.from(mesaAttendants)
		.where(eq(mesaAttendants.id, id))
		.limit(1);
	if (!atendente) {
		return Response.json({ error: "Atendente de mesa não encontrado" }, { status: 404 });
	}
	if (atendente.userId) {
		return Response.json(
			{ error: "Esse atendente já tem acesso ao painel", reason: "acesso_ja_existe" },
			{ status: 409 },
		);
	}

	const emailEmUso = await db.query.user.findFirst({ where: eq(userTable.email, email) });
	if (emailEmUso) {
		return Response.json({ error: "Já existe um usuário com este e-mail" }, { status: 409 });
	}

	// A senha de criação é descartável: quem define a de verdade é a pessoa, pelo
	// link do convite. Só existe porque o better-auth exige uma no signup.
	const senhaDescartavel = randomBytes(32).toString("hex");
	let novoUserId: string;
	try {
		const criado = await auth.api.signUpEmail({
			body: { email, password: senhaDescartavel, name: atendente.nome },
		});
		novoUserId = criado.user.id;
	} catch (err) {
		const message = err instanceof Error ? err.message : "Erro desconhecido";
		console.error("[mesa-attendants/acesso] signUpEmail falhou:", message);
		return Response.json({ error: `Falha ao criar o acesso: ${message}` }, { status: 500 });
	}

	const inviteToken = randomBytes(32).toString("hex");
	const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);

	await db
		.update(userTable)
		.set({
			role: "mesa_externa",
			phone: atendente.whatsapp,
			// Inativo até a pessoa aceitar o convite e definir a senha.
			isActive: false,
			inviteToken,
			inviteExpiresAt,
			invitedAt: new Date(),
			invitedBy: session.user.id,
		})
		.where(eq(userTable.id, novoUserId));

	await db
		.update(mesaAttendants)
		.set({ userId: novoUserId })
		.where(eq(mesaAttendants.id, atendente.id));

	const appUrl = process.env.APP_URL ?? "http://localhost:3000";
	const link = `${appUrl}/onboarding/set-password?token=${inviteToken}`;
	try {
		const tpl = inviteEmailTemplate({ name: atendente.nome, link, expiresAt: inviteExpiresAt });
		await sendEmail({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Erro desconhecido";
		console.error("[mesa-attendants/acesso] sendEmail falhou:", message);
		// O acesso EXISTE mesmo sem o e-mail sair — dizer o contrário faria o admin
		// tentar criar de novo e bater no 409.
		return Response.json(
			{
				userId: novoUserId,
				email,
				warning: `Acesso criado, mas o e-mail de convite não saiu: ${message}`,
			},
			{ status: 201 },
		);
	}

	return Response.json({ userId: novoUserId, email }, { status: 201 });
}
