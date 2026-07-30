// FIX-415 — sem cota ancorada, o retry repete o contrato que EXISTE.
//
// A 12ª revisão independente pegou o pior resultado desta campanha: o FIX-414
// deixou um TESTE VERMELHO no repositório — o do próprio FIX-263, que passava no
// commit pai e falhava no HEAD. E o commit do FIX-414 afirma, com essas palavras,
// ter corrigido esse P0. Ele o criou.
//
// A mecânica é de uma linha. `administradoraConflictsWithRegisteredProposal` abre
// com `if (!registered || !requested) return false`. Enquanto o guard comparava
// contra `recommendedAdministradora` — sempre preenchida, porque o texto a
// escrevia —, `requested` nunca era nulo e essa linha era inofensiva. O FIX-414
// trocou a fonte para `contractOffer?.administradora`, que é `undefined` em toda
// jornada sem clique, ou seja na MAIORIA. O guard virou decoração.
//
// ── POR QUE A CORREÇÃO NÃO FOI "INVERTER A LINHA" ──
//
// Minha primeira tentativa foi fazer `!requested → true` (desconhecido é
// conflito). Ela quebrou o retry legítimo: cliente com proposta RODOBENS que
// tenta de novo depois de um erro de rede passou a ser bloqueado. Trocar um
// buraco por outro.
//
// A correção certa age nos DOIS lados, e a assimetria entre eles é o ponto:
//
//   · AÇÃO (`buildStartContractInput`): sem cota ancorada, a preferência cai pra
//     administradora da proposta JÁ REGISTRADA. Uma tentativa sem âncora vira
//     necessariamente um retry do MESMO contrato — nunca um sorteio do gateway
//     (`pickClosestOffer` sem preferência cai em `best(offers)`, por proximidade
//     de valor, e podia inaugurar uma segunda proposta em outra marca).
//
//   · GUARD (`route.ts`): compara contra `contractOffer ?? recommendedAdministradora`
//     — inclui o FOCO da conversa de propósito. Ser mais ESTRITO que a ação é
//     seguro: se a conversa está em ITAÚ e há proposta RODOBENS registrada, ele
//     bloqueia e avisa, em vez de mandar RODOBENS calado. Troca silenciosa de
//     administradora é o defeito que o FIX-195 nomeou e que este repo combate
//     desde então.
//
// Bloquear a mais custa uma mensagem. Bloquear a menos custa uma consulta de
// bureau no CPF de alguém.
import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import {
	administradoraConflictsWithRegisteredProposal,
	buildStartContractInput,
} from "./contract-input";

const IDENT = { cpf: "12345678909", celular: "62999887766", lgpd: true };

/** Jornada de TEXTO puro: nenhum clique, nenhuma tool. `contractOffer` ausente —
 * o estado da maioria das conversas, e o que o FIX-414 não previu. */
const SEM_ANCORA = {
	currentCategory: "auto",
	revealCompleted: true,
	recommendedAdministradora: "ITAU",
	recommendedOffer: {
		administradora: "ITAU",
		creditValue: 171_000,
		termMonths: 96,
		monthlyPayment: 2_719,
	},
	qualifyAnswers: { creditMax: 180_000 },
} as unknown as ConversationMetadata;

describe("FIX-415 — sem âncora, o contrato repete a proposta registrada", () => {
	it("com proposta registrada, a preferência é a DELA — nunca nula, nunca a do texto", () => {
		// O caso que fazia o gateway sortear. Note que o meta aponta ITAÚ (texto) e
		// a proposta registrada é RODOBENS: se a fonte fosse o texto, sairia ITAÚ —
		// segunda proposta real, em outra marca, no mesmo CPF.
		const input = buildStartContractInput(SEM_ANCORA, IDENT, {
			registeredAdministradora: "RODOBENS",
		});

		expect(input.administradoraPreferida).toBe("RODOBENS");
	});

	it("a cota ANCORADA vence a proposta registrada — o cliente escolheu depois", () => {
		// A ordem importa: quem clicou expressou uma decisão NOVA, e ela manda. O
		// guard do `route.ts` é quem barra o caso em que essa decisão nova conflita
		// com uma proposta já criada.
		const comClique = {
			...SEM_ANCORA,
			contractOffer: { administradora: "CANOPUS", creditValue: 170_000, termMonths: 120 },
		} as unknown as ConversationMetadata;

		const input = buildStartContractInput(comClique, IDENT, {
			registeredAdministradora: "RODOBENS",
		});

		expect(input.administradoraPreferida).toBe("CANOPUS");
		expect(input.prazoPreferido).toBe(120);
	});

	it("SEM proposta registrada e sem âncora, segue nulo — a parede do FIX-414 não regride", () => {
		// O primeiro fechamento da conversa. Aqui não há o que repetir, e o texto
		// continua sem poder amarrar marca nenhuma: é exatamente o invariante que o
		// FIX-414 instalou, e ele não pode ser desfeito por este fix.
		expect(buildStartContractInput(SEM_ANCORA, IDENT).administradoraPreferida).toBeNull();
		expect(
			buildStartContractInput(SEM_ANCORA, IDENT, { registeredAdministradora: null })
				.administradoraPreferida,
		).toBeNull();
	});

	it("o predicado do guard segue simétrico e normalizado", () => {
		// Sem proposta registrada nada bloqueia — senão morreria todo primeiro
		// fechamento, que é a esmagadora maioria.
		expect(administradoraConflictsWithRegisteredProposal(null, "ITAU")).toBe(false);
		// Marca diferente bloqueia (o invariante do FIX-263).
		expect(administradoraConflictsWithRegisteredProposal("RODOBENS", "ITAÚ")).toBe(true);
		// Mesma marca passa — acento e caixa não inventam conflito.
		expect(administradoraConflictsWithRegisteredProposal("ITAÚ", "Itau")).toBe(false);
		// Sem marca pedida não conflita, e agora por um motivo MAIS FORTE que
		// "nada pra comparar": a ação manda a registrada, então não há como
		// divergir.
		expect(administradoraConflictsWithRegisteredProposal("RODOBENS", undefined)).toBe(false);
	});
});
