// Cria acesso ao painel, pelo mesmo caminho do convite que os atendentes já
// usam: ninguém digita senha pela pessoa.
//
// Run: npx tsx src/scripts/criar-acesso.ts "email@dominio" "Nome Completo" [papel]
//
// O papel é opcional e vale `admin` quando omitido — era o único que este script
// sabia criar até 2026-08-17. A tela de Atendentes cobre o `attendant` e a de
// Atendentes de mesa cobre o `mesa_externa`; `viewer` (leitura do painel, sem
// arrastar card) não tem tela nenhuma, e é para ele que este caminho existe.
//
// A senha de criação é descartável e jogada fora — quem define a de verdade é a
// pessoa, em /onboarding/set-password, no primeiro acesso. Até ela fazer isso a
// conta fica `isActive: false`, então o convite não vira uma conta aberta com
// senha que alguém digitou num chat.

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { user as userTable } from "../db/schema";
import { ROLES, type Role } from "../lib/admin/role-scope";
import { auth } from "../lib/auth";
import { sendEmail } from "../lib/email/sendgrid";
import { inviteEmailTemplate } from "../lib/email/templates/invite";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function ehRole(valor: string): valor is Role {
	return (ROLES as readonly string[]).includes(valor);
}

async function criarAcesso(email: string, nome: string, role: Role) {
	const jaExiste = await db.query.user.findFirst({ where: eq(userTable.email, email) });
	if (jaExiste) {
		console.log(`· ${email} — JÁ EXISTE (role: ${jaExiste.role}), nada foi alterado`);
		return;
	}

	const senhaDescartavel = randomBytes(32).toString("hex");
	const criado = await auth.api.signUpEmail({
		body: { email, password: senhaDescartavel, name: nome },
	});

	const inviteToken = randomBytes(32).toString("hex");
	const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);

	await db
		.update(userTable)
		.set({
			role,
			isActive: false,
			inviteToken,
			inviteExpiresAt,
			invitedAt: new Date(),
		})
		.where(eq(userTable.id, criado.user.id));

	const appUrl = process.env.APP_URL ?? "http://localhost:3000";
	const link = `${appUrl}/onboarding/set-password?token=${inviteToken}`;

	let avisoEmail = "e-mail enviado";
	try {
		const tpl = inviteEmailTemplate({ name: nome, link, expiresAt: inviteExpiresAt });
		await sendEmail({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text });
	} catch (err) {
		avisoEmail = `E-MAIL NÃO SAIU: ${err instanceof Error ? err.message : "erro desconhecido"}`;
	}

	console.log(`✓ ${email} (${nome}) — role ${role}, ${avisoEmail}`);
	console.log(`  link: ${link}`);
	console.log(`  expira: ${inviteExpiresAt.toLocaleString("pt-BR")}`);
}

async function main() {
	const [email, nome, roleBruta = "admin"] = process.argv.slice(2);
	if (!email || !nome) {
		console.error('Uso: tsx src/scripts/criar-acesso.ts "email" "Nome Completo" [papel]');
		console.error(`Papéis: ${ROLES.join(", ")} (padrão: admin)`);
		process.exit(1);
	}
	if (!ehRole(roleBruta)) {
		console.error(`Papel inválido: "${roleBruta}". Use um de: ${ROLES.join(", ")}`);
		process.exit(1);
	}
	await criarAcesso(email, nome, roleBruta);
	process.exit(0);
}

main().catch((err) => {
	console.error("Falhou:", err);
	process.exit(1);
});
