// O MOTOR da régua — a decisão pura, provada caso a caso.
//
// Cada teste aqui é uma linha do Remarketing_WhatsApp_V3.pdf (ou uma borda que
// ela implica), e nenhum olha o relógio de verdade: o `agora` entra por
// parâmetro, como na régua. O motor não toca banco nem rede — quem faz I/O é o
// ciclo (`workers/remarketing-cycle.ts`), e é lá que ele é testado.
//
// Fuso: as datas estão em UTC e viram Brasília (UTC−3) ao lado. 14/09/2026 é
// segunda-feira, como nas fixtures da régua.

import { describe, expect, it } from "vitest";
import {
	arteDoObjetivo,
	decidir,
	ehPedidoDeOptout,
	ehTelefoneInterno,
	montarEstado,
	objetivoCanonico,
	TELEFONES_INTERNOS,
	templateDoObjetivo,
	toquesReconstruidos,
	ultimoToqueDaColuna,
} from "./motor";
import { type EstadoRegua, estadoInicial, JANELA_DO_TETO_MS, MAX_TOQUES } from "./regua";

const DIA = 24 * 60 * 60 * 1000;
const HORA = 60 * 60 * 1000;

/** O cliente falou às 11h de Brasília (14h UTC) e ficou em silêncio. */
const INBOUND = new Date("2026-09-14T14:00:00Z");
/** 12h30 em Brasília — o instante exato do toque 01 (90 min de silêncio). */
const TOQUE_1 = new Date("2026-09-14T15:30:00Z");

function ativo(opcoes: Partial<Omit<EstadoRegua, "objetivo">> & { objetivo?: string } = {}) {
	return estadoInicial({
		objetivo: "carro",
		ultimoInboundEm: INBOUND,
		...opcoes,
	});
}

function linha(over: Record<string, unknown> = {}) {
	return {
		objetivo: "carro",
		status: "ATIVO" as const,
		motivoSaida: null,
		fatos: { step: 0, nextTouchAt: null, ultimoInboundEm: INBOUND },
		toquesNaJanela: [] as Date[],
		simulacaoEm: null as Date | null,
		optoutDaPessoaEm: null as Date | null,
		...over,
	};
}

describe("o toque 01 dentro da janela de 24h vira TURNO de retomada", () => {
	it("texto livre → turno_de_retomada, com a arte do objetivo", () => {
		const estado = ativo({});
		const decisao = decidir({ agora: TOQUE_1, estado, telefone: "5562999998888" });

		expect(decisao.acao).toEqual({
			tipo: "turno_de_retomada",
			passo: 1,
			arte: "/kv/auto-hero-colagem.png",
		});
		// O estado a gravar já contabiliza o toque (grava ANTES de enviar).
		expect(decisao.proximoEstado?.step).toBe(1);
		expect(decisao.proximoEstado?.ultimoToqueEm?.toISOString()).toBe(TOQUE_1.toISOString());
		expect(decisao.touches30d).toBe(1);
	});

	it("a arte acompanha o eixo comercial (moto e imóvel)", () => {
		expect(arteDoObjetivo("moto")).toBe("/kv/moto-hero-colagem.png");
		expect(arteDoObjetivo("imovel")).toBe("/kv/imovel-hero-colagem.png");
		expect(arteDoObjetivo("auto")).toBe("/kv/auto-hero-colagem.png");
	});
});

describe("fora da janela de 24h vira TEMPLATE, escolhido pelo objetivo", () => {
	it("entrega template → usageKey do objetivo", () => {
		const estado = ativo({ ultimoInboundEm: new Date(TOQUE_1.getTime() - 3 * DIA) });
		const decisao = decidir({ agora: TOQUE_1, estado, telefone: "5562999998888" });

		expect(decisao.acao).toEqual({
			tipo: "template",
			passo: 1,
			usageKey: "remarketing_oportunidade_carro",
		});
		expect(decisao.proximoEstado?.step).toBe(1);
	});

	it("o template segue o objetivo, e `auto` e `carro` são o mesmo eixo", () => {
		expect(templateDoObjetivo("moto")).toBe("remarketing_oportunidade_moto");
		expect(templateDoObjetivo("imovel")).toBe("remarketing_oportunidade_imovel");
		expect(templateDoObjetivo("auto")).toBe("remarketing_oportunidade_carro");
		expect(templateDoObjetivo("carro")).toBe("remarketing_oportunidade_carro");
		expect(objetivoCanonico("AUTOS")).toBe("carro");
	});
});

