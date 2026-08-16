// Acolhida N1 pós-handoff — a decisão, em código puro.
//
// ## O caso
//
// Conversa `75f77efd`: cliente fecha proposta na **sexta 14/08 às 19:02**, é
// entregue à mesa, escreve, e não recebe nada. 28,9 horas depois, silêncio.
//
// ## O que a crítica do especialista mudou no desenho
//
// 1. **A mesa não ignorou.** A notificação de handoff levou 42 min para ser
//    `delivered` e 17h24 para ser `read` no WhatsApp do atendente, com o painel
//    sem nenhum listener conectado. O N1 é acolhimento, não conserto — a
//    campainha tem tratamento próprio.
// 2. **Não pode ser inline no inbound.** A geração leva 3–8 s e o atendente
//    digita nesse intervalo; falar por cima do humano é o incidente de
//    2026-08-10. Por isso a decisão é pura e re-checável, e o worker a consulta
//    DE NOVO imediatamente antes de emitir.
// 3. **Não citar tempo de fila.** Havia handoffs abertos há 28h, 61h, 128h e
//    129h — dizer "há 129 horas" a quem já foi atendido é pior que calar.
// 4. **"A mesa falou" não pode ser `role='assistant' AND persona_id IS NULL`
//    puro:** a nota `[sistema] … encerrou o atendimento` (`proxy.ts:672-676`)
//    casa com esse predicado. Um `/fim` calaria o N1 para sempre.
import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import {
	buildAcolhidaN1Directive,
	type DecisaoDeAcolhida,
	decidirAcolhidaN1,
	ehFalaDaMesa,
	GRACE_ACOLHIDA_N1_MS,
} from "./acolhida-n1";

/** O motivo só existe no ramo que não acolhe — o narrowing fica aqui, e não
 * espalhado por cada asserção. */
const motivoDe = (d: DecisaoDeAcolhida) => (d.acolher ? null : d.motivo);

const AGORA = new Date("2026-08-16T00:30:00-03:00").getTime();
const UMA_HORA = 60 * 60_000;

const PROPOSTA_REAL = {
	administradora: "ITAÚ",
	creditValue: 211258,
	monthlyPayment: 5445.27,
	termMonths: 47,
};

function metaEntregueAMesa(extra: Partial<ConversationMetadata> = {}): ConversationMetadata {
	return {
		contractClosed: true,
		currentCategory: "auto",
		recommendedAdministradora: "ITAÚ",
		...extra,
	} as unknown as ConversationMetadata;
}

describe("ehFalaDaMesa — quem realmente falou com o cliente", () => {
	it("mensagem do atendente pelo painel conta", () => {
		expect(
			ehFalaDaMesa({ role: "assistant", personaId: null, content: "Oi Ana, sou o Paulo daqui." }),
		).toBe(true);
	});

	it("fala do agente (tem persona) não conta", () => {
		expect(ehFalaDaMesa({ role: "assistant", personaId: "auto", content: "Que legal!" })).toBe(
			false,
		);
	});

	it("nota de sistema do /fim NÃO conta — senão um encerramento cala o N1 para sempre", () => {
		expect(
			ehFalaDaMesa({
				role: "assistant",
				personaId: null,
				content: "[sistema] Paulo encerrou o atendimento.",
			}),
		).toBe(false);
	});

	it("mensagem do cliente não conta", () => {
		expect(ehFalaDaMesa({ role: "user", personaId: null, content: "oi?" })).toBe(false);
	});
});

