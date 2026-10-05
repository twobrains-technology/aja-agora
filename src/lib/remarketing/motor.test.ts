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
	chavesDoToque,
	decidir,
	ehObjetivoConhecido,
	ehPedidoDeOptout,
	ehTelefoneInterno,
	montarEstado,
	OBJETIVO_DESCONHECIDO,
	objetivoCanonico,
	TELEFONES_INTERNOS,
	telefonesDaEquipe,
	templateDoObjetivo,
	toquesReconstruidos,
	ultimoToqueDerivado,
	ultimoToqueDoFato,
} from "./motor";
import {
	type EstadoRegua,
	estadoInicial,
	JANELA_DO_TETO_MS,
	MAX_TOQUES,
	podeDisparar,
	registrarToque,
} from "./regua";

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
		fatos: { step: 0, nextTouchAt: null, ultimoToqueEm: null, ultimoInboundEm: INBOUND },
		toquesNaJanela: [] as Date[],
		simulacaoEm: null as Date | null,
		optoutDaPessoaEm: null as Date | null,
		...over,
	};
}

describe("o toque 01 dentro da janela de 24h vira TURNO de retomada", () => {
	it("texto livre → turno_de_retomada, com a arte do objetivo", () => {
		const estado = ativo({});
		const decisao = decidir({ agora: TOQUE_1, estado, telefone: "5562999998888", fase: "inicio" });

		expect(decisao.acao).toEqual({
			tipo: "turno_de_retomada",
			passo: 1,
			arte: "/kv/remarketing/oportunidade-carro.png",
		});
		// O estado a gravar já contabiliza o toque (grava ANTES de enviar).
		expect(decisao.proximoEstado?.step).toBe(1);
		expect(decisao.proximoEstado?.ultimoToqueEm?.toISOString()).toBe(TOQUE_1.toISOString());
		expect(decisao.touches30d).toBe(1);
	});

	it("a arte acompanha o eixo comercial (moto e imóvel)", () => {
		expect(arteDoObjetivo("moto")).toBe("/kv/remarketing/oportunidade-moto.png");
		expect(arteDoObjetivo("imovel")).toBe("/kv/remarketing/oportunidade-imovel.png");
		expect(arteDoObjetivo("auto")).toBe("/kv/remarketing/oportunidade-carro.png");
	});
});

describe("AJA-14 — arte só quando o bem é CONHECIDO", () => {
	// O defeito medido (Bruna, 12:06 de 18/09): quem nunca disse o bem recebia a
	// pergunta "carro, apartamento ou moto?" com a IMAGEM DO CARRO embaixo. A arte
	// do carro era o default de `objetivoCanonico` — o mesmo default que escolhe o
	// template, e que aqui não pode valer.
	it("sem objetivo conhecido não há arte — nunca a do carro por omissão", () => {
		expect(arteDoObjetivo(null)).toBeNull();
		expect(arteDoObjetivo(undefined)).toBeNull();
		expect(arteDoObjetivo("")).toBeNull();
		expect(arteDoObjetivo("   ")).toBeNull();
		expect(arteDoObjetivo(OBJETIVO_DESCONHECIDO)).toBeNull();
		// Categoria que a régua não conhece não ganha a arte de outra vertical.
		expect(arteDoObjetivo("caminhao")).toBeNull();
	});

	it("objetivo conhecido continua com a arte do eixo", () => {
		for (const conhecido of [
			"carro",
			"auto",
			"AUTOS",
			"Automóvel",
			"moto",
			"motos",
			"imovel",
			"imóvel",
		]) {
			expect(ehObjetivoConhecido(conhecido)).toBe(true);
			expect(arteDoObjetivo(conhecido)).not.toBeNull();
		}
	});

	it("o turno de retomada sai SEM arte quando o objetivo é desconhecido", () => {
		const estado = ativo({ objetivo: OBJETIVO_DESCONHECIDO });
		const decisao = decidir({ agora: TOQUE_1, estado, telefone: "5562999998888", fase: "inicio" });

		expect(decisao.acao).toEqual({ tipo: "turno_de_retomada", passo: 1, arte: null });
	});
});