describe("quem respondeu não recebe — qualquer resposta encerra a sequência", () => {
	it("inbound depois do último toque → RESPONDEU, nada sai", () => {
		// O toque 01 saiu às 15:30; o cliente respondeu às 16:00. A linha ainda
		// está ATIVA e vencida no banco — mas a sequência está morta.
		const estado = montarEstado({
			...linha({
				fatos: {
					step: 1,
					nextTouchAt: new Date(TOQUE_1.getTime() + 3 * DIA),
					ultimoInboundEm: new Date(TOQUE_1.getTime() + 30 * 60_000),
				},
				toquesNaJanela: [TOQUE_1],
			}),
		});
		expect(estado.status).toBe("RESPONDEU");

		const decisao = decidir({
			agora: new Date(TOQUE_1.getTime() + 3 * DIA),
			estado,
			telefone: "5562999998888",
		});
		expect(decisao.acao).toEqual({ tipo: "nada", motivo: "ja_respondeu" });
		// O estado terminal é gravado para a linha SAIR do índice parcial.
		expect(decisao.proximoEstado?.status).toBe("RESPONDEU");
		expect(decisao.proximoEstado?.motivoSaida).toBe("cliente_respondeu");
	});

	it("inbound ANTES do último toque não encerra nada", () => {
		const estado = montarEstado({
			...linha({
				fatos: {
					step: 1,
					nextTouchAt: new Date(TOQUE_1.getTime() + 3 * DIA),
					ultimoInboundEm: INBOUND,
				},
				toquesNaJanela: [TOQUE_1],
			}),
		});
		expect(estado.status).toBe("ATIVO");
	});
});

describe("opt-out por telefone vence tudo, inclusive nova simulação", () => {
	it("com `remarketing_optout_at` no contato, nada sai — mesmo reaberto por simulação", () => {
		const simulacaoEm = new Date(TOQUE_1.getTime() + 10 * DIA);
		const estado = ativo({
			status: "ESGOTADO",
			step: 3,
			toquesNaJanela: [new Date(TOQUE_1.getTime() - 20 * DIA)],
			ultimoToqueEm: TOQUE_1,
			simulacaoEm,
		});
		const decisao = decidir({
			agora: new Date(simulacaoEm.getTime() + 2 * HORA),
			estado,
			telefone: "5562999998888",
			optoutDaPessoaEm: new Date(TOQUE_1.getTime() + 20 * DIA),
		});

		expect(decisao.acao).toEqual({ tipo: "nada", motivo: "optout_da_pessoa" });
		expect(decisao.proximoEstado?.status).toBe("OPTOUT");
		expect(decisao.proximoEstado?.motivoSaida).toBe("optout_do_cliente");
	});

	it("a régua já OPTOUT também não deixa sair, e não reescreve o estado", () => {
		const decisao = decidir({
			agora: TOQUE_1,
			estado: ativo({ status: "OPTOUT", motivoSaida: "optout_do_cliente" }),
			telefone: "5562999998888",
		});
		expect(decisao.acao).toEqual({ tipo: "nada", motivo: "optout_da_pessoa" });
		expect(decisao.proximoEstado).toBeNull();
	});
});

describe("telefone da equipe nunca recebe toque", () => {
	it("o telefone da casa está na lista em código", () => {
		expect(TELEFONES_INTERNOS.length).toBeGreaterThan(0);
		expect(ehTelefoneInterno("556292496793")).toBe(true);
		// O nono dígito e o DDI não driblam a guarda.
		expect(ehTelefoneInterno("+55 (62) 99249-6793")).toBe(true);
		expect(ehTelefoneInterno("5562999998888")).toBe(false);
		expect(ehTelefoneInterno(null)).toBe(false);
	});

	it("o motor não dispara para telefone interno, mesmo com tudo vencido", () => {
		const decisao = decidir({ agora: TOQUE_1, estado: ativo({}), telefone: "556292496793" });
		expect(decisao.acao).toEqual({ tipo: "nada", motivo: "telefone_interno" });
		expect(decisao.proximoEstado).toBeNull();
	});

	it("atendente ATIVO no banco também bloqueia (flag do ciclo)", () => {
		const decisao = decidir({
			agora: TOQUE_1,
			estado: ativo({}),
			telefone: "5562999998888",
			telefoneDaEquipe: true,
		});
		expect(decisao.acao).toEqual({ tipo: "nada", motivo: "telefone_interno" });
	});
});