describe("decidirAcolhidaN1 — quando acolher", () => {
	const base = {
		meta: metaEntregueAMesa(),
		agora: AGORA,
		ultimoInboundDoClienteEm: AGORA - GRACE_ACOLHIDA_N1_MS - 60_000,
		ultimaFalaDaMesaEm: null,
		temPropostaReal: true,
	};

	it("cliente escreveu, mesa muda, grace vencida → acolhe", () => {
		const d = decidirAcolhidaN1(base);
		expect(d.acolher).toBe(true);
	});

	it("dentro da grace window → NÃO acolhe (a mesa ainda pode estar digitando)", () => {
		const d = decidirAcolhidaN1({ ...base, ultimoInboundDoClienteEm: AGORA - 30_000 });
		expect(d.acolher).toBe(false);
		expect(motivoDe(d)).toBe("grace-window");
	});

	it("a mesa falou DEPOIS do inbound → nunca acolhe (não se fala por cima de quem atende)", () => {
		const d = decidirAcolhidaN1({ ...base, ultimaFalaDaMesaEm: AGORA - 10_000 });
		expect(d.acolher).toBe(false);
		expect(motivoDe(d)).toBe("mesa-respondeu");
	});

	it("corrida: decisão vale ANTES, e deixa de valer quando a mesa fala durante a geração", () => {
		// É esta a proteção do invariante de 2026-08-10. O worker consulta a
		// decisão, gera (3–8 s), e consulta DE NOVO antes de emitir.
		const antes = decidirAcolhidaN1(base);
		expect(antes.acolher).toBe(true);

		const durante = decidirAcolhidaN1({ ...base, ultimaFalaDaMesaEm: AGORA - 1_000 });
		expect(durante.acolher).toBe(false);
		expect(motivoDe(durante)).toBe("mesa-respondeu");
	});

	it("cliente não escreveu desde o handoff → não acolhe (ninguém está esperando resposta)", () => {
		const d = decidirAcolhidaN1({ ...base, ultimoInboundDoClienteEm: null });
		expect(d.acolher).toBe(false);
		expect(motivoDe(d)).toBe("sem-inbound");
	});

	it("cinco mensagens seguidas do cliente geram UMA acolhida", () => {
		const primeira = decidirAcolhidaN1(base);
		expect(primeira.acolher).toBe(true);

		// Depois de acolher, o contador é gravado ANTES do disparo (mesma doutrina
		// da retomada): a 2ª tentativa no mesmo período não passa.
		const jaAcolhida = metaEntregueAMesa({
			acolhidaN1: { attempts: 1, lastAt: AGORA - 60_000 },
		} as Partial<ConversationMetadata>);
		const segunda = decidirAcolhidaN1({ ...base, meta: jaAcolhida });
		expect(segunda.acolher).toBe(false);
		expect(motivoDe(segunda)).toBe("ja-acolhida");
	});

	it("passado o backoff, uma segunda acolhida é permitida — e uma terceira não", () => {
		const depoisDoBackoff = metaEntregueAMesa({
			acolhidaN1: { attempts: 1, lastAt: AGORA - 12 * UMA_HORA },
		} as Partial<ConversationMetadata>);
		expect(decidirAcolhidaN1({ ...base, meta: depoisDoBackoff }).acolher).toBe(true);

		const noTeto = metaEntregueAMesa({
			acolhidaN1: { attempts: 2, lastAt: AGORA - 48 * UMA_HORA },
		} as Partial<ConversationMetadata>);
		const d = decidirAcolhidaN1({ ...base, meta: noTeto });
		expect(d.acolher).toBe(false);
		expect(motivoDe(d)).toBe("teto-atingido");
	});
});

describe("buildAcolhidaN1Directive — o que o servidor conta ao modelo", () => {
	const directive = () =>
		buildAcolhidaN1Directive(metaEntregueAMesa(), {
			proposta: PROPOSTA_REAL,
		});

	it("é instrução de sistema e diz que a conversa está com a mesa", () => {
		const d = directive();
		expect(d).toContain("[instrução do sistema");
		expect(d.toLowerCase()).toContain("mesa");
	});

	it("cita a proposta REAL registrada, com os números do banco", () => {
		const d = directive();
		expect(d).toContain("211.258");
		expect(d).toContain("ITAÚ");
	});

	it("NÃO cita tempo de fila nem promete prazo de retorno", () => {
		const d = directive();
		// Havia handoff aberto há 129 horas: citar espera é prometer o que não se
		// controla, e soa absurdo para quem já foi atendido.
		expect(d).not.toMatch(/\b\d+\s*(horas?|dias?|minutos?)\b/i);
		expect(d.toLowerCase()).not.toContain("em breve");
		expect(d.toLowerCase()).not.toContain("até amanhã");
	});

	it("proíbe retomar a venda e proíbe nome de tool", () => {
		const d = directive();
		expect(d.toLowerCase()).toContain("não retome");
		expect(d).not.toMatch(/search_groups|simulate_quota|present_\w+/);
	});

	it("sem proposta registrada, não inventa uma", () => {
		const d = buildAcolhidaN1Directive(metaEntregueAMesa(), {
			proposta: null,
		});
		expect(d).not.toContain("R$");
	});

	it("a assinatura não aceita canal — a paridade é estrutural, não uma asserção", () => {
		// Comparar duas chamadas idênticas provaria nada. O que garante paridade é
		// o canal NÃO existir como entrada: não há por onde os dois divergirem.
		// Toda vez que este produto deixou o canal entrar numa regra, a regra virou
		// duas e uma ficou para trás (as sete costuras do dossiê de 15/08).
		//
		// A paridade de ponta a ponta — mesma decisão, mesmo directive, nos dois
		// canais — é exercida no ciclo (`acolhida-n1-cycle.test.ts`, aceite 4).
		const parametros = buildAcolhidaN1Directive.length;
		expect(parametros).toBe(2); // (meta, { proposta }) — sem channel
	});

	it("distingue quem FECHOU contrato de quem só foi passado à mesa", () => {
		const fechou = buildAcolhidaN1Directive(metaEntregueAMesa({ contractClosed: true }), {
			proposta: PROPOSTA_REAL,
		});
		const naoFechou = buildAcolhidaN1Directive(
			metaEntregueAMesa({ contractClosed: false } as Partial<ConversationMetadata>),
			{ proposta: null },
		);
		expect(fechou).toContain("JÁ FECHOU");
		expect(naoFechou).not.toContain("JÁ FECHOU");
	});
});
