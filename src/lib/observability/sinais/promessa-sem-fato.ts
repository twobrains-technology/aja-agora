// PROMESSA SEM FATO — a reconciliação FALA × ESTADO do caso Arthur.
//
// O caso: o agente anunciou "você está oficialmente pré-cadastrado no consórcio
// do Itaú, o boleto chega na sua casa" — e `bevi_proposals` daquela conversa
// tinha ZERO linhas. Nenhum sinal da casa acusou: `turno_mudo` 0,000,
// `card_sem_fala` 0,000, `finish_reason` ok em 65 de 65 turnos, e o juiz LLM deu
// 0,923 de `judge_avancou`. Juiz lê FALA e pergunta "este turno tentou
// avançar?" — e o turno que mente tentou. O defeito não estava na fala: estava
// no CONTRASTE fala × estado.
//
// Este módulo existe para ser esse contraste, por turno: se a fala do assistente
// promete posse ou finalização (padrão determinístico, regex curada — nunca
// LLM) e a conversa não tem UMA proposta registrada na administradora, o turno
// recebe o score BOOLEAN `promessa_sem_fato`. Se tem proposta, não emite —
// prometer a alguém que já tem proposta é o trabalho, não alucinação.
//
// O QUE ISTO NÃO É: remendo de fala. Nada aqui reescreve, trunca ou veta texto
// (P11 — o detector é medida, não correção). Falha de Langfuse nunca derruba o
// turno: tudo é try/catch, e sem envs é no-op.
//
// Quem cruza com o estado da conversa usa a MESMA fonte do banco de
// `reconciliacao-fala-estado.ts` (`bevi_proposals`) — este módulo só lê.

import { type Ambiente, configDoLangfuse } from "@/lib/agent/pi/langfuse";

/** Fala que o assistente PRODUZIU no turno (o texto streamado). */
type Entrada = {
	fala: string;
	conversationId: string;
	/** O trace deste turno — o score é de UM TURNO, não da conversa. */
	traceId: string;
	sessionId?: string;
	env?: Ambiente;
	/** Injetável para teste; default conta `bevi_proposals` no banco. */
	contarPropostas?: (conversationId: string) => Promise<number>;
	/** Injetável para teste; default é `fetch`. */
	buscar?: typeof fetch;
};

/**
 * Padrões de PROMESSA de posse ou finalização — o que o agente só pode dizer
 * quando o fato existe (proposta registrada na administradora).
 *
 * Curados à mão, em ordem do mais específico pro mais genérico, e por isso
 * NÃO pegam fala legítima: "sua escolha", "a moto dos seus sonhos",
 * "sua parcela", "vamos fechar o valor" (intenção, não fato), "se você fechar"
 * (condicional). Cada padrão exige o VERBO DE CONSUMAÇÃO ou a POSE — não
 * aceita promessa de futuro condicional ("vai ser seu") nem intenção
 * ("vamos fechar").
 *
 * Caso Arthur reproduzido no caso 1 do teste: "você está oficialmente
 * pré-cadastrado … o boleto chega na sua casa" — bate nos padrões 2 e 8.
 */
const PADROES_DE_PROMESSA: RegExp[] = [
	// Posse declarada no presente: "é sua", "é seu", "já são seus".
	// Posse declarada no presente: "é sua", "é seu", "já são seus". Sem `\b` no verbo:
	// "é" não é caractere de palavra em regex ASCII, e a borda com acento falha.
	/(?:^|\s)(?:é|s[aã]o|ficou|est[aá])\s+(?:j[aá]\s+)?(?:sua|seu|seus|suas)\b(?!\s+(?:escolha|prefer[êe]ncia|parcela|escolhida|opini|decis[aã]o|vez))/i,
	// Finalização oficial: "você está oficialmente …", "está oficialmente".
	/\boficialmente\b/i,
	// Consumação do contrato/cadastro/proposta.
	// Consumação do contrato/cadastro/proposta — com gap curto entre o sujeito e o
	// particípio ("seu contrato está fechado", "pré-cadastro foi concluído").
	/\b(?:contrato|pr[eé][- ]?cadastro|cadastro|proposta|registro)\b[^.\n]{0,24}?\b(?:fechad[oa]|conclu[ií]d[oa]|aprovad[oa]|confirmad[oa]|registrad[oa]|ativad[oa])/i,
	/\b(?:fechamos|registramos|conclu[ií]mos|confirmamos|aprovamos)\s+(?:o\s+)?(?:seu\s+)?(?:contrato|cadastro|pedido|registro|pr[eé][- ]?cadastro)\b/i,
	// Cota reservada — só existe depois de proposta.
	/\bcota\s+reservada\b/i,
	// Contemplação dita como fato consumado.
	/\b(?:voc[êe]\s+)?(?:foi|est[aá]\s+j[aá]|j[aá]\s+est[aá])\s+contemplad[oa]/i,
	// Entrega a caminho — "boleto chega na sua casa", "documentos a caminho".
	// Entrega a caminho — "boleto chega na sua casa", "documentos estão a caminho".
	/\b(?:boleto|carn[êe]|documentos?|v[íi]deos?|kit)\b[^.\n]{0,20}?\b(?:chega|chegar[aá]|vai\s+chegar|est[aã]?\s+a\s+caminho|a\s+caminho)\b/i,
	// "na sua casa" com verbo de envio antes (chega/enviado/madura).
	/\b(?:cheg[aei]|enviad[oa]|sair[ao]?|mandad[oa])\s+(?:[^.\n]{0,40})?\b(?:na?\s+)?sua\s+casa\b/i,
];

