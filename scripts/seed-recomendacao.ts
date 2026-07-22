// QA autônomo FRENTE 2 (2026-07-01) — semeia o estado exatamente no ponto em
// que o Passo 5 (recomendação) abriria, pulando o funil quebrado a montante
// (Passo 1 nome / Passo 3 identidade — território da FRENTE 1, ver
// docs/correcoes/inbox/2026-07-01-crossfrente-agente-mudo-captura-nome.md).
//
// A conversa nasce com nome + identidade + qualificação já completos e
// searchDispatched=false — o PRÓXIMO turno do usuário (ready_to_proceed/
// providing_info) dispara o gate "search" de verdade: busca REAL na Bevi,
// recommend_groups, present_recommendation_card, tudo ao vivo (§4.2.2 da
// skill qa-autonomo, "provisione o estado", estendido à TELA).
//
// Uso (dentro do container, nunca no host):
//   docker exec -e SEED_CPF=... -e SEED_CELULAR=... -e SEED_NOME=... \
//     aja-app-<workspace> pnpm exec tsx scripts/seed-recomendacao.ts
//
// Imprime o conversationId + o valor do cookie aja_uid em JSON (stdout) pra a
// spec Playwright consumir.

import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { attachContact } from "@/lib/contacts";
import { encryptIdentity } from "@/lib/conversation/identity";
import { normalizePhoneBR } from "@/lib/leads/phone";

async function main() {
	const cpf = process.env.SEED_CPF;
	const celularRaw = process.env.SEED_CELULAR;
	const nome = process.env.SEED_NOME ?? "Kairo";
	const creditMax = Number(process.env.SEED_CREDIT_MAX ?? "80000");
	const category = (process.env.SEED_CATEGORY ?? "auto") as "imovel" | "auto" | "moto" | "servicos";
	const channel = (process.env.SEED_CHANNEL ?? "web") as "web" | "whatsapp";

	if (!cpf || !celularRaw) {
		throw new Error(
			"SEED_CPF e SEED_CELULAR são obrigatórios (conta de teste real — nunca invente CPF).",
		);
	}

	// FIX-172: normaliza o DDI ("55") ANTES de cifrar — espelha o que o gate
	// "identify" real faz (route.ts) e o que a Bevi exige (DDD+número, 11
	// dígitos). A conta de teste no vault vem no formato E.164-like (com "55",
	// igual aparece no WhatsApp) — sem isso o contract-submit reproduz
	// "CELULAR inválido" só por causa do formato de SEED, não de um bug real.
	const celular = normalizePhoneBR(celularRaw) ?? celularRaw;

	const conversationId = randomUUID();
	const webCookie = `qa-e2e-frente2-${randomUUID()}`;
	const waId = channel === "whatsapp" ? `SIM-${randomUUID()}` : undefined;

	const identityEnc = encryptIdentity({ cpf, celular });

	const metadata = {
		currentPersona: category,
		currentCategory: category,
		experiencePrev: "first",
		qualifyConsented: true,
		consentOffered: true,
		identityCollected: true,
		identityEnc,
		qualifyAnswers: {
			creditMax,
			hasLance: "no",
			lanceEmbutido: false,
		},
		// Idempotency guards TODOS false/undefined — o próximo turno do usuário
		// dispara o gate "search" (busca real) do zero, exatamente como um
		// usuário que acabou de terminar a qualificação.
		searchDispatched: false,
		revealCompleted: false,
		simulatorOfferDispatched: false,
		decisionDispatched: false,
		maxStageReached: "qualificado",
		webCookie,
	};

	await db.insert(conversations).values({
		id: conversationId,
		channel,
		waId,
		status: "active",
		contactName: nome,
		metadata,
		isSimulated: true,
	});

	// Mensagens de contexto (texto puro) — só pra popular o histórico visível no
	// resume (que NÃO rehidrata artifacts por design, só texto) e passar o
	// limiar meaningfulProgress. O estado REAL que importa é o metadata acima.
	// (resume só existe no canal web — no WhatsApp o simulador lê o histórico
	// direto via /api/admin/simulator/sessions/:id, sem popup de retomada.)
	const seedMessages: Array<["user" | "assistant", string]> = [
		["user", `Oi, quero um ${category === "auto" ? "carro" : category} — ${nome}`],
		["assistant", `Perfeito, ${nome}! Vamos te ajudar a conquistar isso.`],
		["user", `Já participei de consórcio antes.`],
		["assistant", "Ótimo, então você já conhece a dinâmica. Vamos seguir."],
	];

	const { messages: messagesTable } = await import("@/db/schema");
	for (const [role, content] of seedMessages) {
		await db.insert(messagesTable).values({ conversationId, role, content, channel });
	}

	await db.insert(leads).values({
		conversationId,
		name: nome,
		phone: celular,
		stage: "qualificado",
		creditValue: String(creditMax),
		isSimulated: true,
	});

	const contactId = await attachContact({ conversationId, input: { cpf, phone: celular } });

	console.log(
		JSON.stringify({
			conversationId,
			webCookie,
			waId: waId ?? null,
			contactId,
			category,
			creditMax,
			channel,
		}),
	);
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