describe("o teto de 30 dias (global, por pessoa) bloqueia o disparo", () => {
	it("3 toques na janela → teto_30_dias, e nada é gravado", () => {
		const estado = ativo({
			ultimoInboundEm: new Date(TOQUE_1.getTime() - DIA),
			toquesNaJanela: [
				new Date(TOQUE_1.getTime() - 8 * DIA),
				new Date(TOQUE_1.getTime() - 5 * DIA),
				new Date(TOQUE_1.getTime() - 2 * DIA),
			],
		});
		const decisao = decidir({ agora: TOQUE_1, estado, telefone: "5562999998888" });
		expect(decisao.acao).toEqual({ tipo: "nada", motivo: "teto_30_dias" });
		expect(decisao.proximoEstado).toBeNull();
		expect(decisao.touches30d).toBe(3);
	});

	it("a cota reabre sozinha quando o toque mais antigo faz 30 dias", () => {
		const antigo = new Date(TOQUE_1.getTime() - JANELA_DO_TETO_MS);
		const estado = ativo({
			ultimoInboundEm: new Date(TOQUE_1.getTime() - 4 * DIA),
			toquesNaJanela: [
				antigo,
				new Date(TOQUE_1.getTime() - 3 * DIA),
				new Date(TOQUE_1.getTime() - 1 * DIA),
			],
		});
		// Um minuto depois da queda do mais antigo, a cota volta a ter folga — e o
		// toque sai (o novo entra na contagem).
		const decisao = decidir({
			agora: new Date(TOQUE_1.getTime() + 60_000),
			telefone: "5562999998888",
			estado,
		});
		expect(decisao.acao.tipo).not.toBe("nada");
		expect(decisao.touches30d).toBe(3);
	});
});

describe("teto de retomadas (MAX_RETOMADAS) barra o turno", () => {
	it("retomadaPermitida=false → nada, mas o estado não avança", () => {
		const decisao = decidir({
			agora: TOQUE_1,
			estado: ativo({}),
			telefone: "5562999998888",
			retomadaPermitida: false,
		});
		expect(decisao.acao).toEqual({ tipo: "nada", motivo: "teto_de_retomadas" });
		expect(decisao.proximoEstado).toBeNull();
	});
});

describe("a reconstrução dos toques (lacuna da tabela do bloco 1)", () => {
	it("o último toque volta de next_touch_at − intervalo(step)", () => {
		// No começo do ciclo não há toque anterior (step 0).
		expect(ultimoToqueDaColuna({ step: 0, nextTouchAt: TOQUE_1 })).toBeNull();
		const t1 = TOQUE_1;
		const next1 = new Date(t1.getTime() + 3 * DIA);
		expect(ultimoToqueDaColuna({ step: 1, nextTouchAt: next1 })?.toISOString()).toBe(
			t1.toISOString(),
		);

		const t2 = next1;
		const next2 = new Date(t2.getTime() + 5 * DIA);
		expect(ultimoToqueDaColuna({ step: 2, nextTouchAt: next2 })?.toISOString()).toBe(
			t2.toISOString(),
		);
	});

	it("reconstrói os três instantes a partir do último", () => {
		const t1 = TOQUE_1;
		const t2 = new Date(t1.getTime() + 3 * DIA);
		const t3 = new Date(t2.getTime() + 5 * DIA);

		const instantes = toquesReconstruidos({ step: 3, touches30d: 3, ultimoToqueEm: t3 });
		expect(instantes.map((d) => d.toISOString())).toEqual([
			t1.toISOString(),
			t2.toISOString(),
			t3.toISOString(),
		]);
	});

	it("reentrada reseta o step mas a contagem da janela manda (não subconta)", () => {
		const ultimo = TOQUE_1;
		const instantes = toquesReconstruidos({ step: 1, touches30d: 3, ultimoToqueEm: ultimo });
		expect(instantes).toHaveLength(MAX_TOQUES);
	});

	it("sem último toque não há o que reconstruir", () => {
		expect(toquesReconstruidos({ step: 0, touches30d: 0, ultimoToqueEm: null })).toEqual([]);
	});
});

describe("o opt-out é detectado no texto do inbound, com parcimônia", () => {
	it("marca as formulações explícitas de sair", () => {
		for (const fala of [
			"Pare de me mandar mensagem",
			"não quero receber mais nada",
			"me tira da lista, por favor",
			"descadastrar",
			"STOP",
			"por favor, pare",
		]) {
			expect(ehPedidoDeOptout(fala), `deveria marcar: ${fala}`).toBe(true);
		}
	});

	it("não marca fala normal de venda", () => {
		for (const fala of [
			"quero um carro de 80 mil",
			"vou pensar e te falo",
			"não quero financiamento",
			"ainda não decidi",
			"",
		]) {
			expect(ehPedidoDeOptout(fala), `não deveria marcar: ${fala}`).toBe(false);
		}
	});

	it("marca com acento e sem acento (o texto é normalizado)", () => {
		expect(ehPedidoDeOptout("não quero mais")).toBe(true);
		expect(ehPedidoDeOptout("nao quero mais")).toBe(true);
	});
});
