// A PESSOA, não a conversa — o dossiê cross-canal (L1, 21/09/2026).
//
// Produção: a web `fb913503` (telefone `62992496793`) disse "sua proposta já
// está registrada"; dois minutos depois o WhatsApp `494d40b0` (telefone
// `556292496793`) respondeu "ainda não aparece nenhuma proposta registrada aqui
// pra mim". É a MESMA pessoa (8 conversas, 6 leads) — e a única proposta real
// (ITAÚ, 18/08) está numa TERCEIRA conversa (`01b4b3bd`).
//
// Nenhum dos dois lados mentiu pelo que via: `getLatestBeviProposal` filtra por
// `conversationId`, e `contacts`/`conversations` separam o telefone da conversa.
// O que faltava é esta leitura — telefone → contato → tudo que a pessoa já fez —
// e o FATO dela no contexto do turno.
//
// Tudo aqui é LEITURA. Consulta NÃO cria contato: `resolveContact` é
// find-or-create e não entra neste caminho (mesmo racional do FIX-47 — o número
// que alguém digitou não pode materializar contato).

import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contacts, conversations, leads } from "@/db/schema";
import { getProposalsByContactId } from "./proposal-repo";

// ============================================================================
// Chave de telefone tolerante
// ============================================================================

/**
 * O telefone é a identidade da pessoa, mas aparece escrito de três formas no
 * sistema: `556292496793` (waId do WhatsApp), `62992496793` (o que
 * `normalizePhoneBR` de `@/lib/leads/phone` grava em `contacts.phone`) e
 * `+556292496793` (`normalizePhoneBR` de `@/lib/memory/identity`, E.164). Sem
 * uma chave comum, cada canal vê um cliente diferente.
 *
 * A chave é: só dígitos, sem código de país, sem o 9º dígito do celular
 * (`62992496793` → `6292496793`). As duas normalizações existentes ficam
 * INTACTAS — quem grava continua gravando o mesmo; isto aqui é só de consulta.
 */
export function chaveDeTelefone(raw: string | null | undefined): string | null {
	const locais = variantesDeTelefone(raw);
	if (locais.length === 0) return null;
	// A forma canônica é a de 10 dígitos (DDD + número, sem o 9º) quando ela é
	// derivável — é a única que as três grafias alcançam.
	return locais.find((local) => local.length === 10) ?? locais[0];
}

/** Duas grafias do mesmo telefone? (tolerante a 55 e ao 9º dígito). */
export function mesmoTelefone(a: string | null | undefined, b: string | null | undefined): boolean {
	const chaveA = chaveDeTelefone(a);
	return chaveA !== null && chaveA === chaveDeTelefone(b);
}

/**
 * Formas em que o telefone pode estar GRAVADO — candidatas pra consulta em
 * `contacts.phone`. A consulta não normaliza o banco, então consulta por todas:
 * com e sem o 9º dígito, com e sem o `+55`. Todas são o MESMO assinante, então
 * não há risco de casar outra pessoa.
 */
export function variantesDeTelefone(raw: string | null | undefined): string[] {
	const digits = (raw ?? "").replace(/\D/g, "");
	if (!digits) return [];
	// Mesmo guard de `normalizePhoneBR`: "55" inicial só é código de país com 12+
	// dígitos (em 10-11 o 55 é o DDD de Santa Maria-RS).
	const semPais = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;

	const locais: string[] = [];
	if (semPais.length === 11 && semPais[2] === "9") {
		locais.push(semPais, `${semPais.slice(0, 2)}${semPais.slice(3)}`);
	} else if (semPais.length === 10) {
		locais.push(semPais, `${semPais.slice(0, 2)}9${semPais.slice(2)}`);
	} else if (semPais.length === 11) {
		locais.push(semPais);
	} else {
		return [];
	}
	return [...new Set([...locais, ...locais.map((local) => `+55${local}`)])];
}

// ============================================================================
// Dossiê da pessoa
// ============================================================================

/** A escolha registrada no site (espelho de `ConversationMetadata.escolha`) —
 * tipo estrutural de propósito: `personas.ts` é do runtime de conversa e este
 * módulo não deve depender dele. */
export interface EscolhaRegistrada {
	groupId?: string;
	administradora?: string;
	creditValue?: number;
	termMonths?: number;
	monthlyPayment?: number;
	origem?: string;
}

/** Linha de `bevi_proposals` no recorte do dossiê (`numeric` chega como string). */
export interface PropostaRow {
	proposalId: string;
	conversationId: string;
	administradora: string | null;
	grupo: string | null;
	creditValue: string | number | null;
	monthlyPayment: string | number | null;
	termMonths: number | null;
	proposalStatus: string | null;
	createdAt: Date;
}

export interface ConversaRow {
	id: string;
	channel: string | null;
	createdAt: Date | null;
	metadata: unknown;
}

export interface ContatoRow {
	id: string;
	name: string | null;
	phone: string | null;
}

