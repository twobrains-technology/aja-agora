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
		expect(motivo(conversa({ channel: "web" }), opcoes({ entradaWeb: true }))).toBeNull();
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
