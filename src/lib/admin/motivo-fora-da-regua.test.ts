/**
 * O DICIONÁRIO DE MOTIVOS — a tela não pode discordar do ciclo.
 *
 * O teste que importa é o de EQUIVALÊNCIA: para cada um dos onze motivos, o que
 * `motivoForaDaRegua` (a tela) responde é o que `avaliarElegibilidade` (o ciclo)
 * responde. Enquanto o espelho existia, estes dois podiam divergir — a lista
 * logo abaixo do número mostraria um motivo que o motor nunca daria.
 *
 * Teste PURO: sem banco e sem relógio (o `agora` e as opções entram por
 * parâmetro).
 */

import { describe, expect, it } from "vitest";
import { avaliarElegibilidade, MOTIVOS_DE_EXCLUSAO } from "@/lib/remarketing/motivo-de-exclusao";
import {
	type ConversaAvaliada,
	MOTIVOS_FORA_DA_REGUA,
	motivoDeSaidaLegivel,
	motivoForaDaRegua,
	type MotivoForaDaRegua,
	type OpcoesDaElegibilidade,
	rotuloForaDaRegua,
} from "./motivo-fora-da-regua";

const AGORA = new Date("2026-09-18T15:00:00Z");
const DIA = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;

/** Régua ligada, entrada web desligada, telefone não é da equipe. */
const OPCOES: OpcoesDaElegibilidade = {
	reguaLigada: true,
	entradaWeb: false,
	telefoneDaEquipe: false,
};

function conversa(parcial: Partial<ConversaAvaliada> = {}): ConversaAvaliada {
	return {
		channel: "whatsapp",
		status: "active",
		isSimulated: false,
		contactId: "contact-1",
		// 2 horas de silêncio: passou dos 90 min e está dentro dos 7 dias.
		lastInboundAt: new Date(AGORA.getTime() - 2 * 60 * MIN),
		waId: "5562999999999",
		phone: null,
		jaNaRegua: false,
		...parcial,
	};
}

/**
 * A régua aceitaria esta conversa? Reescrita a partir do código do ciclo — de
 * propósito uma SEGUNDA escrita das condições, para o teste não ser tautológico.
 */
function entrariaNaRegua(c: ConversaAvaliada, agora: Date, o: OpcoesDaElegibilidade): boolean {
	if (!o.reguaLigada) return false;
	if (c.isSimulated) return false;
	if (c.status === "closed" || c.status !== "active") return false;
	if (c.channel === "web" && !o.entradaWeb) return false;
	if (!c.contactId) return false;
	if (!c.waId && !c.phone) return false;
	if (o.telefoneDaEquipe) return false;
	if (c.jaNaRegua) return false;
	if (!c.lastInboundAt) return false;
	if (c.lastInboundAt.getTime() > agora.getTime() - 90 * MIN) return false;
	if (c.lastInboundAt.getTime() <= agora.getTime() - 7 * DIA) return false;
	return true;
}

describe("equivalência com as guardas do motor", () => {
	const fixtures: ConversaAvaliada[] = [
		conversa(), // elegível
		conversa({ channel: "web" }),
		conversa({ status: "closed" }),
		conversa({ status: "handed_off" }),
		conversa({ isSimulated: true }),
		conversa({ contactId: null }),
		conversa({ waId: null, phone: null }),
		conversa({ lastInboundAt: null }),
		conversa({ lastInboundAt: new Date(AGORA.getTime() - 20 * MIN) }),
		conversa({ lastInboundAt: new Date(AGORA.getTime() - 10 * DIA) }),
	];

	it.each(fixtures.map((c, i) => [i, c] as const))(
		"a régua aceitaria ⇔ o motivo é null (fixture %i)",
		(_i, c) => {
			const motivo = motivoForaDaRegua(c, AGORA, OPCOES);
			expect(motivo === null).toBe(entrariaNaRegua(c, AGORA, OPCOES));
		},
	);

	it("telefone da equipe e já-na-régua excluem", () => {
		expect(
			motivoForaDaRegua(conversa({ waId: "556292496793" }), AGORA, {
				...OPCOES,
				telefoneDaEquipe: true,
			}),
		).toBe("telefone_da_equipe");
		expect(motivoForaDaRegua(conversa({ jaNaRegua: true }), AGORA, OPCOES)).toBe("ja_na_regua");
	});
});

