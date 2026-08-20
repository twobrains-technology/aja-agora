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
import {
	administradoraFoiRecusada,
	falaExcluiPorCaracteristica,
	resolveEscolhaOfertada,
} from "@/lib/agent/orchestrator/choose-offer";
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
	/**
	 * O FATO DE SERVIDOR que abre a segunda porta: no turno anterior o servidor
	 * ofereceu ESTAS cotas como escolha (atalhos coagidos a partir dos rótulos —
	 * ver `coerceEscolhaNosAtalhos`). Ausente = nenhuma pergunta de escolha
	 * pendente, e vale só o aceite explícito de sempre.
	 */
	escolhaOfertada?: { groupIds: string[] };
}): ResultadoDeAncoragem {
	const { texto, intent, groupId, exibidas, escolhaOfertada } = args;

	const cota = exibidas.find((o) => o.groupId === groupId);
	if (!cota) return { ancora: false, veto: "cota-nao-exibida" };

	// PORTA 2 — ELE RESPONDEU À PERGUNTA QUE O AGENTE FEZ.
	//
	// A parede do FIX-406 ("texto livre não assina") engoliu a porta legítima: o
	// agente perguntava "qual das duas você prefere?" com dois atalhos, a cliente
	// respondia "a de prazo mais curto" — e o sistema tratava como se ela não
	// tivesse escolhido nada, porque não era "sim" nem "não". Cliente cooperativa,
	// usando só o que o produto lhe ofereceu, sem caminho até o contrato.
	//
	// Isto NÃO reabre o texto livre. São três exigências simultâneas, todas
	// verificáveis, e a primeira é estado do servidor:
	//   1. o SERVIDOR ofereceu uma escolha entre cotas específicas no turno
	//      anterior (`escolhaOfertada`, coagida por ele mesmo — não é o modelo
	//      que declara isso);
	//   2. a fala resolve DETERMINISTICAMENTE para UMA daquelas cotas
	//      (`resolveEscolhaOfertada`, o mesmo resolvedor por marca/característica
	//      que o resto do sistema usa, sobre um conjunto FECHADO de 2-3 cotas);
	//   3. a cota resolvida é a MESMA que o modelo indicou — se ele apontar outra,
	//      quem manda é a fala do cliente, e nada ancora.
	//
	// Pergunta em aberto e recusa seguem barradas logo abaixo, pelos mesmos
	// predicados de sempre.
	const perguntaAberta =
		intent === "asking_question" ||
		intent === "expressing_doubt" ||
		intent === "confused" ||
		intent === "off_topic" ||
		intent === "wants_more_options";
	const respondeuAEscolhaOfertada =
		!perguntaAberta &&
		intent !== "declines" &&
		// "qualquer uma MENOS a de prazo mais curto" DESCREVE a cota para
		// descartá-la. `administradoraFoiRecusada` não pega quando as duas cotas
		// são da mesma administradora — que é o caso da pergunta de escolha típica.
		!falaExcluiPorCaracteristica(texto) &&
		(escolhaOfertada?.groupIds.length ?? 0) > 0 &&
		escolhaOfertada?.groupIds.includes(groupId) === true &&
		resolveEscolhaOfertada(
			exibidas.filter((o) => escolhaOfertada.groupIds.includes(o.groupId)),
			texto,
		)?.groupId === groupId;

	if (!respondeuAEscolhaOfertada && detectYesNoText(texto, intent ?? "neutral") !== true) {
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