describe("fora da janela de 24h vira TEMPLATE, com a lista de chaves por fase × bem", () => {
	it("entrega template → lista ORDENADA de chaves candidatas", () => {
		const estado = ativo({ ultimoInboundEm: new Date(TOQUE_1.getTime() - 3 * DIA) });
		const decisao = decidir({
			agora: TOQUE_1,
			estado,
			telefone: "5562999998888",
			fase: "viu_oferta",
		});

		expect(decisao.acao).toEqual({
			tipo: "template",
			passo: 1,
			usageKeys: ["remarketing_viu_oferta_carro", "remarketing_viu_oferta_generico"],
		});
		expect(decisao.proximoEstado?.step).toBe(1);
	});

	it("`auto` e `carro` são o mesmo eixo", () => {
		expect(objetivoCanonico("AUTOS")).toBe("carro");
		expect(chavesDoToque("inicio", "auto")).toEqual([
			"remarketing_inicio_carro",
			"remarketing_inicio_generico",
		]);
	});
});

describe("FIX-388 — chave por fase × bem, com fallback ordenado", () => {
	it("bem conhecido → [fase+bem, genérico da fase]", () => {
		expect(chavesDoToque("inicio", "moto")).toEqual([
			"remarketing_inicio_moto",
			"remarketing_inicio_generico",
		]);
		expect(chavesDoToque("viu_oferta", "imovel")).toEqual([
			"remarketing_viu_oferta_imovel",
			"remarketing_viu_oferta_generico",
		]);
		expect(chavesDoToque("fechamento", "carro")).toEqual([
			"remarketing_fechamento_carro",
			"remarketing_fechamento_generico",
		]);
	});

	it("bem desconhecido → SÓ o genérico da fase (nunca o bem de outra pessoa)", () => {
		for (const semBem of [null, undefined, "", "  ", OBJETIVO_DESCONHECIDO, "caminhao"]) {
			expect(chavesDoToque("fechamento", semBem)).toEqual(["remarketing_fechamento_generico"]);
		}
	});

	it("a fase muda a chave — o mesmo bem em fases diferentes não é o mesmo template", () => {
		expect(chavesDoToque("inicio", "moto")[0]).not.toBe(chavesDoToque("fechamento", "moto")[0]);
	});

	it("o motor entrega a LISTA — quem decide se existe aprovado é o dispatcher", () => {
		const estado = ativo({ ultimoInboundEm: new Date(TOQUE_1.getTime() - 3 * DIA) });
		const decisao = decidir({
			agora: TOQUE_1,
			estado,
			telefone: "5562999998888",
			fase: "fechamento",
		});
		expect(decisao.acao).toEqual({
			tipo: "template",
			passo: 1,
			usageKeys: ["remarketing_fechamento_carro", "remarketing_fechamento_generico"],
		});
	});

	it("a função LEGADA da tela continua caindo em carro (dívida do ADR)", () => {
		// `templateDoObjetivo` continua existindo para a tela de forma do toque, que
		// ainda não conhece a fase — dívida registrada no ADR do bloco. O DISPARO não
		// a usa mais: usa `chavesDoToque`.
		expect(templateDoObjetivo(OBJETIVO_DESCONHECIDO)).toBe("remarketing_oportunidade_carro");
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
			fase: "inicio",
		});
		expect(decisao.acao).toEqual({ tipo: "nada", motivo: "ja_respondeu" });
		// O estado terminal é gravado para a linha SAIR do índice parcial.
		expect(decisao.proximoEstado?.status).toBe("RESPONDEU");
		expect(decisao.proximoEstado?.motivoSaida).toBe("cliente_respondeu");
	});

	it("os três toques saíram: fecha a linha em ESGOTADO com o motivo nomeado", () => {
		// Caso real e silencioso: a linha fica `ATIVO` com `step = 3` e a cota de 30
		// dias reabre quando os toques completam 30 dias. Sem fechar a sequência, a
		// linha é relida a cada 30 s para sempre, o contador de `nada.esgotado` sobe
		// infinitamente e o motivo de saída nunca é gravado — a tela não tem como
		// dizer "esgotou os 3 toques".
		const estado = estadoInicial({
			objetivo: "carro",
			status: "ATIVO",
			step: 3,
			nextTouchAt: new Date(TOQUE_1.getTime() - 1),
			ultimoToqueEm: new Date(TOQUE_1.getTime() - 40 * DIA),
			ultimoInboundEm: new Date(TOQUE_1.getTime() - 45 * DIA),
			toquesNaJanela: [],
		});

		const decisao = decidir({ agora: TOQUE_1, estado, telefone: "5562999998888", fase: "inicio" });

		expect(decisao.acao).toEqual({ tipo: "nada", motivo: "esgotado" });
		expect(decisao.proximoEstado?.status).toBe("ESGOTADO");
		expect(decisao.proximoEstado?.motivoSaida).toBe("tres_toques_sem_resposta");
		expect(decisao.proximoEstado?.nextTouchAt).toBeNull();
	});

	it("teto de 30 dias em linha ATIVO REAGENDA para quando a cota reabre", () => {
		// P4: com o teto cheio em linha `ATIVO`, a linha não pode ficar com o
		// `next_touch_at` no passado (o painel mostrava toque vencido sem explicar).
		// O estado é reagendado para a queda do toque mais antigo — nunca no passado.
		const recentes = [
			new Date(TOQUE_1.getTime() - 3 * DIA),
			new Date(TOQUE_1.getTime() - 2 * DIA),
			new Date(TOQUE_1.getTime() - 1 * DIA),
		];
		const estado = estadoInicial({
			objetivo: "carro",
			status: "ATIVO",
			step: 3,
			nextTouchAt: new Date(TOQUE_1.getTime() - 1),
			ultimoInboundEm: INBOUND,
			toquesNaJanela: recentes,
		});

		const decisao = decidir({ agora: TOQUE_1, estado, telefone: "5562999998888", fase: "inicio" });

		expect(decisao.acao).toEqual({ tipo: "nada", motivo: "teto_30_dias" });
		expect(decisao.proximoEstado?.status).toBe("ATIVO");
		expect(decisao.proximoEstado?.nextTouchAt?.toISOString()).toBe(
			new Date(recentes[0].getTime() + JANELA_DO_TETO_MS).toISOString(),
		);
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
			fase: "inicio",
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
			fase: "inicio",
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

	it("a lista é a de código + `TELEFONES_DA_EQUIPE` + a env antiga", () => {
		// O número de `motor.ts` é o DEFAULT DOCUMENTADO da env: ele continua em
		// código, senão um ambiente sem a variável voltaria a mandar toque para a
		// casa (foi o que aconteceu em prod: 1 dos 6 toques de 18/09).
		expect(telefonesDaEquipe({})).toEqual(["556292496793"]);
		expect(telefonesDaEquipe({ TELEFONES_DA_EQUIPE: "5511999998888, 5562933334444" })).toEqual([
			"556292496793",
			"5511999998888",
			"5562933334444",
		]);
		// A variável antiga continua valendo: renomear sem janela trocaria o número
		// da casa por ninguém no primeiro deploy.
		expect(telefonesDaEquipe({ REMARKETING_TELEFONES_INTERNOS: "5562911112222" })).toContain(
			"5562911112222",
		);
	});

	it("vírgula solta e espaço não criam telefone fantasma", () => {
		expect(telefonesDaEquipe({ TELEFONES_DA_EQUIPE: " , ," })).toEqual(["556292496793"]);
		expect(telefonesDaEquipe({ TELEFONES_DA_EQUIPE: "  " })).toEqual(["556292496793"]);
	});

	it("o motor não dispara para telefone interno, mesmo com tudo vencido", () => {
		const decisao = decidir({
			agora: TOQUE_1,
			estado: ativo({}),
			telefone: "556292496793",
			fase: "inicio",
		});
		expect(decisao.acao).toEqual({ tipo: "nada", motivo: "telefone_interno" });
		expect(decisao.proximoEstado).toBeNull();
	});

	it("atendente ATIVO no banco também bloqueia (flag do ciclo)", () => {
		const decisao = decidir({
			agora: TOQUE_1,
			estado: ativo({}),
			telefone: "5562999998888",
			fase: "inicio",
			telefoneDaEquipe: true,
		});
		expect(decisao.acao).toEqual({ tipo: "nada", motivo: "telefone_interno" });
	});
});

