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
	it("LIMPA: o vendedor só MENCIONA o dado numa afirmação (caminho-feliz t9 real)", () => {
		const m = pedidoRepetido([
			turno(0, { cliente: "oi", texto: "Qual parcela você topa pagar por mês?" }),
			turno(1, {
				cliente: "uns 500",
				texto:
					"Perfeito! Agora vou gerar sua proposta com a do Itaú:\n\nA parcela fica em R$ 518 por mês.",
			}),
		]);
		expect(m.status).toBe("LIMPA");
	});
	it("LIMPA: pergunta que oferece alternativa ou explicação, sem pedir o dado", () => {
		const m = pedidoRepetido([
			turno(0, { cliente: "oi", texto: "Qual valor você quer?" }),
			turno(1, {
				cliente: "60 mil",
				texto: "Quer seguir com essa ou quer ver outra faixa de valor?",
			}),
			turno(2, { cliente: "sim", texto: "Quer saber mais sobre o lance?" }),
		]);
		expect(m.status).toBe("LIMPA");
	});
	it("ACIONADA: pergunta de novo o valor que o cliente já deu", () => {
		const m = pedidoRepetido([
			turno(0, { cliente: "oi", texto: "Qual valor você quer?" }),
			turno(1, { cliente: "60 mil", texto: "Beleza. Qual é o valor do imóvel que você pensa?" }),
		]);
		expect(m.status).toBe("ACIONADA");
		expect(m.ocorrencias[0].turno).toBe(1);
	});
});

describe("cardQueNaoApareceu", () => {
	// Trecho real da rodada 2026-11-04T23-22, caminho-feliz turno 3: o servidor emite o artifact com
	// OUTRO id (uuid) que o toolCallId do modelo.
	const IDS = ["6a0ca9c83e68cce9b61d36a1", "6a0ca9c73e68cce9b61d30df", "6a0ca9c73e68cce9b61d3143"];
	const mostrar = (
		tipo: string,
		payload: unknown,
		toolCallId = "toolu_01BvfVAX",
	): ToolCallLido => ({
		toolName: "mostrar_card",
		input: { tipo, payload },
		toolCallId,
	});
	const tabela = (ids: string[], toolCallId = "3e370138-d8e9-4a18-9db0-bc421664ddb7") =>
		artifact("comparison_table", { groups: ids.map((id) => ({ id, groupId: id })) }, toolCallId);

	it("LIMPA: card veio com id de artifact diferente do toolCallId (turno real)", () => {
		const m = cardQueNaoApareceu([
			turno(3, {
				texto: "Achei três opções.",
				toolCalls: [mostrar("comparison_table", { ids: IDS })],
				artifacts: [tabela(IDS), artifact("quick_reply", {}, "f7ab394a")],
			}),
		]);
		expect(m.status).toBe("LIMPA");
	});
	it("ACIONADA: mostrar_card de um tipo e nenhum artifact desse tipo", () => {
		const m = cardQueNaoApareceu([
			turno(0, {
				texto: "Aqui.",
				toolCalls: [mostrar("comparison_table", { ids: IDS })],
				artifacts: [artifact("quick_reply", {}, "b")],
			}),
		]);
		expect(m.status).toBe("ACIONADA");
		expect(m.ocorrencias[0].evidencia).toContain("comparison_table");
	});
	it("ACIONADA: comparison_table veio com ids diferentes dos pedidos", () => {
		const m = cardQueNaoApareceu([
			turno(0, {
				texto: "Aqui.",
				toolCalls: [mostrar("comparison_table", { ids: IDS })],
				artifacts: [tabela([IDS[0], "outro"])],
			}),
		]);
		expect(m.status).toBe("ACIONADA");
		expect(m.ocorrencias[0].evidencia).toContain("ids");
	});
	it("LIMPA: dois mostrar_card do mesmo tipo casam um artifact cada", () => {
		const m = cardQueNaoApareceu([
			turno(0, {
				texto: "Aqui.",
				toolCalls: [
					mostrar("group_card", { groupId: "g1" }, "a"),
					mostrar("group_card", { groupId: "g2" }, "b"),
				],
				artifacts: [artifact("group_card", {}, "x"), artifact("group_card", {}, "y")],
			}),
		]);
		expect(m.status).toBe("LIMPA");
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
