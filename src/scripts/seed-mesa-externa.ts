// Provisiona um ATENDENTE DE MESA COM LOGIN (role `mesa_externa`).
//
// Rodar:
//   MESA_EXTERNA_EMAIL=fulano@parceiro.com \
//   MESA_EXTERNA_PASSWORD=umaSenhaBoa \
//   MESA_EXTERNA_NOME="Fulano da Silva" \
//   MESA_EXTERNA_WHATSAPP=5562999998888 \
//   pnpm exec tsx src/scripts/seed-mesa-externa.ts
//
// Serve pra DEV/QA e pra desbloquear um acesso na unha. O caminho normal é a
// tela Admin → Atendentes de mesa → "Dar acesso ao painel".
//
// Idempotente: rodar de novo reaproveita a conta e o atendente já existentes e
// só garante o vínculo.

import { eq } from "drizzle-orm";
import { db } from "../db";
import { mesaAttendants, user } from "../db/schema";
import { auth } from "../lib/auth";
// Mesma normalização da rota de cadastro (E.164 sem '+'): o número aqui TEM que
// bater byte a byte com o que o roteamento do copiloto procura.
import { createMesaAttendantSchema } from "../lib/validations/mesa";

async function main() {
	const email = process.env.MESA_EXTERNA_EMAIL?.trim();
	const password = process.env.MESA_EXTERNA_PASSWORD;
	const nome = process.env.MESA_EXTERNA_NOME?.trim();
	const whatsappBruto = process.env.MESA_EXTERNA_WHATSAPP?.trim();

	if (!email || !password || !nome || !whatsappBruto) {
		console.error(
			"Faltam variáveis: MESA_EXTERNA_EMAIL, MESA_EXTERNA_PASSWORD, MESA_EXTERNA_NOME, MESA_EXTERNA_WHATSAPP",
		);
		process.exit(1);
	}
	if (password.length < 8) {
		console.error("MESA_EXTERNA_PASSWORD precisa de pelo menos 8 caracteres");
		process.exit(1);
	}

	// Número SIMULADO (`SIM-…`) pula a normalização E.164: ele não é telefone, é
	// a chave que roteia pelo bus do simulador em vez da Meta. O schema de
	// cadastro o rejeitaria — e é um caso legítimo (atendente sem número real
	// ainda, ou conta de teste).
	let whatsapp: string;
	if (whatsappBruto.startsWith("SIM-")) {
		whatsapp = whatsappBruto;
		console.log(`[aviso] ${whatsapp} é simulado: NÃO recebe WhatsApp real nem copiloto.`);
	} else {
		const validado = createMesaAttendantSchema.safeParse({ nome, whatsapp: whatsappBruto });
		if (!validado.success) {
			console.error(`Dados inválidos: ${JSON.stringify(validado.error.flatten().fieldErrors)}`);
			process.exit(1);
		}
		whatsapp = validado.data.whatsapp;
	}

	// 1. A conta de login.
	let userId: string;
	const [jaExiste] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
	if (jaExiste) {
		userId = jaExiste.id;
		console.log(`Conta já existia: ${email}`);
	} else {
		const criado = await auth.api.signUpEmail({ body: { email, password, name: nome } });
		userId = criado.user.id;
		console.log(`Conta criada: ${email}`);
	}

	// `input: false` no better-auth impede definir role no signup — é de propósito
	// (senão qualquer cadastro se autopromoveria). Aqui é o servidor quem grava.
	await db.update(user).set({ role: "mesa_externa" }).where(eq(user.id, userId));

	// 2. O atendente de mesa (o que o WhatsApp/copiloto já conhece).
	const [atendenteExistente] = await db
		.select({ id: mesaAttendants.id })
		.from(mesaAttendants)
		.where(eq(mesaAttendants.whatsapp, whatsapp));

	if (atendenteExistente) {
		await db
			.update(mesaAttendants)
			.set({ userId, isActive: true })
			.where(eq(mesaAttendants.id, atendenteExistente.id));
		console.log(`Atendente ${whatsapp} vinculado à conta.`);
	} else {
		await db.insert(mesaAttendants).values({ nome, whatsapp, userId, isActive: true });
		console.log(`Atendente ${nome} (${whatsapp}) criado e vinculado.`);
	}

	console.log(`\nPronto: ${email} entra no painel como mesa_externa e vê só os casos dele.`);
	process.exit(0);
}

main().catch((e) => {
	console.error("Falhou:", e);
	process.exit(1);
});