describe("o teto de 30 dias (global, por pessoa) bloqueia o disparo", () => {
	it("3 toques na janela → teto_30_dias e reagendamento para a queda do mais antigo", () => {
		const maisAntigo = new Date(TOQUE_1.getTime() - 8 * DIA);
		const estado = ativo({
			ultimoInboundEm: new Date(TOQUE_1.getTime() - DIA),
			toquesNaJanela: [
				maisAntigo,
				new Date(TOQUE_1.getTime() - 5 * DIA),
				new Date(TOQUE_1.getTime() - 2 * DIA),
			],
		});
		const decisao = decidir({ agora: TOQUE_1, estado, telefone: "5562999998888", fase: "inicio" });
		expect(decisao.acao).toEqual({ tipo: "nada", motivo: "teto_30_dias" });
		expect(decisao.proximoEstado?.nextTouchAt?.toISOString()).toBe(
			new Date(maisAntigo.getTime() + JANELA_DO_TETO_MS).toISOString(),
		);
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
			fase: "inicio",
			estado,
		});
		expect(decisao.acao.tipo).not.toBe("nada");
		expect(decisao.touches30d).toBe(3);
	});
});

describe("FIX-377 — o contador do watchdog NÃO barra o turno da régua", () => {
	it("o toque sai: quem conta os toques da régua é a régua (step / toques_30d)", () => {
		// `conversationMetadata.retomada` (MAX_RETOMADAS + backoff) é do TURNO do
		// watchdog, não desta sequência. Antes, um `retomadaPermitida=false` devolvia
		// `nada` mudo aqui — e a escala curta morria no toque 02.
		const decisao = decidir({
			agora: TOQUE_1,
			estado: ativo({}),
			telefone: "5562999998888",
			fase: "inicio",
		});
		expect(decisao.acao).toEqual({
			tipo: "turno_de_retomada",
			passo: 1,
			arte: "/kv/remarketing/oportunidade-carro.png",
		});
		// O que bloqueia é a guarda da PRÓPRIA régua — e sempre com motivo nomeado.
		expect(decisao.proximoEstado?.step).toBe(1);
	});
});

