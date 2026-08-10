// Semeia uma CONVERSA REALISTA pra exercitar a tela de atendimento.
//
// Rodar (dentro do container, que tem as envs):
//   docker exec aja-app-main pnpm exec tsx src/scripts/seed-conversa-atendimento.ts
//
// Por que existe: a tela de atendimento só mostra o que ela é com histórico de
// verdade — bolhas dos dois lados, um anexo, um template de retomada marcado, e
// uma janela de 24h num estado escolhido. Testar com duas mensagens soltas não
// revela nada (rolagem, agrupamento, selo de template, âncora do rodapé).
//
// Idempotente: reusa a conversa pelo waId e recria as mensagens.

import { eq } from "drizzle-orm";
import { db } from "../db";
import { contacts, conversations, leads, messages } from "../db/schema";

const WA_ID = "5562988887777";
const NOME = "Helena Duarte";

/** Minutos atrás → timestamp. O histórico precisa de tempo passando entre as
 *  falas, senão tudo aparece com o mesmo horário e a conversa não se lê. */
function faz(minutos: number): Date {
	return new Date(Date.now() - minutos * 60_000);
}

const ROTEIRO: Array<{
	role: "user" | "assistant";
	content: string;
	min: number;
	templateName?: string;
	mediaType?: string;
	mediaFilename?: string;
}> = [
	{ role: "user", content: "Oi! Vi o anúncio de vocês sobre consórcio", min: 4300 },
	{
		role: "assistant",
		content: "Oi, Helena! Que bom te ver por aqui. Me conta: o que você quer conquistar?",
		min: 4298,
	},
	{ role: "user", content: "Quero comprar um apartamento, sair do aluguel", min: 4295 },
	{
		role: "assistant",
		content:
			"Entendi. Faz sentido — aluguel é dinheiro que não volta. Qual imóvel você tem em mente?",
		min: 4293,
	},
	{ role: "user", content: "Uns 300 mil, dois quartos aqui em Goiânia mesmo", min: 4290 },
	{
		role: "assistant",
		content:
			"Com R$ 300 mil de carta, achei três grupos que cabem no seu perfil. A parcela fica em torno de R$ 1.980/mês em 200 meses.",
		min: 4285,
	},
	{ role: "user", content: "E se eu não for contemplado logo?", min: 4280 },
	{
		role: "assistant",
		content:
			"Pergunta certa. Ninguém garante contemplação — o que dá pra fazer é aumentar a chance com lance. Quer ver como ficaria?",
		min: 4278,
	},
	{ role: "user", content: "Quero sim", min: 4275 },
	{
		role: "user",
		content: "Segue meu RG pra adiantar o cadastro",
		min: 4270,
		mediaType: "image",
		mediaFilename: "rg-frente.jpg",
	},
	{
		role: "assistant",
		content: "Recebi, obrigado! Já encaminhei sua proposta pra administradora.",
		min: 4268,
	},
	// Aqui a conversa esfria — é o que faz a janela de 24h fechar.
	{
		role: "assistant",
		content:
			"Oi, Helena! Tudo bem?\n\nAqui é da Aja Agora, estou tentando falar com você sobre o seu consórcio.\n\nPode me responder por aqui?",
		min: 90,
		templateName: "aja_agora_atendente_retomada",
	},
];

async function main() {
	// Contato + conversa (reusa se já existir, pra rodar quantas vezes quiser).
	let [conv] = await db.select().from(conversations).where(eq(conversations.waId, WA_ID)).limit(1);

	if (!conv) {
		// O contato vem PRIMEIRO: a timeline do painel é montada a partir de
		// `contacts.conversations`, ou seja, do `conversations.contact_id`. Criar a
		// conversa sem esse vínculo (só amarrando pelo lead) faz a tela de
		// atendimento abrir VAZIA, com as mensagens todas no banco.
		const [contato] = await db
			.insert(contacts)
			.values({ name: NOME, phone: WA_ID })
			.returning({ id: contacts.id });

		const [criada] = await db
			.insert(conversations)
			.values({
				channel: "whatsapp",
				status: "active",
				waId: WA_ID,
				contactName: NOME,
				contactId: contato.id,
				metadata: {},
			})
			.returning();
		conv = criada;

		await db.insert(leads).values({
			conversationId: conv.id,
			contactId: contato.id,
			name: NOME,
			phone: WA_ID,
			stage: "em_atendimento",
			creditValue: "300000.00",
		});
		console.log(`[seed] conversa criada pra ${NOME} (${WA_ID})`);
	} else {
		await db.delete(messages).where(eq(messages.conversationId, conv.id));
		console.log(`[seed] conversa existente reaproveitada — mensagens recriadas`);
	}

	for (const m of ROTEIRO) {
		await db.insert(messages).values({
			conversationId: conv.id,
			role: m.role,
			content: m.content,
			channel: "whatsapp",
			createdAt: faz(m.min),
			templateName: m.templateName ?? null,
			mediaType: m.mediaType ?? null,
			mediaFilename: m.mediaFilename ?? null,
			// `mediaKey` fica NULL: é histórico de demonstração, não há objeto no S3.
			// A bolha mostra o anexo; clicar devolve 404, que é honesto.
		});
	}

	// `lastInboundAt` antigo = janela de 24h FECHADA, que é o estado interessante:
	// é ele que faz o atendimento disparar o template de retomada.
	await db
		.update(conversations)
		.set({ lastInboundAt: faz(4270) })
		.where(eq(conversations.id, conv.id));

	console.log(`[seed] ${ROTEIRO.length} mensagens · janela de 24h FECHADA (de propósito)`);
	console.log(`[seed] conversa: ${conv.id}`);
	process.exit(0);
}

main().catch((e) => {
	console.error("[seed] falhou:", e);
	process.exit(1);
});
