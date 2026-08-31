/**
 * D5 — o micro-compromisso antes de trocar de canal.
 *
 * A planilha pede um "CTA de confirmação de interesse antes da troca de canal":
 * a pessoa dizendo "sim, quero" ainda dentro do chat, para que a chance de ela
 * completar o salto para o WhatsApp aumente por consistência.
 *
 * **Este item não vira código novo — ele já está construído, e mais forte do
 * que o pedido.** O plano de execução previa exatamente esta checagem antes de
 * construir qualquer coisa ("não quero somar um gate a mais numa cascata que já
 * tem quinze, e gate duplicado é como o funil trava"), e é ela que este arquivo
 * faz. Encerrar com prova, não com afirmação.
 *
 * O que a cascata já exige, em ordem, antes de qualquer troca de canal:
 *
 *   1. `decision` — o card "Esse plano faz sentido?", que desde o FIX-386
 *      (decisão do Kairo, 26/07/2026) só é vencido por um SIM de verdade
 *      (`decisionAccepted`) ou por uma cota nomeada pelo cliente (`escolha`).
 *      Antes disso bastava o card ter APARECIDO, e quem respondia "deixa eu
 *      pensar" recebia o formulário de contratação no turno seguinte.
 *   2. `contract` — o formulário de contratação, com CPF, celular e aceite.
 *
 * Só DEPOIS de os dois passarem é que `closingPresentation` emite o card
 * `atendimento_handoff` com o botão do WhatsApp. Ou seja: quando a troca de
 * canal acontece, o cliente já disse "sim" duas vezes e entregou documento.
 * Um terceiro portão aqui não somaria compromisso — somaria atrito no ponto
 * mais caro do funil.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { nextGate } from "./qualify-state";

const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
	process.env.VITRINE_CPF = "";
	process.env.VITRINE_CELULAR = "";
});

afterEach(() => {
	process.env = { ...ENV_ORIGINAL };
});

const COM_NOME = { hasContactName: true };

/** Cliente que viu as cartas e já se identificou — só falta decidir.
 *
 *  `experienceDispatched` entra no fixture porque o `experience` ("você já fez
 *  consórcio antes?") é o PRIMEIRO gate pós-reveal e é de uso único: ele já
 *  aconteceu quando o cliente chega à decisão. Sem a flag, a cascata devolveria
 *  `experience` em todos os casos abaixo — o que, por si, já é o argumento
 *  deste arquivo: a cascata pós-reveal é longa, e somar um portão nela é somar
 *  um turno em que a venda pode morrer. */
function viuAsCartas(extra: Partial<ConversationMetadata> = {}): ConversationMetadata {
	return {
		currentCategory: "auto",
		desireAsked: true,
		experienceDispatched: true,
		identityCollected: true,
		searchDispatched: true,
		revealCompleted: true,
		qualifyAnswers: { creditMax: 90_000, prazoMeses: 60, hasLance: "no" },
		...extra,
	} as ConversationMetadata;
}

describe("D5 — a confirmação já existe na cascata", () => {
	it("quem viu as cartas encontra o card de DECISÃO antes de qualquer coisa", () => {
		expect(nextGate(viuAsCartas(), COM_NOME)).toBe("decision");
	});

	it("o card ter aparecido NÃO basta — a cascata segura até haver um sim", () => {
		// FIX-386: antes, `decisionDispatched` sozinho liberava o contrato, e quem
		// respondia "deixa eu pensar ainda" recebia o formulário no turno seguinte.
		const apareceuMasSemResposta = viuAsCartas({ decisionDispatched: true });
		expect(nextGate(apareceuMasSemResposta, COM_NOME)).toBe("decision");
	});

	it("com o SIM, e só com ele, o funil libera o formulário de contratação", () => {
		const disseSim = viuAsCartas({ decisionDispatched: true, decisionAccepted: true });
		expect(nextGate(disseSim, COM_NOME)).toBe("contract");
	});

	it("nomear a cota vale como aceite — é mais forte que um sim", () => {
		const escolheu = viuAsCartas({ escolha: { administradora: "Bevi" } } as never);
		expect(nextGate(escolheu, COM_NOME)).toBe("contract");
	});

	it("a troca de canal só é alcançável DEPOIS do formulário", () => {
		// `atendimento_handoff` (o card com o botão do WhatsApp) é emitido por
		// `closingPresentation`, que só roda depois de a proposta existir. Enquanto
		// o formulário não foi emitido, o próximo passo do funil é ele — nunca o
		// handoff.
		const aceitouSemFormulario = viuAsCartas({
			decisionDispatched: true,
			decisionAccepted: true,
		});
		expect(nextGate(aceitouSemFormulario, COM_NOME)).toBe("contract");
	});

	it("e o contrato exige identidade REAL — o portão de dado não caiu junto", () => {
		const semIdentidade = viuAsCartas({
			identityCollected: false,
			decisionDispatched: true,
			decisionAccepted: true,
		});
		expect(nextGate(semIdentidade, COM_NOME)).toBe("identify");
	});
});

describe("D5 — por que um gate a mais seria pior", () => {
	it("a cascata pós-reveal tem CINCO portões possíveis antes da troca de canal", () => {
		// Cada um deles é um turno em que a venda pode morrer. O plano de execução
		// escolheu VERIFICAR antes de construir exatamente por isto: a auditoria
		// pediu um micro-compromisso, e o funil já tem dois — o risco real aqui não
		// é faltar confirmação, é sobrar portão.
		const portoesPossiveis = new Set<string>();

		// `timeframe` — quando o prazo não foi declarado.
		portoesPossiveis.add(
			nextGate(viuAsCartas({ qualifyAnswers: { creditMax: 90_000 } }), COM_NOME),
		);
		// `experience`, o primeiro deles — de uso único, mas ainda um turno.
		portoesPossiveis.add(
			nextGate(viuAsCartas({ experienceDispatched: false }) as ConversationMetadata, COM_NOME),
		);
		// `lance` para quem não declarou nada sobre lance.
		portoesPossiveis.add(
			nextGate(viuAsCartas({ qualifyAnswers: { creditMax: 90_000, prazoMeses: 60 } }), COM_NOME),
		);
		// `lance-value` para quem topou dar lance.
		portoesPossiveis.add(
			nextGate(
				viuAsCartas({ qualifyAnswers: { creditMax: 90_000, prazoMeses: 60, hasLance: "yes" } }),
				COM_NOME,
			),
		);
		// `decision` e `contract`.
		portoesPossiveis.add(nextGate(viuAsCartas(), COM_NOME));
		portoesPossiveis.add(
			nextGate(viuAsCartas({ decisionDispatched: true, decisionAccepted: true }), COM_NOME),
		);

		// experience · timeframe · lance · lance-value · decision · contract.
		expect(portoesPossiveis.size).toBeGreaterThanOrEqual(5);
	});
});