describe("o teto de 30 dias conta a partir de um instante REAL (`ultimo_toque_em`)", () => {
	it("a COLUNA manda; a derivação é só fallback de linha antiga", () => {
		const coluna = new Date(TOQUE_1.getTime() - 2 * DIA);
		// A linha diz `step 1` (o que derivaria um último toque em TOQUE_1), mas a
		// coluna — a fonte — registra outro instante. A coluna ganha.
		const fatos = {
			step: 1,
			nextTouchAt: new Date(TOQUE_1.getTime() + 3 * DIA),
			ultimoToqueEm: coluna,
			ultimoInboundEm: INBOUND,
		};
		expect(ultimoToqueDoFato(fatos)?.toISOString()).toBe(coluna.toISOString());

		// Linha antiga (coluna nula) cai no fallback derivado.
		expect(ultimoToqueDoFato({ ...fatos, ultimoToqueEm: null })?.toISOString()).toBe(
			TOQUE_1.toISOString(),
		);
	});

	it("o motor grava o instante do toque novo em `ultimo_toque_em`", () => {
		const decisao = decidir({
			agora: TOQUE_1,
			estado: ativo({}),
			telefone: "5562999998888",
			fase: "inicio",
		});
		expect(decisao.proximoEstado?.ultimoToqueEm?.toISOString()).toBe(TOQUE_1.toISOString());
	});
});

