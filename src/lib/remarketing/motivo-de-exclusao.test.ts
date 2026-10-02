// POR QUE ESTA CONVERSA NÃO ENTROU NA RÉGUA — uma fixture por motivo.
//
// O valor deste teste é o inverso do valor de um teste comum: ele não prova que
// uma frase saiu, prova que **nenhuma conversa some sem nome**. Antes dele, quem
// falhava qualquer uma das guardas de `entrarNaRegua` simplesmente não aparecia
// na consulta — e responder "por que estes 11 não entraram" era rodar as 9
// condições à mão (diagnóstico §c, AJA-09).
//
// Cada `it` isola UMA guarda: a fixture é elegível em tudo menos naquilo que o
// motivo nomeia. É o que faz o teste falhar quando a ordem dos guardas muda sem
// alguém perceber.

import { describe, expect, it } from "vitest";
import {
	avaliarElegibilidade,
	type ConversaAvaliada,
	destinoDoToque,
	MOTIVOS_DE_EXCLUSAO,
	motivoDeSaidaLegivel,
	type OpcoesDaElegibilidade,
	ROTULO_DO_MOTIVO_DE_EXCLUSAO,
	referenciaDoSilencio,
} from "./motivo-de-exclusao";

/** 12:00 UTC de inbound, 13:40 de agora: 100 min de silêncio (o guarda pede >90). */
const AGORA = new Date("2026-09-18T13:40:00Z");
const INBOUND = new Date("2026-09-18T12:00:00Z");

function conversa(over: Partial<ConversaAvaliada> = {}): ConversaAvaliada {
	return {
		channel: "whatsapp",
		status: "active",
		isSimulated: false,
		contactId: "22222222-2222-2222-2222-222222222222",
		lastInboundAt: INBOUND,
		waId: "5562999998888",
		phone: "+55 62 99999-8888",
		jaNaRegua: false,
		...over,
	};
}

function opcoes(over: Partial<OpcoesDaElegibilidade> = {}): OpcoesDaElegibilidade {
	return { reguaLigada: true, entradaWeb: false, telefoneDaEquipe: false, ...over };
}

function motivo(conversaAvaliada: ConversaAvaliada, opcoesAvaliadas = opcoes()) {
	const veredito = avaliarElegibilidade(conversaAvaliada, AGORA, opcoesAvaliadas);
	return veredito.elegivel ? null : veredito.motivo;
}

describe("avaliarElegibilidade — um motivo para cada guarda", () => {
	it("sem nada errado, é elegível", () => {
		expect(motivo(conversa())).toBeNull();
	});

	it("régua desligada: ninguém entra", () => {
		expect(motivo(conversa(), opcoes({ reguaLigada: false }))).toBe("regua_desligada");
	});

	it("conversa marcada como teste", () => {
		expect(motivo(conversa({ isSimulated: true }))).toBe("teste");
	});

	it("conversa encerrada", () => {
		expect(motivo(conversa({ status: "closed" }))).toBe("encerrada");
	});

	it("conversa com atendente (handed_off)", () => {
		expect(motivo(conversa({ status: "handed_off" }))).toBe("com_atendente");
	});

	it("conversa da web com a entrada web desligada", () => {
		expect(motivo(conversa({ channel: "web" }))).toBe("conversa_web");
	});

	it("conversa da web com a flag ligada e telefone válido entra", () => {
		// A web NUNCA grava `last_inbound_at` (só o webhook do WhatsApp escreve):
		// quem conta o silêncio dela é a FALA do cliente (D9).
		expect(
			motivo(
				conversa({ channel: "web", lastInboundAt: null, ultimaMensagemDoClienteEm: INBOUND }),
				opcoes({ entradaWeb: true }),
			),
		).toBeNull();
	});

	it("conversa da web com a flag ligada e SEM telefone válido fica fora", () => {
		expect(
			motivo(conversa({ channel: "web", waId: null, phone: null }), opcoes({ entradaWeb: true })),
		).toBe("sem_telefone");
		expect(
			motivo(conversa({ channel: "web", waId: null, phone: "1234" }), opcoes({ entradaWeb: true })),
		).toBe("sem_telefone");
	});

	it("sem contato resolvido não há como contar o teto de 30 dias", () => {
		expect(motivo(conversa({ contactId: null }))).toBe("sem_contato");
	});

	it("sem telefone de destino", () => {
		expect(motivo(conversa({ waId: null, phone: null }))).toBe("sem_telefone");
	});

	it("telefone da equipe", () => {
		expect(motivo(conversa(), opcoes({ telefoneDaEquipe: true }))).toBe("telefone_da_equipe");
	});

	it("já tem linha na régua", () => {
		expect(motivo(conversa({ jaNaRegua: true }))).toBe("ja_na_regua");
	});

	it("ainda em silêncio — menos de 90 min desde o último inbound", () => {
		expect(motivo(conversa({ lastInboundAt: new Date(AGORA.getTime() - 10 * 60_000) }))).toBe(
			"ainda_em_silencio",
		);
	});

	it("ainda em silêncio — `last_inbound_at` nulo (a corrida do FIX-86)", () => {
		expect(motivo(conversa({ lastInboundAt: null }))).toBe("ainda_em_silencio");
	});

	it("parada há mais de 7 dias: fora da janela de entrada", () => {
		expect(
			motivo(conversa({ lastInboundAt: new Date(AGORA.getTime() - 8 * 24 * 60 * 60_000) })),
		).toBe("parada_ha_mais_de_7_dias");
	});
});

