import { describe, expect, it } from "vitest";
import { turnoVazio } from "./ler-turno";
import {
	ARTIFACTS_DE_PROPOSTA,
	cardQueNaoApareceu,
	chamouFila,
	chegouAProposta,
	falouPrazo,
	marcarSimulacao,
	numeroSemFerramenta,
	numerosDoPayload,
	pedidoRepetido,
	respostaCortada,
	turnoSemResposta,
} from "./marcacoes";
import type { ArtifactLido, DadosDaSimulacao, ToolCallLido, TurnoDaSimulacao } from "./tipos";

type Opc = {
	cliente?: string;
	texto?: string | string[];
	toolCalls?: ToolCallLido[];
	artifacts?: ArtifactLido[];
	eco?: DadosDaSimulacao | null;
	final?: boolean;
	erro?: string | null;
	status?: number;
};

function turno(indice: number, o: Opc = {}): TurnoDaSimulacao {
	const baloes = o.texto === undefined ? [] : Array.isArray(o.texto) ? o.texto : [o.texto];
	return {
		indice,
		cliente: { texto: o.cliente ?? "oi", origem: "ia" },
		vendedor: {
			...turnoVazio(o.status ?? 200),
			baloesFinais: baloes.map((texto) => ({ texto, promessa: null })),
			textoDosEventos: baloes,
			toolCalls: o.toolCalls ?? [],
			artifacts: o.artifacts ?? [],
			dadosEcoados: o.eco ?? null,
			finalRecebido: o.final ?? true,
			erro: o.erro ?? null,
		},
		duracaoMs: 1,
	};
}

const dadosDuble: DadosDaSimulacao = {
	fonteDeDados: "duble",
	catalogo: "padrao",
	fila: { atendentes: 2 },
};
const chamada = (toolName: string, toolCallId = "t1"): ToolCallLido => ({
	toolName,
	input: {},
	toolCallId,
});
const chamadaComInput = (toolName: string, input: unknown, toolCallId = "t1"): ToolCallLido => ({
	toolName,
	input,
	toolCallId,
});
const artifact = (artifactType: string, payload = {}, toolCallId = "t1"): ArtifactLido => ({
	artifactType,
	payload,
	toolCallId,
});

describe("chegouAProposta", () => {
	it("ACIONADA com fazer_proposta e real_offer", () => {
		const m = chegouAProposta([
			turno(0, {
				texto: "Pronto.",
				toolCalls: [chamada("fazer_proposta")],
				artifacts: [artifact("real_offer")],
			}),
		]);
		expect(m.status).toBe("ACIONADA");
		expect(m.gravidade).toBe("SUCESSO");
		expect(ARTIFACTS_DE_PROPOSTA).toContain("real_offer");
	});
	it("LIMPA sem artifact de proposta", () => {
		const m = chegouAProposta([
			turno(0, { texto: "Pronto.", toolCalls: [chamada("fazer_proposta")] }),
			turno(1, { texto: "Ok.", artifacts: [artifact("real_offer")] }),
		]);
		expect(m.status).toBe("LIMPA");
	});
});

describe("pedidoRepetido", () => {
	it("ACIONADA quando pede o nome de novo depois da resposta", () => {
		const m = pedidoRepetido([
			turno(0, { cliente: "oi", texto: "Qual é o seu nome?" }),
			turno(1, { cliente: "Maria", texto: "Prazer! Como você se chama mesmo?" }),
		]);
		expect(m.status).toBe("ACIONADA");
		expect(m.ocorrencias[0].turno).toBe(1);
	});
	it("LIMPA quando pede uma vez", () => {
		const m = pedidoRepetido([
			turno(0, { cliente: "oi", texto: "Qual é o seu nome?" }),
			turno(1, { cliente: "Maria", texto: "Prazer, Maria! Quanto você quer investir?" }),
		]);
		expect(m.status).toBe("LIMPA");
	});
	it("LIMPA: afirma parcela ('ficaram abaixo dos seus 1.300') sem pedir de novo", () => {
		const m = pedidoRepetido([
			turno(0, { cliente: "oi", texto: "Qual parcela cabe no seu bolso?" }),
			turno(1, {
				cliente: "900 tá ótimo",
				texto: "Ótimo. Todas as parcelas ficaram abaixo dos seus 1.300.",
			}),
		]);
		expect(m.status).toBe("LIMPA");
	});
	it("ACIONADA: pede a parcela de novo depois da resposta", () => {
		const m = pedidoRepetido([
			turno(0, { cliente: "oi", texto: "Qual parcela cabe no seu bolso?" }),
			turno(1, { cliente: "900 tá ótimo", texto: "Ótimo. E qual parcela você paga hoje?" }),
		]);
		expect(m.status).toBe("ACIONADA");
		expect(m.ocorrencias[0].turno).toBe(1);
	});
	it("ACIONADA: imperativo de pedido ('me passa a parcela') repete", () => {
		const m = pedidoRepetido([
			turno(0, { cliente: "oi", texto: "Me passa a parcela." }),
			turno(1, { cliente: "900", texto: "Fechado. Me manda a parcela da carta de novo." }),
		]);
		expect(m.status).toBe("ACIONADA");
	});
});