describe("a reconstrução dos toques (fallback quando não há histórico)", () => {
	it("o último toque derivado volta de next_touch_at − intervalo(step)", () => {
		// No começo do ciclo não há toque anterior (step 0).
		expect(ultimoToqueDerivado({ step: 0, nextTouchAt: TOQUE_1 })).toBeNull();
		const t1 = TOQUE_1;
		const next1 = new Date(t1.getTime() + 3 * DIA);
		expect(ultimoToqueDerivado({ step: 1, nextTouchAt: next1 })?.toISOString()).toBe(
			t1.toISOString(),
		);

		const t2 = next1;
		const next2 = new Date(t2.getTime() + 5 * DIA);
		expect(ultimoToqueDerivado({ step: 2, nextTouchAt: next2 })?.toISOString()).toBe(
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

// ─── FIX-386: esgotar os toques SÓ PARA (decisão do dono, 28/09/2026) ────────
//
// O comportamento já era o pedido pelo dono: `ESGOTADO` é terminal e não toca
// `leads.stage`. O que faltava era o TESTE que trava isso — para que ninguém
// (nem nós, na próxima onda) faça o esgotamento transitar o lead para `perdido`
// nem criar alerta de revisão humana (o T2/T3 do AJA-24 morreram nesta decisão).
describe("esgotar a sequência SÓ PARA — não vira `perdido` e não cria alerta", () => {
	it("o terceiro toque grava ESGOTADO com o motivo da régua, e nada de `perdido`", () => {
		// Dois toques já saíram; o terceiro é o que esgota.
		const antes = estadoInicial({
			objetivo: "carro",
			status: "ATIVO",
			step: 2,
			nextTouchAt: TOQUE_1,
			ultimoToqueEm: new Date(TOQUE_1.getTime() - 3 * DIA),
			ultimoInboundEm: INBOUND,
		});

		const depois = registrarToque(antes, TOQUE_1);

		expect(depois.status).toBe("ESGOTADO");
		expect(depois.step).toBe(MAX_TOQUES);
		expect(depois.motivoSaida).toBe("tres_toques_sem_resposta");
		expect(depois.nextTouchAt).toBeNull();
		// A linha da régua SÓ tem campos da régua: nenhum vestígio de transição de
		// funil. O motivo do esgotamento nunca é "perdido".
		expect(depois.motivoSaida).not.toBe("perdido");
		expect(Object.keys(depois)).not.toContain("stage");
		expect(Object.keys(depois)).not.toContain("perdido");
	});

	it("esgotado é terminal: a régua para e o motivo é `esgotado`, nunca `perdido`", () => {
		const esgotado = estadoInicial({
			objetivo: "carro",
			status: "ESGOTADO",
			step: MAX_TOQUES,
			motivoSaida: "tres_toques_sem_resposta",
		});

		const veredito = podeDisparar(esgotado, TOQUE_1);
		expect(veredito).toEqual({ pode: false, motivo: "esgotado" });
	});

	it("o motor fecha a linha em ESGOTADO (sem tocar lead) quando a cota reabre", () => {
		// Linha ATIVO no teto de toques, com a cota de 30 dias já livre: o motor
		// fecha a sequência gravando ESGOTADO — e SÓ isso.
		const ativoNoTeto = estadoInicial({
			objetivo: "carro",
			status: "ATIVO",
			step: MAX_TOQUES,
			nextTouchAt: TOQUE_1,
			ultimoToqueEm: new Date(TOQUE_1.getTime() - 40 * DIA),
			ultimoInboundEm: INBOUND,
		});

		const decisao = decidir({
			agora: TOQUE_1,
			estado: ativoNoTeto,
			telefone: "5562999998888",
			fase: "inicio",
		});

		expect(decisao.acao).toEqual({ tipo: "nada", motivo: "esgotado" });
		expect(decisao.proximoEstado?.status).toBe("ESGOTADO");
		expect(decisao.proximoEstado?.motivoSaida).toBe("tres_toques_sem_resposta");
		expect(decisao.proximoEstado?.nextTouchAt).toBeNull();
		expect(decisao.proximoEstado?.motivoSaida).not.toBe("perdido");
	});

	it("quem respondeu no meio do caminho continua sem esgotar", () => {
		// Dois toques saíram, o cliente respondeu: a linha para em RESPONDEU e o
		// esgotamento nunca acontece — mesmo com `step` abaixo do teto.
		const respondeu = estadoInicial({
			objetivo: "carro",
			status: "RESPONDEU",
			step: 2,
			motivoSaida: "cliente_respondeu",
			ultimoToqueEm: new Date(TOQUE_1.getTime() - 3 * DIA),
			ultimoInboundEm: new Date(TOQUE_1.getTime() - DIA),
		});

		const decisao = decidir({
			agora: TOQUE_1,
			estado: respondeu,
			telefone: "5562999998888",
			fase: "inicio",
		});

		expect(decisao.acao).toEqual({ tipo: "nada", motivo: "ja_respondeu" });
		expect(decisao.proximoEstado?.status).toBe("RESPONDEU");
		expect(decisao.proximoEstado?.status).not.toBe("ESGOTADO");
	});
});

describe("FIX-441 — a web NUNCA entrega por turno de retomada", () => {
	it("WhatsApp com a janela aberta continua virando turno_de_retomada", () => {
		const decisao = decidir({
			agora: TOQUE_1,
			estado: ativo({}),
			telefone: "5562999998888",
			fase: "inicio",
			channel: "whatsapp",
		});
		expect(decisao.acao.tipo).toBe("turno_de_retomada");
	});

	it("web com `last_inbound_at` DENTRO das 24 h vira TEMPLATE, não turno", () => {
		// A web pode ter a coluna (ela chega quando a conversa vira lead) e, com
		// ela, a janela de 24 h aberta mandaria texto livre — o turno rodaria no
		// chat do site, que ninguém está olhando. O canal força o template.
		const decisao = decidir({
			agora: TOQUE_1,
			estado: ativo({}),
			telefone: "5562999998888",
			fase: "inicio",
			channel: "web",
		});
		expect(decisao.acao).toEqual({
			tipo: "template",
			passo: 1,
			usageKeys: ["remarketing_inicio_carro", "remarketing_inicio_generico"],
		});
		// O carimbo continua contando o toque — a entrega muda, o estado não.
		expect(decisao.proximoEstado?.step).toBe(1);
	});
});