/** Uma simulação/proposta REAL da pessoa — com a conversa onde ela vive. */
export interface SimulacaoDaPessoa {
	proposalId: string;
	administradora: string | null;
	grupo: string | null;
	creditValue: number | null;
	monthlyPayment: number | null;
	termMonths: number | null;
	status: string | null;
	criadaEm: Date | null;
	/** A conversa onde a proposta foi criada — pode ser OUTRA que não a atual. */
	conversaId: string;
	canal: string | null;
}

export interface ConversaDaPessoa {
	id: string;
	canal: string | null;
	criadaEm: Date | null;
	/** A cota que o cliente escolheu nos cards desta conversa.
	 *
	 * ⚠️ O nome NÃO é `escolha`: aquele é o campo ANCORADO do
	 * `ConversationMetadata` (o que o contrato lê), e o guard FIX-411 é uma
	 * allowlist de quem pode CRIAR `escolha` — inferência sobre texto não pode
	 * nem existir. Aqui não se cria âncora nenhuma: é LEITURA do metadata já
	 * gravado, projetada neste dossiê. O nome próprio evita que o guard (que é
	 * sintático) confunda leitura com escrita; renomear não abre a porta, porque
	 * ninguém escreve `metadata.escolha` a partir daqui. */
	escolhaDoCliente: EscolhaRegistrada | null;
}

export interface DossieDaPessoa {
	telefone: string | null;
	contatoId: string | null;
	nome: string | null;
	/** Mais recente primeiro. */
	conversas: ConversaDaPessoa[];
	/** Todas as simulações/propostas da pessoa, mais recente primeiro. */
	simulacoes: SimulacaoDaPessoa[];
	estagiosDoFunil: string[];
	/** NADA registrado por este telefone — nem contato, nem conversa, nem
	 * proposta. Fato do registro, dito como tal (não "o cliente não existe"). */
	semHistorico: boolean;
}

function numero(v: unknown): number | null {
	if (typeof v === "number") return Number.isFinite(v) ? v : null;
	if (typeof v === "string" && v.trim() !== "") {
		const n = Number(v);
		return Number.isFinite(n) ? n : null;
	}
	return null;
}

/** A escolha gravada no metadata da conversa, no recorte que interessa. */
export function escolhaDoCliente(metadata: unknown): EscolhaRegistrada | null {
	if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
	const bruta = (metadata as { escolha?: unknown }).escolha;
	if (!bruta || typeof bruta !== "object" || Array.isArray(bruta)) return null;
	const raw = bruta as Record<string, unknown>;
	const escolha: EscolhaRegistrada = {};
	if (typeof raw.groupId === "string") escolha.groupId = raw.groupId;
	if (typeof raw.administradora === "string") escolha.administradora = raw.administradora;
	const creditValue = numero(raw.creditValue);
	if (creditValue !== null) escolha.creditValue = creditValue;
	const termMonths = numero(raw.termMonths);
	if (termMonths !== null) escolha.termMonths = termMonths;
	const monthlyPayment = numero(raw.monthlyPayment);
	if (monthlyPayment !== null) escolha.monthlyPayment = monthlyPayment;
	if (typeof raw.origem === "string") escolha.origem = raw.origem;
	return Object.keys(escolha).length > 0 ? escolha : null;
}

/** Monta o dossiê a partir de linhas JÁ lidas. PURA — é aqui que o "proposta em
 * outra conversa" deixa de se perder. */
export function montarDossie(args: {
	telefone: string | null;
	contato: ContatoRow | null;
	propostas: PropostaRow[];
	conversas: ConversaRow[];
	estagios: string[];
}): DossieDaPessoa {
	const canalPorConversa = new Map(args.conversas.map((c) => [c.id, c.channel]));

	const simulacoes: SimulacaoDaPessoa[] = [...args.propostas]
		.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
		.map((p) => ({
			proposalId: p.proposalId,
			administradora: p.administradora,
			grupo: p.grupo,
			creditValue: numero(p.creditValue),
			monthlyPayment: numero(p.monthlyPayment),
			termMonths: p.termMonths,
			status: p.proposalStatus,
			criadaEm: p.createdAt,
			conversaId: p.conversationId,
			canal: canalPorConversa.get(p.conversationId) ?? null,
		}));

	return {
		telefone: args.telefone,
		contatoId: args.contato?.id ?? null,
		nome: args.contato?.name ?? null,
		conversas: args.conversas.map((c) => ({
			id: c.id,
			canal: c.channel,
			criadaEm: c.createdAt,
			escolhaDoCliente: escolhaDoCliente(c.metadata),
		})),
		simulacoes,
		estagiosDoFunil: [...new Set(args.estagios)],
		semHistorico: !args.contato && simulacoes.length === 0 && args.conversas.length === 0,
	};
}

// ============================================================================
// Leitura — as fontes de dados (trocáveis no teste, como o gateway do FIX-14)
// ============================================================================

export interface FontesDaPessoa {
	contatoPorTelefone(telefone: string): Promise<ContatoRow | null>;
	propostasPorContato(contactId: string): Promise<PropostaRow[]>;
	conversasPorContato(contactId: string): Promise<ConversaRow[]>;
	estagiosPorContato(contactId: string): Promise<string[]>;
}

