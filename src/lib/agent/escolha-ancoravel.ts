// A escolha do cliente pode ser ancorada NESTE turno?
//
// ## Por que isto virou um módulo
//
// A regra existia em um lugar só — dentro do nó `converse`
// (`langgraph/nodes/converse.ts`) — e a tool `escolher_cota`, que é quem FALA
// com o modelo, não a consultava. O resultado era duas fontes de verdade para o
// mesmo fato, e a que respondia ao modelo mentia:
//
//   modelo → escolher_cota(groupId) → { confirmada: true, aviso: "Cota registrada." }
//   converse → veta em silêncio → `escolha` continua null
//
// Em produção (`fd76e393`, 16/08/2026 19:21:30) isso saiu exatamente como se
// espera de um modelo bem-comportado: ele ouviu do próprio servidor que a cota
// estava registrada e contou ao cliente — "Vou confirmar essa escolha pra você.
// Pronto! A cota está confirmada." O servidor terminou a conversa com
// `escolha = null` e `bevi_proposals = 0`.
//
// Isso não é alucinação: é o agente repetindo o que a ferramenta lhe disse. A
// correção não é calar a frase (regex sobre fala é o anti-padrão revertido em
// `649320dc`) — é fazer a ferramenta dizer a verdade.
//
// ## A regra, que não mudou
//
// É ALLOWLIST (FIX-416): exige sinal positivo de aceite. Ausência de recusa não
// é prova de escolha — "quanto fica a parcela da Rodobens?" tem groupId válido e
// não é uma escolha. E, mesmo com aceite, a marca não pode ter sido excluída na
// mesma fala (FIX-414: "qualquer uma menos a Rodobens, quero fechar").

import type { ChosenOffer } from "@/lib/agent/orchestrator/choose-offer";
import { administradoraFoiRecusada } from "@/lib/agent/orchestrator/choose-offer";
import { detectYesNoText } from "@/lib/agent/orchestrator/yes-no";
import type { UserIntent } from "@/lib/agent/qualify-state";

export type VetoDeEscolha =
	/** O cliente não deu sinal positivo de aceite neste turno. */
	| "sem-aceite-explicito"
	/** Ele aceitou, mas excluiu justamente esta marca na mesma fala. */
	| "administradora-recusada"
	/** O groupId não está entre as cotas exibidas nesta conversa. */
	| "cota-nao-exibida";

export type ResultadoDeAncoragem =
	| { ancora: true; cota: ChosenOffer }
	| { ancora: false; veto: VetoDeEscolha };

/**
 * Decide, e diz POR QUÊ quando recusa — o motivo volta ao modelo como resultado
 * da tool, para ele conduzir em vez de anunciar um fecho que não houve.
 */
export function escolhaPodeSerAncorada(args: {
	/** O que o cliente escreveu neste turno. */
	texto: string;
	/** O rótulo do analyzer — `detectYesNoText` enxerga `ready_to_proceed`. */
	intent: UserIntent | undefined;
	/** O groupId que o modelo indicou. */
	groupId: string;
	/** As cotas REALMENTE exibidas nesta conversa. */
	exibidas: ChosenOffer[];
}): ResultadoDeAncoragem {
	const { texto, intent, groupId, exibidas } = args;

	const cota = exibidas.find((o) => o.groupId === groupId);
	if (!cota) return { ancora: false, veto: "cota-nao-exibida" };

	if (detectYesNoText(texto, intent ?? "neutral") !== true) {
		return { ancora: false, veto: "sem-aceite-explicito" };
	}

	if (administradoraFoiRecusada(texto, exibidas, cota.administradora)) {
		return { ancora: false, veto: "administradora-recusada" };
	}

	return { ancora: true, cota };
}

/**
 * O que a tool devolve ao modelo quando o efeito NÃO acontece.
 *
 * É instrução de condução, não desculpa: o modelo precisa saber o que fazer no
 * lugar de anunciar. Sem isto ele preenche o silêncio com a versão otimista.
 */
export function motivoParaOModelo(veto: VetoDeEscolha): string {
	switch (veto) {
		case "sem-aceite-explicito":
			return (
				"NÃO registrei nada: não reconheci um aceite explícito do cliente neste turno. " +
				"É PROIBIDO dizer que a cota está confirmada, reservada ou garantida. " +
				"Continue a conversa e confirme com ele que é essa cota que ele quer — quando ele disser que sim, chame de novo."
			);
		case "administradora-recusada":
			return (
				"NÃO registrei nada: nesta mesma fala o cliente EXCLUIU essa administradora. " +
				"Não trate como escolhida — pergunte qual das outras ele prefere."
			);
		case "cota-nao-exibida":
			return (
				"NÃO registrei nada: esse grupo não está entre as cotas que você mostrou nesta conversa. " +
				"Confira o groupId nos cards e chame de novo — não siga com uma cota que o cliente não viu."
			);
	}
}