describe("tela e ciclo concordam nos onze motivos", () => {
	/** Cada caso isola UM motivo: a conversa elegível, com um desvio só. */
	const casos: Array<{
		motivo: MotivoForaDaRegua;
		conversa: ConversaAvaliada;
		opcoes: OpcoesDaElegibilidade;
	}> = [
		{ motivo: "regua_desligada", conversa: conversa(), opcoes: { ...OPCOES, reguaLigada: false } },
		{ motivo: "teste", conversa: conversa({ isSimulated: true }), opcoes: OPCOES },
		{ motivo: "encerrada", conversa: conversa({ status: "closed" }), opcoes: OPCOES },
		{ motivo: "com_atendente", conversa: conversa({ status: "handed_off" }), opcoes: OPCOES },
		{ motivo: "conversa_web", conversa: conversa({ channel: "web" }), opcoes: OPCOES },
		{ motivo: "sem_contato", conversa: conversa({ contactId: null }), opcoes: OPCOES },
		{
			motivo: "sem_telefone",
			conversa: conversa({ waId: null, phone: null }),
			opcoes: OPCOES,
		},
		{
			motivo: "telefone_da_equipe",
			conversa: conversa({ waId: "556292496793" }),
			opcoes: { ...OPCOES, telefoneDaEquipe: true },
		},
		{ motivo: "ja_na_regua", conversa: conversa({ jaNaRegua: true }), opcoes: OPCOES },
		{
			motivo: "ainda_em_silencio",
			conversa: conversa({ lastInboundAt: null }),
			opcoes: OPCOES,
		},
		{
			motivo: "parada_ha_mais_de_7_dias",
			conversa: conversa({ lastInboundAt: new Date(AGORA.getTime() - 8 * DIA) }),
			opcoes: OPCOES,
		},
	];

	it("cobre os onze motivos, sem sobra nem repetição", () => {
		expect(casos.map((c) => c.motivo).sort()).toEqual([...MOTIVOS_FORA_DA_REGUA].sort());
	});

	it.each(casos)("$motivo: a tela devolve o mesmo que o ciclo", ({ motivo, conversa: c, opcoes }) => {
		const veredito = avaliarElegibilidade(c, AGORA, opcoes);
		expect(veredito.elegivel).toBe(false);
		expect(veredito.elegivel ? null : veredito.motivo).toBe(motivo);
		expect(motivoForaDaRegua(c, AGORA, opcoes)).toBe(motivo);
	});

	it("a lista de motivos da tela é a mesma tabela do ciclo", () => {
		expect([...MOTIVOS_FORA_DA_REGUA]).toEqual([...MOTIVOS_DE_EXCLUSAO]);
	});

	it("a conversa elegível não tem motivo em nenhum dos dois lados", () => {
		expect(motivoForaDaRegua(conversa(), AGORA, OPCOES)).toBeNull();
		expect(avaliarElegibilidade(conversa(), AGORA, OPCOES).elegivel).toBe(true);
	});
});

describe("cada guarda vira um motivo, na ordem", () => {
	it("régua desligada vence tudo — inclusive o lead perfeito", () => {
		expect(motivoForaDaRegua(conversa(), AGORA, { ...OPCOES, reguaLigada: false })).toBe(
			"regua_desligada",
		);
	});

	it("status vem antes do canal: web encerrada é 'encerrada'", () => {
		expect(motivoForaDaRegua(conversa({ channel: "web", status: "closed" }), AGORA, OPCOES)).toBe(
			"encerrada",
		);
	});

	it("web ativa e sem contato é conversa_web (canal antes do contato)", () => {
		expect(motivoForaDaRegua(conversa({ channel: "web", contactId: null }), AGORA, OPCOES)).toBe(
			"conversa_web",
		);
	});

	it("encerrada e com atendente", () => {
		expect(motivoForaDaRegua(conversa({ status: "closed" }), AGORA, OPCOES)).toBe("encerrada");
		expect(motivoForaDaRegua(conversa({ status: "handed_off" }), AGORA, OPCOES)).toBe(
			"com_atendente",
		);
	});

	it("marcada como teste", () => {
		expect(motivoForaDaRegua(conversa({ isSimulated: true }), AGORA, OPCOES)).toBe("teste");
	});

	it("sem contato resolvido", () => {
		expect(motivoForaDaRegua(conversa({ contactId: null }), AGORA, OPCOES)).toBe("sem_contato");
	});

	it("sem destino válido", () => {
		expect(motivoForaDaRegua(conversa({ waId: null, phone: null }), AGORA, OPCOES)).toBe(
			"sem_telefone",
		);
	});

	it("sem último inbound cai em ainda_em_silencio", () => {
		expect(motivoForaDaRegua(conversa({ lastInboundAt: null }), AGORA, OPCOES)).toBe(
			"ainda_em_silencio",
		);
	});

	it("silêncio de menos de 90 min", () => {
		expect(
			motivoForaDaRegua(
				conversa({ lastInboundAt: new Date(AGORA.getTime() - 30 * MIN) }),
				AGORA,
				OPCOES,
			),
		).toBe("ainda_em_silencio");
	});

	it("parada há mais de 7 dias", () => {
		expect(
			motivoForaDaRegua(
				conversa({ lastInboundAt: new Date(AGORA.getTime() - 8 * DIA) }),
				AGORA,
				OPCOES,
			),
		).toBe("parada_ha_mais_de_7_dias");
	});
});

describe("as flags de ambiente", () => {
	it("com entrada web ligada, web deixa de ser motivo", () => {
		expect(
			motivoForaDaRegua(conversa({ channel: "web" }), AGORA, { ...OPCOES, entradaWeb: true }),
		).toBe(null);
	});
});

describe("os rótulos", () => {
	it("todos os motivos têm rótulo e o prefixo de 'fora da régua'", () => {
		for (const motivo of MOTIVOS_FORA_DA_REGUA) {
			expect(rotuloForaDaRegua(motivo).startsWith("Fora da régua · ")).toBe(true);
		}
		expect(rotuloForaDaRegua("conversa_web")).toBe("Fora da régua · conversa da web");
	});

	it("o motivo de SAÍDA tem rótulo canônico e o desconhecido sai cru", () => {
		expect(motivoDeSaidaLegivel("teste")).toBe("Conversa de teste");
		expect(motivoDeSaidaLegivel("segurado_pelo_atendente")).toBe("Segurou à mão, pelo painel");
		expect(motivoDeSaidaLegivel("motivo_novo")).toBe("motivo_novo");
		expect(motivoDeSaidaLegivel(null)).toBeNull();
	});
});