describe("D9 — o silêncio da web conta da FALA do cliente, não do `last_inbound_at`", () => {
	// O defeito medido: desde 18/09, 119 conversas da web, 1 com `last_inbound_at`
	// e ZERO na régua. A coluna nunca é escrita nesse canal (quem a escreve é o
	// webhook do WhatsApp), então a guarda do silêncio excluía a web inteira com o
	// motivo `ainda_em_silencio` — o lead 774 entre eles.
	const FALA = new Date(AGORA.getTime() - 100 * 60_000);
	const web = (over: Partial<ConversaAvaliada> = {}) =>
		conversa({ channel: "web", lastInboundAt: null, ultimaMensagemDoClienteEm: FALA, ...over });

	it("a fala de 100 min atrás abre a régua, mesmo sem `last_inbound_at`", () => {
		expect(motivo(web(), opcoes({ entradaWeb: true }))).toBeNull();
	});

	it("fala recente (10 min) ainda é silêncio — a pessoa acabou de escrever", () => {
		expect(
			motivo(
				web({ ultimaMensagemDoClienteEm: new Date(AGORA.getTime() - 10 * 60_000) }),
				opcoes({ entradaWeb: true }),
			),
		).toBe("ainda_em_silencio");
	});

	it("sem fala nenhuma não há como afirmar silêncio — continua `ainda_em_silencio`", () => {
		expect(motivo(web({ ultimaMensagemDoClienteEm: null }), opcoes({ entradaWeb: true }))).toBe(
			"ainda_em_silencio",
		);
	});

	it("a janela de 7 dias da web conta da fala dela", () => {
		expect(
			motivo(
				web({ ultimaMensagemDoClienteEm: new Date(AGORA.getTime() - 8 * 24 * 60 * 60_000) }),
				opcoes({ entradaWeb: true }),
			),
		).toBe("parada_ha_mais_de_7_dias");
	});

	it("no WhatsApp o silêncio continua vindo do `last_inbound_at`", () => {
		// A fala é o mesmo fato no canal que a tem; o que não pode é ela passar a
		// mandar no WhatsApp, onde `last_inbound_at` governa a janela da Meta.
		expect(
			motivo(conversa({ ultimaMensagemDoClienteEm: new Date(AGORA.getTime() - 10 * 60_000) })),
		).toBeNull();
	});
});

describe("a ordem dos guardas é a precedência do motivo", () => {
	// A conversa que falha VÁRIAS guardas tem UM motivo: o primeiro da ordem. Sem
	// isto, duas telas (o log do ciclo e a régua do admin) responderiam diferente
	// para a mesma conversa.
	it("teste vence web, encerrada e contato", () => {
		expect(
			motivo(conversa({ isSimulated: true, channel: "web", status: "closed", contactId: null })),
		).toBe("teste");
	});

	it("encerrada vence com_atendente, contato e telefone", () => {
		expect(motivo(conversa({ status: "closed", contactId: null, waId: null, phone: null }))).toBe(
			"encerrada",
		);
	});

	it("com_atendente vence a falta de contato", () => {
		expect(motivo(conversa({ status: "handed_off", contactId: null }))).toBe("com_atendente");
	});

	it("conversa_web vence a falta de contato e de telefone", () => {
		expect(motivo(conversa({ channel: "web", contactId: null }))).toBe("conversa_web");
	});

	it("sem_contato vence sem_telefone — sem contato não há telefone a resolver", () => {
		expect(motivo(conversa({ contactId: null, waId: null, phone: null }))).toBe("sem_contato");
	});

	it("sem_telefone vence telefone da equipe e 'já na régua'", () => {
		expect(motivo(conversa({ waId: null, phone: null }), opcoes({ telefoneDaEquipe: true }))).toBe(
			"sem_telefone",
		);
	});

	it("telefone da equipe vence 'já na régua' e o silêncio", () => {
		expect(
			motivo(
				conversa({ jaNaRegua: true, lastInboundAt: null }),
				opcoes({ telefoneDaEquipe: true }),
			),
		).toBe("telefone_da_equipe");
	});

	it("já na régua vence o silêncio", () => {
		expect(motivo(conversa({ jaNaRegua: true, lastInboundAt: null }))).toBe("ja_na_regua");
	});

	it("silêncio (data desconhecida) vence a janela de 7 dias", () => {
		// `last_inbound_at` nulo não diz nada sobre a janela: o motivo nomeado é o
		// silêncio, não "parada há mais de 7 dias" — a data não existe para afirmar
		// isso.
		expect(motivo(conversa({ lastInboundAt: null }))).toBe("ainda_em_silencio");
	});
});

