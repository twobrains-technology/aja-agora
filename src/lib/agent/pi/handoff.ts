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
import { anunciarCasoNaMesa } from "@/lib/mesa/dispatch";
import { createMesaHandoff } from "@/lib/mesa/handoff";

/** Palavras que prometem o que o agente não pode garantir. */
const PROMESSA =
	"(?:a caminho|em instantes|em breve|vou chamar|vamos chamar|vou abrir|vamos abrir|vamos ver se d[aá]|j[aá] est[aá] falando|em at[ée]\\s+\\d*\\s*(?:minutos?|horas?|segundos?|dias?))";

/** As palavras que só existem em atendimento HUMANO. */
const HUMANO = "(?:consultor(?:a)?|especialista|atendente|pessoa|humano|humana)";

/**
 * PALAVRA DE PROMESSA **NO CONTEXTO DE GENTE** — e só nele.
 *
 * Antes esta regex era só a lista de frases, e "em até" sozinho já virava handoff: a
 * fala honesta "temos parcelas em até 200 meses, com contemplação em até 12 meses"
 * trocava o balão do cliente pela linha da mesa e o turno parava de falar de cota
 * (`turno-livre.ts`, decisão do balão de handoff). Prazo é assunto do vendedor; prometer
 * ATENDIMENTO é que não pode. Daí as duas condições: a frase de promessa e a palavra de
 * gente a até 80 caracteres dela, na mesma frase — e "em até" só conta quando vem
 * seguido de unidade de tempo de resposta (minutos/horas/dias), nunca de meses, parcelas
 * ou reais.
 */
export const RE_DE_PROMESSA = new RegExp(
	`(?:${HUMANO}[^.!?\\n]{0,80}${PROMESSA})|(?:${PROMESSA}[^.!?\\n]{0,80}${HUMANO})`,
	"i",
);

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
	casoAberto: boolean;
}): string {
	// Sem lead não há caso na mesa: a linha honesta é a que pede o nome, não "abri o caso".
	if (!args.casoAberto) {
		const pergunta = args.texto
			.split(/\n+/)
			.map((l) => l.trim())
			.find((l) => /[?!]$/.test(l));
		return pergunta ?? "Qual é o seu nome, pra eu abrir o caso na nossa mesa?";
	}
	const linha = linhaDeHandoff({ nome: args.nome, clientePediu: args.clientePediu });
	const pergunta = args.texto
		.split(/\n+/)
		.map((l) => l.trim())
		.find((l) => /[?!]$/.test(l) && !RE_DE_PROMESSA.test(l));
	return pergunta ? `${linha}\n\n${pergunta}` : linha;
}

/**
 * O nome dito na fala do cliente. Não é chute do modelo: é o que ele escreveu, e sem nome não
 * há caso na mesa — então o caminho é capturar, não pedir de novo.
 */
