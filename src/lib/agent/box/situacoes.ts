// ============================================================================
// SITUAÇÕES DO TURNO — o FATO fica aqui, a CONDUTA fica na caixa.
//
// Este arquivo é a fronteira que a campanha do motor-pi criou, e ela existe por
// um defeito medido: a caixa de prompt (Langfuse, `aja-system-prompt`, efeito
// ≤60s sem deploy) NÃO governava a conversa. Vinte e dois blocos montados em
// `converse.ts` vinham DEPOIS dela e venciam — mudar como o agente fala exigia
// engenheiro e deploy, que é exatamente a dor que motivou a troca de motor.
//
// A regra do corte (CLAUDE.md: "Invariante verificável vira código. Conversa é
// do modelo.):
//
//   FATO      → aqui. O que o sistema SABE do turno: o contrato fechou, quais
//               cards estão na tela, qual é a administradora, qual é o número.
//               Vem do estado, não da cabeça de ninguém, e é curto de propósito.
//
//   CONDUTA   → na caixa (`SYSTEM_PROMPT` em `system-prompt.ts` e, em produção,
//               o prompt gerenciado no Langfuse). O que fazer com o fato, como
//               falar, o que NÃO repetir. Editar isso não pode exigir deploy.
//
// O modelo recebe o fato como uma linha `[situação: <chave>] <dados>` no fim do
// system prompt e encontra a conduta correspondente na seção "Situações do
// turno" da caixa. Sem a seção, o fato fica sem instrução — e é por isso que
// `situacoes.test.ts` cobra que TODA chave daqui tenha seção na caixa.
// ============================================================================

/** As situações que o turno pode carregar. Cada chave precisa de uma seção com o
 * mesmo nome na caixa (`system-prompt.ts`, "Situações do turno") — o teste
 * `situacoes.test.ts` cobra chave por chave, então acrescentar uma aqui sem
 * escrever a seção dela fica vermelho na hora. */
export const SITUACAO_KEYS = [
	"fechamento",
	"reveal",
	"retomada-pos-fechamento",
	"novato",
	"canal",
] as const;

export type SituacaoKey = (typeof SITUACAO_KEYS)[number];

/** Uma situação ativa neste turno: a chave e o FATO que a acompanha. */
export type SituacaoDoTurno = { chave: SituacaoKey; fato: string };

const brl = (n: number) =>
	n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * Monta o bloco de fatos que o `converse` põe no system prompt.
 *
 * Formato estável e legível, uma linha por situação — é o contrato que a caixa
 * descreve ("o turno pode trazer linhas `[situação: X]`"). Vazio devolve `null`:
 * turno sem situação não ganha bloco nenhum (e não ganha ruído).
 */
export function blocoDeSituacoes(situacoes: SituacaoDoTurno[]): string | null {
	if (situacoes.length === 0) return null;
	const linhas = situacoes.map((s) => `[situação: ${s.chave}] ${s.fato}`);
	return `FATOS DESTE TURNO (verdade do sistema — não invente além disto):\n${linhas.join("\n")}`;
}

// ── FÁBRICAS DE FATO ──
// Cada uma só descreve o ESTADO. Nenhuma diz o que o modelo deve falar: isso é
// a caixa. Se uma delas começar a instruir, o corte foi rompido.

/** O contrato já foi fechado e o sistema já mostrou os cards do fecho. */
export function fatoDeFechamento(d: {
	canal: "web" | "whatsapp" | (string & {});
	administradora?: string | null;
}): SituacaoDoTurno {
	const adm = d.administradora ?? "a administradora escolhida";
	const cards =
		d.canal === "whatsapp"
			? `proposta em PDF e o aviso de que um atendente vai chamar neste mesmo número para a adesão na ${adm}`
			: `proposta em PDF e o card do WhatsApp oficial, por onde um atendente continua a adesão na ${adm}`;
	return {
		chave: "fechamento",
		fato: `contrato fechado e os cards do fecho JÁ estão na tela do cliente: ${cards}.`,
	};
}

/** O turno em que a busca acabou e as opções aparecem pela primeira vez. */
export function fatoDeReveal(d: {
	recomendada: boolean;
	administradora?: string | null;
	valor?: number | null;
}): SituacaoDoTurno {
	const quem = d.administradora ? ` (${d.administradora})` : "";
	const valores = d.valor ? `, carta de ${brl(d.valor)}` : "";
	return d.recomendada
		? {
				chave: "reveal",
				fato: `primeira apresentação das opções neste turno; você está RECOMENDANDO a opção${quem}${valores}; os cards com todas as ofertas aparecem logo abaixo desta mensagem.`,
			}
		: {
				chave: "reveal",
				fato: `primeira apresentação das opções neste turno${quem}${valores}; os cards com todas as ofertas aparecem logo abaixo desta mensagem.`,
			};
}

/** É a primeira vez do cliente com consórcio. */
export function fatoDeNovato(): SituacaoDoTurno {
	return {
		chave: "novato",
		fato: "é a PRIMEIRA VEZ do cliente com consórcio, e ele acabou de dizer isso.",
	};
}

/** O canal muda o que existe na tela e por onde a identificação chega. */
export function fatoDeCanal(canal: "web" | "whatsapp" | (string & {})): SituacaoDoTurno {
	return {
		chave: "canal",
		fato:
			canal === "whatsapp"
				? "canal: WhatsApp — conversa por MENSAGEM; não existe tela, card nem botão; o CPF chega escrito " +
					"nesta conversa; este número já é o WhatsApp dele."
				: "canal: web — existe tela; a identificação (CPF, celular, aceite) é digitada no formulário " +
					"que o sistema abre.",
	};
}

/** O cliente VOLTOU depois de fechar: primeira mensagem desde então. */
export function fatoDeRetomadaPosFechamento(d: {
	administradora?: string | null;
}): SituacaoDoTurno {
	const adm = d.administradora ?? "a administradora escolhida";
	return {
		chave: "retomada-pos-fechamento",
		fato:
			`é a PRIMEIRA mensagem do cliente desde que ele voltou à conversa; a proposta JÁ está ` +
			`fechada, com ${adm}, e um atendente da Aja Agora vai falar com ele pelo WhatsApp em breve ` +
			`(documentos e próximos passos).`,
	};
}