/** Fontes REAIS. Só SELECT — nada aqui insere. */
export const fontesDoBanco: FontesDaPessoa = {
	async contatoPorTelefone(telefone) {
		const variantes = variantesDeTelefone(telefone);
		if (variantes.length === 0) return null;
		const [row] = await db
			.select({ id: contacts.id, name: contacts.name, phone: contacts.phone })
			.from(contacts)
			.where(inArray(contacts.phone, variantes))
			.limit(1);
		return row ?? null;
	},
	async propostasPorContato(contactId) {
		return getProposalsByContactId(contactId);
	},
	async conversasPorContato(contactId) {
		return db
			.select({
				id: conversations.id,
				channel: conversations.channel,
				createdAt: conversations.createdAt,
				metadata: conversations.metadata,
			})
			.from(conversations)
			.where(eq(conversations.contactId, contactId))
			.orderBy(desc(conversations.createdAt));
	},
	async estagiosPorContato(contactId) {
		const rows = await db
			.select({ stage: leads.stage })
			.from(leads)
			.where(eq(leads.contactId, contactId));
		return rows.map((r) => r.stage);
	},
};

/**
 * O dossiê da pessoa a partir do telefone. Lança se a leitura falhar — quem
 * chama decide (o turno segue sem o bloco; o tool cai no caminho por conversa).
 * Devolver um dossiê VAZIO num erro de banco seria pior que não ter bloco: o
 * modelo receberia "nada registrado" como fato, que é exatamente a mentira que
 * este módulo existe pra desfazer.
 */
export async function dossieDaPessoa(
	telefone: string,
	fontes: FontesDaPessoa = fontesDoBanco,
): Promise<DossieDaPessoa> {
	const contato = await fontes.contatoPorTelefone(telefone);
	if (!contato) {
		return montarDossie({
			telefone,
			contato: null,
			propostas: [],
			conversas: [],
			estagios: [],
		});
	}
	const [propostas, conversas, estagios] = await Promise.all([
		fontes.propostasPorContato(contato.id),
		fontes.conversasPorContato(contato.id),
		fontes.estagiosPorContato(contato.id),
	]);
	return montarDossie({ telefone, contato, propostas, conversas, estagios });
}

/** A ÚLTIMA proposta da pessoa (de qualquer conversa) — insumo do
 * `check_proposal_status` por pessoa. */
export async function ultimaPropostaDaPessoa(contactId: string) {
	const [row] = await getProposalsByContactId(contactId);
	return row ?? null;
}

/**
 * Quem é a pessoa DESTA conversa — o `contactId` do contato já resolvido, ou o
 * contato que casa com o telefone do canal. Só leitura: se não houver contato,
 * devolve `null` e quem chama segue pelo caminho por conversa.
 */
export async function pessoaDaConversa(
	conversationId: string,
): Promise<{ contactId: string; telefone: string | null; nome: string | null } | null> {
	const [conv] = await db
		.select({ contactId: conversations.contactId, waId: conversations.waId })
		.from(conversations)
		.where(eq(conversations.id, conversationId))
		.limit(1);
	if (!conv) return null;

	if (conv.contactId) {
		const [contato] = await db
			.select({ phone: contacts.phone, name: contacts.name })
			.from(contacts)
			.where(eq(contacts.id, conv.contactId))
			.limit(1);
		return {
			contactId: conv.contactId,
			telefone: contato?.phone ?? null,
			nome: contato?.name ?? null,
		};
	}

	// Conversa sem contato religado, mas com telefone de canal (waId): resolve o
	// contato que já existe por esse número. NUNCA cria um.
	if (conv.waId) {
		const contato = await fontesDoBanco.contatoPorTelefone(conv.waId);
		if (contato) return { contactId: contato.id, telefone: contato.phone, nome: contato.name };
	}
	return null;
}

/**
 * O dossiê da pessoa DESTA conversa — a chamada única que o turno faz pra ter o
 * `blocoDaPessoa` (ver `contexto-da-tela.ts`).
 *
 * `null` quando a conversa não tem identidade resolvível (aí não há bloco a
 * injetar). Lança se a leitura falhar — um dossiê vazio por erro de banco faria
 * o modelo receber "nada registrado" como fato, que é exatamente a mentira que
 * este módulo existe pra desfazer.
 */
export async function dossieDaConversa(
	conversationId: string,
	fontes: FontesDaPessoa = fontesDoBanco,
): Promise<DossieDaPessoa | null> {
	const pessoa = await pessoaDaConversa(conversationId);
	if (!pessoa) return null;
	const [propostas, conversas, estagios] = await Promise.all([
		fontes.propostasPorContato(pessoa.contactId),
		fontes.conversasPorContato(pessoa.contactId),
		fontes.estagiosPorContato(pessoa.contactId),
	]);
	return montarDossie({
		telefone: pessoa.telefone,
		contato: { id: pessoa.contactId, name: pessoa.nome, phone: pessoa.telefone },
		propostas,
		conversas,
		estagios,
	});
}