describe("cardQueNaoApareceu", () => {
	it("ACIONADA: mostrar_card sem artifact do mesmo toolCallId", () => {
		const m = cardQueNaoApareceu([
			turno(0, {
				texto: "Aqui.",
				toolCalls: [chamada("mostrar_card", "a")],
				artifacts: [artifact("x", {}, "b")],
			}),
		]);
		expect(m.status).toBe("ACIONADA");
	});
	it("LIMPA: mostrar_card com artifact do mesmo toolCallId", () => {
		const m = cardQueNaoApareceu([
			turno(0, {
				texto: "Aqui.",
				toolCalls: [chamada("mostrar_card", "a")],
				artifacts: [artifact("x", {}, "a")],
			}),
		]);
		expect(m.status).toBe("LIMPA");
	});
	it("LIMPA: artifact de mesmo tipo que o input.tipo do mostrar_card, com id divergente", () => {
		// Prova real: mostrar_card { tipo: 'whatsapp_optin' } com artifact whatsapp_optin
		// de outro toolCallId. O card apareceu; não é card ausente.
		const m = cardQueNaoApareceu([
			turno(0, {
				texto: "Prontinho.",
				toolCalls: [chamadaComInput("mostrar_card", { tipo: "whatsapp_optin" }, "a")],
				artifacts: [artifact("whatsapp_optin", {}, "b")],
			}),
		]);
		expect(m.status).toBe("LIMPA");
	});
	it("ACIONADA: mostrar_card com input.tipo e nenhum artifact", () => {
		const m = cardQueNaoApareceu([
			turno(0, {
				texto: "Aqui.",
				toolCalls: [chamadaComInput("mostrar_card", { tipo: "whatsapp_optin" }, "a")],
			}),
		]);
		expect(m.status).toBe("ACIONADA");
		expect(m.ocorrencias[0].evidencia).toContain("whatsapp_optin");
	});
	it("ACIONADA: 'segue a tabela' sem artifact", () => {
		const m = cardQueNaoApareceu([turno(0, { texto: "Segue a tabela com as opções." })]);
		expect(m.status).toBe("ACIONADA");
	});
	it("LIMPA: card sem citar carta no texto não é defeito", () => {
		const m = cardQueNaoApareceu([
			turno(0, { texto: "Essa é a melhor.", artifacts: [artifact("comparison_table")] }),
		]);
		expect(m.status).toBe("LIMPA");
	});
});

describe("respostaCortada", () => {
	it("ACIONADA: termina em '…que é'", () => {
		expect(
			respostaCortada([turno(0, { texto: "A taxa é menor do que o financiamento, que é" })]).status,
		).toBe("ACIONADA");
	});
	it("LIMPA: termina em '?'", () => {
		expect(respostaCortada([turno(0, { texto: "Quer ver as opções?" })]).status).toBe("LIMPA");
	});
	it("LIMPA: termina em emoji", () => {
		expect(respostaCortada([turno(0, { texto: "Fechado 👍" })]).status).toBe("LIMPA");
	});
	it("ACIONADA: stream sem final com texto parcial pontuado", () => {
		const t = turno(0, { texto: "Oi.", final: false });
		t.vendedor.baloesFinais = [];
		expect(respostaCortada([t]).status).toBe("ACIONADA");
	});
	it("ACIONADA: erro depois de texto", () => {
		expect(respostaCortada([turno(0, { texto: "Oi.", erro: "O turno falhou." })]).status).toBe(
			"ACIONADA",
		);
	});
	it("não acusa turno sem texto", () => {
		expect(respostaCortada([turno(0, {})]).status).toBe("LIMPA");
	});
});

describe("turnoSemResposta", () => {
	it("ACIONADA: frase de reserva do motor", () => {
		const m = turnoSemResposta([
			turno(0, { texto: "Desculpa, me perdi aqui. Pode me contar de novo o que você quer?" }),
		]);
		expect(m.status).toBe("ACIONADA");
	});
	it("ACIONADA: sem texto algum", () => {
		expect(turnoSemResposta([turno(0, {})]).status).toBe("ACIONADA");
	});
	it("ACIONADA: erro HTTP sem texto", () => {
		expect(turnoSemResposta([turno(0, { status: 502, erro: "HTTP 502" })]).status).toBe("ACIONADA");
	});
	it("LIMPA: resposta normal", () => {
		expect(turnoSemResposta([turno(0, { texto: "Claro, vamos lá." })]).status).toBe("LIMPA");
	});
});