export function nomeNaFala(texto: string | null): string | null {
	if (!texto) return null;
	const m = texto.match(
		/\b(?:meu nome é|me chamo|chamo|o nome é|sou a|sou o)\s+([A-Za-zÀ-ž'’]{2,30})/i,
	);
	if (!m) return null;
	const nome = m[1].trim();
	return nome.length >= 2 ? nome : null;
}

export function semPromessa(texto: string): boolean {
	return !RE_DE_PROMESSA.test(texto);
}

/**
 * O CLIENTE PEDIU UMA PESSOA — nas palavras DELE.
 *
 * P5/P7: "o lead só vai ao especialista quando ele pede" e "empurrar para humano é falha de
 * condução". O gate é de PRODUTO e mora no servidor, não no texto de conduta: quem decide se o
 * caso da mesa abre é a fala do cliente, não a vontade do modelo. Medido nos prints de produção
 * de 27/10 (`.orientacao/prints-lgpd/prod/05-depois-do-aceite.png`): a `fazer_proposta` falhou
 * (credencial da Bevi ausente) e o agente empurrou para a mesa um cliente que dizia "bora
 * fechar" — três turnos seguidos.
 *
 * Não é guarda de FALA do agente (o que o AGENTS.md proíbe): é a validação de uma tool contra o
 * estado da conversa, como o aceite da LGPD era. A lista abaixo é curta de propósito — só o
 * pedido explícito de gente. "Quero saber se é seguro", "não entendi" e "tive um problema" não
 * são pedido de humano; são conversa, e conversa o vendedor resolve.
 */
const GENTE =
	"(?:pessoa|humano|humana|atendente|consultor(?:a)?|especialista|supervisor(?:a)?|gerente|algu[ée]m)";
const PEDIDO_DE_GENTE = [
	// "quero falar com uma pessoa", "preciso conversar com um atendente", "quero falar com alguém"
	new RegExp(
		`(?:falar|conversar|negociar)\\s+(?:com|para|pra|pro)\\s+(?:um[a]?\\s+|o\\s+|a\\s+)?${GENTE}`,
		"i",
	),
	// "quero um atendente", "preciso de um humano", "queria falar com especialista"
	new RegExp(
		`(?:quero|queria|preciso|precisava|gostaria)\\s+(?:de\\s+|falar\\s+(?:com|para|pra)\\s+)?(?:um[a]?\\s+|o\\s+|a\\s+)?${GENTE}`,
		"i",
	),
	// "me passa para um atendente", "chama um humano", "transfere pro consultor"
	new RegExp(
		`(?:me\\s+)?(?:passa|passe|passar|chama|chame|chamar|transfere|transfira|transferir)\\s+(?:para|pra|pro|um|uma|o|a)?\\s*(?:um[a]?\\s+|o\\s+|a\\s+)?${GENTE}`,
		"i",
	),
	// "atendimento humano", "pessoa de verdade", "atendente de verdade"
	new RegExp(`(?:atendimento\\s+(?:humano|de\\s+verdade))|(?:${GENTE}\\s+de\\s+verdade)`, "i"),
	// "não quero falar com robô/bot/robô de novo"
	/(?:n[ãa]o\s+(?:quero|gosto)\s+(?:de\s+)?falar\s+(?:com|com o|com a)\s+(?:rob[ôo]|bot|m[áa]quina|computador|ia))/i,
];

/** A fala do CLIENTE é pedido de gente? Só ela — a fala do agente nunca passa por aqui. */
export function clientePedeHumano(texto: string | null | undefined): boolean {
	if (!texto || texto.trim().length < 3) return false;
	return PEDIDO_DE_GENTE.some((re) => re.test(texto));
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
export interface AbrirCasoNaMesaDeps {
	anunciar?: typeof anunciarCasoNaMesa;
}

export async function abrirCasoNaMesa(
	args: {
		conversationId: string;
		nome: string | null;
		motivo: string;
	},
	deps: AbrirCasoNaMesaDeps = {},
): Promise<ResultadoDoCaso> {
	const lead = await db.query.leads.findFirst({
		where: eq(leads.conversationId, args.conversationId),
	});

	if (!lead) return { ok: false, motivo: "sem-lead" };

	const criado = await createMesaHandoff({ leadId: lead.id });
	await db
		.update(conversations)
		.set({ status: "handed_off" })
		.where(eq(conversations.id, args.conversationId));

	// A mesa pode dizer "já existe um caso ativo" — é o mesmo caso, não um novo, e
	// re-anunciar seria aviso repetido no WhatsApp do atendente (o mesmo motivo pelo
	// qual a rota de transbordo responde 409 sem reenviar o dossiê).
	if (!criado.ok) {
		if (criado.reason === "handoff_ativo_existe") {
			return { ok: true, motivo: "caso-aberto", handoffId: criado.handoffId };
		}
		// `lead_not_found`/`attendant_not_found` não deviam acontecer com o lead em mãos, mas
		// caso aconteçam o cliente não pode ouvir "abri o caso" que não abriu.
		return { ok: false, motivo: criado.reason };
	}

	// O CASO ABERTO AVISA A MESA — na hora. `createMesaHandoff` só grava a linha: sem
	// o anúncio (raia + dossiê com "Vou atender"), o caso existia no admin e ninguém
	// ficava sabendo, que é o buraco do handoff do vendedor livre.
	await (deps.anunciar ?? anunciarCasoNaMesa)({
		handoffId: criado.handoff.id,
		leadId: lead.id,
		lead: criado.lead,
		proposal: criado.proposal,
	});

	return { ok: true, motivo: "caso-aberto", handoffId: criado.handoff.id };
}