describe("a referência do silêncio, por canal", () => {
	it("web: a última fala do cliente; `last_inbound_at` não entra", () => {
		expect(
			referenciaDoSilencio({
				channel: "web",
				lastInboundAt: new Date(AGORA.getTime() - 60 * 60_000),
				ultimaMensagemDoClienteEm: INBOUND,
			}),
		).toEqual(INBOUND);
	});

	it("whatsapp: o último inbound, mesmo com uma fala mais nova no histórico", () => {
		expect(
			referenciaDoSilencio({
				channel: "whatsapp",
				lastInboundAt: INBOUND,
				ultimaMensagemDoClienteEm: new Date(AGORA.getTime() - 10 * 60_000),
			}),
		).toEqual(INBOUND);
	});
});

describe("o destino do toque", () => {
	it("prefere o `wa_id` da conversa ao telefone do cadastro", () => {
		expect(destinoDoToque(conversa({ waId: "5562911112222", phone: "5562933334444" }))).toBe(
			"5562911112222",
		);
	});

	it("cai no telefone do contato quando não há `wa_id` — o caso do lead da web", () => {
		expect(destinoDoToque(conversa({ waId: null, phone: "+55 62 99999-8888" }))).toBe(
			"+55 62 99999-8888",
		);
	});

	it("telefone que não parece BR não conta como destino", () => {
		expect(destinoDoToque(conversa({ waId: null, phone: "1234" }))).toBeNull();
		expect(destinoDoToque(conversa({ waId: "abc", phone: null }))).toBeNull();
		expect(destinoDoToque(conversa({ waId: null, phone: "" }))).toBeNull();
	});
});

describe("os rótulos", () => {
	it("todo motivo tem rótulo em português", () => {
		for (const m of MOTIVOS_DE_EXCLUSAO) {
			expect(ROTULO_DO_MOTIVO_DE_EXCLUSAO[m]).toBeTruthy();
		}
	});

	it("nenhum rótulo é a chave crua — acento e espaço são o mínimo", () => {
		for (const m of MOTIVOS_DE_EXCLUSAO) {
			expect(ROTULO_DO_MOTIVO_DE_EXCLUSAO[m]).not.toBe(m);
		}
	});

	it("os motivos de SAÍDA também têm rótulo legível", () => {
		expect(motivoDeSaidaLegivel("cliente_respondeu")).toBe("O cliente respondeu");
		expect(motivoDeSaidaLegivel("tres_toques_sem_resposta")).toBe("Três toques sem resposta");
		expect(motivoDeSaidaLegivel("optout_do_cliente")).toBe("O cliente pediu para sair");
		expect(motivoDeSaidaLegivel("segurado_pelo_atendente")).toBe("Segurou à mão, pelo painel");
		expect(motivoDeSaidaLegivel("teste")).toBe("Conversa de teste");
		expect(motivoDeSaidaLegivel("telefone_da_equipe")).toBe("Telefone da equipe");
	});

	it("motivo vazio ou desconhecido não inventa rótulo", () => {
		expect(motivoDeSaidaLegivel(null)).toBeNull();
		expect(motivoDeSaidaLegivel("")).toBeNull();
		// Desconhecido sai cru: inventar texto para um valor que ninguém escreveu
		// esconderia a divergência em vez de mostrá-la.
		expect(motivoDeSaidaLegivel("motivo_novo_do_futuro")).toBe("motivo_novo_do_futuro");
	});
});