describe("numeroSemFerramenta", () => {
	it("ACIONADA: R$ 1.500 sem payload, cliente nem catálogo", () => {
		const m = numeroSemFerramenta([turno(0, { texto: "A parcela fica em R$ 1.500." })], [100000]);
		expect(m.status).toBe("ACIONADA");
	});
	it("LIMPA: 977,12 coberto por card", () => {
		const m = numeroSemFerramenta(
			[
				turno(0, {
					texto: "A parcela é R$ 977,12.",
					artifacts: [artifact("comparison_table", { rows: [{ parcela: 977.12 }] })],
				}),
			],
			[],
		);
		expect(m.status).toBe("LIMPA");
	});
	it("LIMPA: número do catálogo conhecido", () => {
		const m = numeroSemFerramenta([turno(0, { texto: "A parcela é R$ 977,12." })], [977.12]);
		expect(m.status).toBe("LIMPA");
	});
	it("LIMPA: número dito pelo cliente", () => {
		const m = numeroSemFerramenta(
			[
				turno(0, { cliente: "quero 80 mil", texto: "Beleza, R$ 80 mil então." }),
				turno(1, { texto: "Com R$ 80 mil dá." }),
			],
			[],
		);
		expect(m.status).toBe("LIMPA");
	});
	it("NAO_APLICAVEL: catálogo desconhecido", () => {
		const m = numeroSemFerramenta([turno(0, { texto: "R$ 1.500" })], null);
		expect(m.status).toBe("NAO_APLICAVEL");
		expect(m.motivoNaoAplicavel).toBeTruthy();
	});
});

describe("chamouFila", () => {
	it("ACIONADA com falar_com_humano", () => {
		const m = chamouFila(
			[turno(0, { texto: "Chamei.", toolCalls: [chamada("falar_com_humano")] })],
			dadosDuble,
		);
		expect(m.status).toBe("ACIONADA");
		expect(m.gravidade).toBe("INFORMATIVA");
	});
	it("LIMPA com eco confirmado e sem chamada", () => {
		const m = chamouFila([turno(0, { texto: "Oi.", eco: dadosDuble })], dadosDuble);
		expect(m.status).toBe("LIMPA");
	});
	it("NAO_APLICAVEL no dublê sem eco do servidor", () => {
		const m = chamouFila([turno(0, { texto: "Oi." })], dadosDuble);
		expect(m.status).toBe("NAO_APLICAVEL");
		expect(m.motivoNaoAplicavel).toBe("servidor não confirmou o dublê da fila");
	});
});

describe("falouPrazo", () => {
	it("ACIONADA: 'ele te chama em instantes'", () => {
		expect(falouPrazo([turno(0, { texto: "Ele te chama em instantes." })]).status).toBe("ACIONADA");
	});
	it("ACIONADA: 'em breve' com verbo de atendimento", () => {
		expect(falouPrazo([turno(0, { texto: "Em breve alguém entra em contato." })]).status).toBe(
			"ACIONADA",
		);
	});
	it("LIMPA: 'em breve' sem atendimento e retorno sem prazo", () => {
		expect(
			falouPrazo([turno(0, { texto: "Em breve a taxa muda. Amanhã cedo alguém te retorna." })])
				.status,
		).toBe("LIMPA");
	});
});

describe("numerosDoPayload", () => {
	it("recursivo, número e string numérica", () => {
		expect(
			numerosDoPayload({ a: 1, b: ["977,12", { c: 2.5 }], d: "texto", e: Number.NaN }),
		).toEqual([1, 977.12, 2.5]);
	});
});

describe("marcarSimulacao", () => {
	it("devolve as 8 marcações na ordem de MarcacaoId", () => {
		const m = marcarSimulacao([turno(0, { texto: "Oi, tudo bem?" })], {
			perfil: { id: "caminho-feliz", esperaProposta: true, esperaFila: false },
			dados: dadosDuble,
			numerosConhecidos: null,
		});
		expect(m.map((x) => x.id)).toEqual([
			"chegou-a-proposta",
			"pedido-repetido",
			"card-que-nao-apareceu",
			"resposta-cortada",
			"turno-sem-resposta",
			"numero-sem-ferramenta",
			"chamou-fila",
			"falou-prazo",
		]);
	});
});
