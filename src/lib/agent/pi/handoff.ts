// O HANDOFF SEM PROMESSA.
//
// Medido no dev (conversa 6d647263, 25/10/2026): o cliente pediu "uma pessoa de verdade"
// e o agente respondeu "Vou chamar um especialista" / "Um especialista está a caminho" —
// promessa que nada sustentava. `conversations.status` continuou `active`, então o agente
// seguiu respondendo junto com o atendente, e o botão de confirmação apareceu DEPOIS de o
// cliente já ter pedido (confirmação redundante). O caso nem foi registrado: sem lead, o
// painel ficou sem contato.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { createMesaHandoff } from "@/lib/mesa/handoff";

/** Palavras que prometem o que o agente não pode garantir. */
export const RE_DE_PROMESSA =
	/(a caminho|em instantes|em breve|em até|vou chamar|vamos chamar|vamos ver se dá|já está falando)/i;

/** A linha que honra o pedido — sem prazo, sem "a caminho". */
export function linhaDeHandoff(args: { nome: string | null; clientePediu: boolean }): string {
	const quem = args.nome?.trim() ? `${args.nome.trim()}, ` : "";
	if (args.clientePediu)
		return `${quem}abri o caso pra nossa mesa. Um atendente humano assume por aqui.`;
	return "Pra esse caso, recomendo conversar direto com nosso consultor humano.";
}

/**
 * O BALÃO DO HANDOFF: uma linha, sem promessa. O modelo escrevia duas — a linha certa e uma
 * confirmação extra com prazo ("Caso aberto! Um especialista vai entrar em contato em breve")
 * — e o cliente recebia o mesmo aviso duas vezes, uma com promessa que nada sustenta.
 * A pergunta do nome (o que destrava o caso) continua: é o próximo passo real.
 */
export function linhaFinalDoHandoff(args: {
	texto: string;
	nome: string | null;
	clientePediu: boolean;
}): string {
	const linha = linhaDeHandoff({ nome: args.nome, clientePediu: args.clientePediu });
	const pergunta = args.texto
		.split(/\n+/)
		.map((l) => l.trim())
		.find((l) => /[?!]$/.test(l) && !RE_DE_PROMESSA.test(l));
	return pergunta ? `${linha}\n\n${pergunta}` : linha;
}

export function semPromessa(texto: string): boolean {
	return !RE_DE_PROMESSA.test(texto);
}

export type ResultadoDoCaso = {
	ok: boolean;
	/** `caso-aberto` | `sem-lead` (o nome ainda não chegou) */
	motivo: string;
	handoffId?: string;
};

/**
 * O PEDIDO DO CLIENTE VIRA CASO, na hora.
 *
 * Sem lead (não há nome capturado) não há caso na mesa: o nome é o que destrava, e o
 * caminho exige o nome em vez de fingir um registro. Com lead, o handoff entra na mesa e a
 * conversa passa a `handed_off` — é isso que cala o agente; sem, as duas vozes falam no
 * mesmo número (achado de 2026-08-10, `silenciarAgente` na mesa).
 */
export async function abrirCasoNaMesa(args: {
	conversationId: string;
	nome: string | null;
	motivo: string;
}): Promise<ResultadoDoCaso> {
	const lead = await db.query.leads.findFirst({
		where: eq(leads.conversationId, args.conversationId),
	});

	if (!lead) return { ok: false, motivo: "sem-lead" };

	const criado = await createMesaHandoff({ leadId: lead.id });
	await db
		.update(conversations)
		.set({ status: "handed_off" })
		.where(eq(conversations.id, args.conversationId));

	// A mesa pode dizer "já existe um caso ativo" — é o mesmo caso, não um novo.
	const handoffId = criado.ok
		? criado.handoff.id
		: criado.reason === "handoff_ativo_existe"
			? criado.handoffId
			: undefined;
	return { ok: true, motivo: "caso-aberto", handoffId };
}
