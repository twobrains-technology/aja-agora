// Reenvia o convite de acesso ao painel — token novo, mais 7 dias, e-mail de novo.
//
// Run: npx tsx src/scripts/reenviar-convite.ts "email@dominio" ["outro@dominio" ...]
//
// Existe porque `/api/admin/attendants/[id]/resend-invite` só alcança quem tem
// role `attendant` (é o filtro do GET que alimenta a tela). Convite de `admin` ou
// `viewer` não aparece em tela nenhuma, então expirava sem que ninguém visse.
//
// SÓ reenvia para convite PENDENTE (`invite_token` presente). Conta já ativa não
// entra aqui de propósito: gerar um token para quem já usa o painel é dar um
// caminho de trocar senha por e-mail, que é outro fluxo ("esqueci a senha") e
// merece outra decisão.

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { user as userTable } from "../db/schema";
import { sendEmail } from "../lib/email/sendgrid";
import { inviteEmailTemplate } from "../lib/email/templates/invite";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function reenviar(email: string) {
	const conta = await db.query.user.findFirst({ where: eq(userTable.email, email) });

	if (!conta) {
		console.log(`· ${email} — não existe, nada a reenviar`);
		return;
	}
	if (!conta.inviteToken) {
		console.log(
			`· ${email} — sem convite pendente (role ${conta.role}, ativa: ${conta.isActive}). ` +
				"Nada foi alterado: para quem já entrou, o caminho é a redefinição de senha.",
		);
		return;
	}

	const inviteToken = randomBytes(32).toString("hex");
	const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);

	await db
		.update(userTable)
		.set({ inviteToken, inviteExpiresAt, invitedAt: new Date() })
		.where(eq(userTable.id, conta.id));

	const appUrl = process.env.APP_URL ?? "http://localhost:3000";
	const link = `${appUrl}/onboarding/set-password?token=${inviteToken}`;

	let avisoEmail = "e-mail enviado";
	try {
		const tpl = inviteEmailTemplate({ name: conta.name, link, expiresAt: inviteExpiresAt });
		await sendEmail({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text });
	} catch (err) {
		avisoEmail = `E-MAIL NÃO SAIU: ${err instanceof Error ? err.message : "erro desconhecido"}`;
	}

	console.log(`✓ ${email} (${conta.name}) — role ${conta.role}, ${avisoEmail}`);
	console.log(`  link: ${link}`);
	console.log(`  expira: ${inviteExpiresAt.toLocaleString("pt-BR")}`);
}

async function main() {
	const emails = process.argv.slice(2);
	if (emails.length === 0) {
		console.error('Uso: tsx src/scripts/reenviar-convite.ts "email" ["outro-email" ...]');
		process.exit(1);
	}
	// Em série: o token velho de cada conta morre no instante em que o novo é
	// gravado, e um erro no meio não deve deixar metade das contas sem convite
	// válido e sem e-mail novo.
	for (const email of emails) {
		await reenviar(email.trim());
	}
	process.exit(0);
}

main().catch((err) => {
	console.error("Falhou:", err);
	process.exit(1);
});
