/**
 * O DICIONÁRIO DE MOTIVOS — o espelho das guardas de `entrarNaRegua`.
 *
 * O teste que importa é o de EQUIVALÊNCIA: para cada fixture, a conversa entra
 * na régua exatamente quando o motivo é `null`. Se as duas listas de guardas
 * divergirem, este teste fica vermelho antes de a tela mostrar um motivo errado.
 *
 * Teste PURO: sem banco e sem relógio (o `agora` entra por parâmetro, e o env
 * entra explícito para não depender do ambiente de quem roda).
 */

import { describe, expect, it } from "vitest";
import {
	type ConversaAvaliavel,
	MOTIVOS_FORA_DA_REGUA,
	motivoForaDaRegua,
} from "./motivo-fora-da-regua";

const AGORA = new Date("2026-09-18T15:00:00Z");
const DIA = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;

/** Env com a régua ligada e sem entrada web — o estado de produção hoje. */
const ENV_LIGADA = { REMARKETING_ATIVO: "1" } as Record<string, string | undefined>;

function conversa(parcial: Partial<ConversaAvaliavel> = {}): ConversaAvaliavel {
	return {
		channel: "whatsapp",
		status: "active",
		isSimulated: false,
		contactId: "contact-1",
		// 2 horas de silêncio: passou dos 90 min e está dentro dos 7 dias.
		lastInboundAt: new Date(AGORA.getTime() - 2 * 60 * MIN),
		temTelefone: true,
		ehDaEquipe: false,
		temLinhaNaRegua: false,
		...parcial,
	};
}

/**
 * Reimplementa as guardas de `entrarNaRegua` — a régua aceitaria esta conversa?
 *
 * É de propósito uma SEGUNDA escrita das mesmas condições: se fosse a mesma
 * função do motivo, o teste de equivalência seria tautológico.
 */
function entrariaNaRegua(c: ConversaAvaliavel, agora: Date): boolean {
	if (c.temLinhaNaRegua) return true; // já está na régua
	if (c.channel !== "whatsapp") return false;
	if (c.status !== "active") return false;
	if (c.isSimulated) return false;
	if (c.contactId === null) return false;
	if (c.lastInboundAt === null) return false;
	if (c.lastInboundAt.getTime() > agora.getTime() - 90 * MIN) return false;
	if (c.lastInboundAt.getTime() <= agora.getTime() - 7 * DIA) return false;
	if (c.ehDaEquipe) return false;
	return true;
}

describe("equivalência com as guardas do motor", () => {
	const fixtures: ConversaAvaliavel[] = [
		conversa(), // elegível
		conversa({ channel: "web" }),
		conversa({ status: "closed" }),
		conversa({ status: "handed_off" }),
		conversa({ isSimulated: true }),
		conversa({ contactId: null }),
		conversa({ lastInboundAt: null }),
		conversa({ temTelefone: false }),
		conversa({ lastInboundAt: new Date(AGORA.getTime() - 20 * MIN) }),
		conversa({ lastInboundAt: new Date(AGORA.getTime() - 10 * DIA) }),
		conversa({ ehDaEquipe: true }),
		conversa({ temLinhaNaRegua: true }),
	];

	it.each(fixtures.map((c, i) => [i, c] as const))(
		"a régua aceitaria ⇔ o motivo é null (fixture %i)",
		(_i, c) => {
			const motivo = motivoForaDaRegua(c, AGORA, ENV_LIGADA);
			const aceitaria = entrariaNaRegua(c, AGORA);
			expect(motivo === null).toBe(aceitaria);
		},
	);
});