/** A fala promete posse ou finalização? Função PURA — é ela que o teste exerce. */
export function falaPrometePosseOuFinalizacao(fala: string): boolean {
	const texto = fala.trim();
	if (texto.length === 0) return false;
	return PADROES_DE_PROMESSA.some((padrao) => padrao.test(texto));
}

/** A promessa na fala é falsa? Proposta 0 + promessa = alucinação de fechamento. */
export function ehPromessaSemFato(args: { fala: string; propostas: number }): boolean {
	return args.propostas === 0 && falaPrometePosseOuFinalizacao(args.fala);
}

/** O corpo do score na API v3 — BOOLEAN no trace do turno. */
export type ScorePromessaSemFato = {
	traceId: string;
	sessionId?: string;
	name: "promessa_sem_fato";
	value: boolean;
	dataType: "BOOLEAN";
	comment: string;
};

/** Monta o score quando houve promessa sem fato. `null` = nada a gravar. */
export function scoreDePromessaSemFato(args: {
	fala: string;
	propostas: number;
	traceId: string;
	sessionId?: string;
}): ScorePromessaSemFato | null {
	if (!ehPromessaSemFato(args)) return null;
	return {
		traceId: args.traceId,
		...(args.sessionId ? { sessionId: args.sessionId } : {}),
		name: "promessa_sem_fato",
		value: true,
		dataType: "BOOLEAN",
		comment:
			`A fala promete posse/finalização e \`bevi_proposals\` tem 0 linhas para esta conversa ` +
			'(caso Arthur: "A moto é sua!" com proposta nenhuma). Fala × estado — juiz não pega.',
	};
}

/**
 * Detecta, cruza com o banco e grava o score. Nunca lança: falha engolida com
 * log. Sem envs do Langfuse, sem fala ou sem traceId = no-op silencioso.
 *
 * Não reescreve fala nem devolve texto — só mede.
 */
export async function registrarPromessaSemFato(entrada: Entrada): Promise<void> {
	try {
		const config = configDoLangfuse(entrada.env ?? process.env);
		if (!config) return; // sem envs = no-op
		if (!entrada.fala.trim() || !entrada.traceId) return;

		const contar =
			entrada.contarPropostas ??
			(async (conversationId: string) => {
				const { db } = await import("@/db");
				const { beviProposals } = await import("@/db/schema");
				const { sql } = await import("drizzle-orm");
				const [linha] = await db
					.select({ total: sql<number>`count(*)::int` })
					.from(beviProposals)
					.where(sql`${beviProposals.conversationId} = ${conversationId}`);
				return linha?.total ?? 0;
			});

		const propostas = await contar(entrada.conversationId);
		const score = scoreDePromessaSemFato({
			fala: entrada.fala,
			propostas,
			traceId: entrada.traceId,
			sessionId: entrada.sessionId,
		});
		if (!score) return;

		const buscar = entrada.buscar ?? fetch;
		const resposta = await buscar(`${config.baseUrl}/api/public/scores`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Basic ${Buffer.from(`${config.publicKey}:${config.secretKey}`).toString("base64")}`,
			},
			body: JSON.stringify(score),
		});
		if (!resposta.ok) {
			console.error(
				`[promessa-sem-fato] Langfuse recusou o score (HTTP ${resposta.status}) — ignorado.`,
			);
		}
	} catch (erro) {
		console.error(
			"[promessa-sem-fato] falha ao gravar score (ignorado — observabilidade nunca derruba o turno):",
			erro instanceof Error ? erro.message : erro,
		);
	}
}