describe("cada guarda vira um motivo, na ordem", () => {
	it("web é conversa_web antes de tudo o mais", () => {
		expect(
			motivoForaDaRegua(conversa({ channel: "web", status: "closed" }), AGORA, ENV_LIGADA),
		).toBe("conversa_web");
	});

	it("encerrada e com atendente", () => {
		expect(motivoForaDaRegua(conversa({ status: "closed" }), AGORA, ENV_LIGADA)).toBe("encerrada");
		expect(motivoForaDaRegua(conversa({ status: "handed_off" }), AGORA, ENV_LIGADA)).toBe(
			"com_atendente",
		);
	});

	it("marcada como teste", () => {
		expect(motivoForaDaRegua(conversa({ isSimulated: true }), AGORA, ENV_LIGADA)).toBe("teste");
	});

	it("sem contato resolvido", () => {
		expect(motivoForaDaRegua(conversa({ contactId: null }), AGORA, ENV_LIGADA)).toBe("sem_contato");
	});

	it("sem telefone alcançável não é motivo (não é guarda de entrada)", () => {
		// `temTelefone` é fato de borda, não guarda de `entrarNaRegua`.
		expect(motivoForaDaRegua(conversa({ temTelefone: false }), AGORA, ENV_LIGADA)).toBeNull();
	});

	it("sem último inbound registrado cai em sem_telefone", () => {
		expect(motivoForaDaRegua(conversa({ lastInboundAt: null }), AGORA, ENV_LIGADA)).toBe(
			"sem_telefone",
		);
	});

	it("ainda em silêncio há menos de 90 min", () => {
		expect(
			motivoForaDaRegua(
				conversa({ lastInboundAt: new Date(AGORA.getTime() - 30 * MIN) }),
				AGORA,
				ENV_LIGADA,
			),
		).toBe("ainda_em_silencio");
	});

	it("parada há mais de 7 dias", () => {
		expect(
			motivoForaDaRegua(
				conversa({ lastInboundAt: new Date(AGORA.getTime() - 8 * DIA) }),
				AGORA,
				ENV_LIGADA,
			),
		).toBe("parada_ha_mais_de_7_dias");
	});

	it("telefone da equipe", () => {
		expect(motivoForaDaRegua(conversa({ ehDaEquipe: true }), AGORA, ENV_LIGADA)).toBe(
			"telefone_da_equipe",
		);
	});

	it("conversa já na régua não está 'fora' (null)", () => {
		expect(motivoForaDaRegua(conversa({ temLinhaNaRegua: true }), AGORA, ENV_LIGADA)).toBeNull();
	});
});

describe("as flags de ambiente", () => {
	it("com REMARKETING_ENTRADA_WEB ligada, web deixa de ser motivo", () => {
		const env = { REMARKETING_ATIVO: "1", REMARKETING_ENTRADA_WEB: "true" };
		expect(motivoForaDaRegua(conversa({ channel: "web" }), AGORA, env)).toBeNull();
	});

	it("com a régua desligada, quem passaria em tudo vira regua_desligada", () => {
		expect(motivoForaDaRegua(conversa(), AGORA, {})).toBe("regua_desligada");
	});

	it("elegível com a régua ligada é null (entra no próximo ciclo)", () => {
		expect(motivoForaDaRegua(conversa(), AGORA, ENV_LIGADA)).toBeNull();
	});

	it("a régua desligada não esconde o motivo real de quem tem uma guarda falhando", () => {
		expect(motivoForaDaRegua(conversa({ channel: "web" }), AGORA, {})).toBe("conversa_web");
	});
});

describe("o tipo cobre exatamente a lista", () => {
	it("todos os motivos têm pelo menos um caso", () => {
		const vistos = new Set(
			[
				conversa({ channel: "web" }),
				conversa({ status: "closed" }),
				conversa({ status: "handed_off" }),
				conversa({ isSimulated: true }),
				conversa({ contactId: null }),
				conversa({ lastInboundAt: null }),
				conversa({ lastInboundAt: new Date(AGORA.getTime() - 10 * MIN) }),
				conversa({ lastInboundAt: new Date(AGORA.getTime() - 8 * DIA) }),
				conversa({ ehDaEquipe: true }),
			].map((c) => motivoForaDaRegua(c, AGORA, ENV_LIGADA)),
		);
		vistos.add(motivoForaDaRegua(conversa(), AGORA, {}));
		for (const motivo of MOTIVOS_FORA_DA_REGUA) {
			expect(vistos.has(motivo), `motivo sem caso: ${motivo}`).toBe(true);
		}
	});
});
