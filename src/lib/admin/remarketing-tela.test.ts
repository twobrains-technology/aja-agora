/**
 * OS INSIGHTS DA RÉGUA — funil por passo, atribuição de conversão e tempos.
 *
 * Teste PURO, sem banco e sem relógio: tudo sai das linhas que a tela já lê. O
 * caso que mais importa é o de HOJE — `remarketing_touches` vazia, porque a
 * chave `REMARKETING_ATIVO` não chega à task definition de produção. A régua
 * nunca rodou: o funil tem que ser zero honesto (sem NaN, sem divisão por zero)
 * e o estado tem que dizer que a régua não está ligada, com a fila de elegíveis.
 */

import { describe, expect, it } from "vitest";
import { normalizarParametros } from "@/lib/remarketing/regua";
import { MOTIVO_SAIDA_META } from "@/lib/remarketing/status-do-toque";
import {
	duracaoLegivel,
	estadoHonestoDaRegua,
	insightsDaRegua,
	type LinhaBruta,
	linhaDaTela,
	motivoDoProximoToque,
	passoDa,
	passoDaConversao,
	resumoDaRegua,
	resumoDeTempos,
	rotuloDoMotivo,
} from "./remarketing-tela";

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const MINUTO = 60 * 1000;

/** Um toque bem no passado, para a conversão/resposta ter espaço de vir depois. */
const TOQUE = new Date("2026-09-10T13:00:00Z");

function linha(parcial: Partial<LinhaBruta> = {}): LinhaBruta {
	return {
		conversationId: "11111111-1111-1111-1111-111111111111",
		contactId: "22222222-2222-2222-2222-222222222222",
		nome: "Marina",
		telefoneMascarado: "(62) 9...-6793",
		objetivo: "carro",
		step: 1,
		status: "ATIVO",
		motivoSaida: null,
		nextTouchAt: new Date("2026-09-13T13:00:00Z"),
		ultimoToqueEm: TOQUE,
		touches30d: 1,
		criadoEm: new Date("2026-09-09T13:00:00Z"),
		ultimoInboundEm: new Date("2026-09-10T11:00:00Z"),
		optoutDaPessoaEm: null,
		converteuEm: null,
		rastro: null,
		evidenciaDaForma: null,
		...parcial,
	};
}

describe("o banco vazio produz o estado honesto", () => {
	it("o funil é zero em todos os passos, sem NaN", () => {
		const { funil, conversoes } = insightsDaRegua([]);

		expect(funil).toHaveLength(4);
		for (const passo of funil) {
			expect(passo.chegaram).toBe(0);
			expect(passo.avancaram).toBe(0);
			expect(passo.sairam).toBe(0);
			expect(passo.aguardando).toBe(0);
			expect(passo.converteram).toBe(0);
			// A queda não pode virar NaN nem Infinity: sem denominador, é null.
			expect(passo.quedaPercentual).toBeNull();
			expect(passo.tempoAteResposta.medianaMs).toBeNull();
			expect(passo.tempoAteConversao.medianaMs).toBeNull();
		}

		expect(conversoes).toEqual({ total: 0, semAtribuicao: 0, paga: null });
	});

	it("nenhum número do resumo é NaN com a lista vazia", () => {
		const resumo = resumoDeTempos([]);
		expect(Number.isNaN(resumo.medianaMs as number)).toBe(false);
		expect(resumo).toEqual({ contagem: 0, medianaMs: null, menorMs: null, maiorMs: null });
	});

	it("a régua nunca ligada diz quantas conversas estão elegíveis agora", () => {
		expect(
			estadoHonestoDaRegua({ totalNoHistorico: 0, linhasNoPeriodo: 0, elegiveisAgora: 218 }),
		).toEqual({ tipo: "nunca_ligada", elegiveisAgora: 218 });
	});

	it("separar 'nunca ligada' de 'sem toque no período' é o ponto", () => {
		expect(
			estadoHonestoDaRegua({ totalNoHistorico: 40, linhasNoPeriodo: 0, elegiveisAgora: 12 }),
		).toEqual({ tipo: "sem_toques_no_periodo", totalNoHistorico: 40, elegiveisAgora: 12 });

		expect(
			estadoHonestoDaRegua({ totalNoHistorico: 40, linhasNoPeriodo: 3, elegiveisAgora: 12 }),
		).toEqual({ tipo: "com_dados", totalNoPeriodo: 3 });
	});
});

describe("passoDa", () => {
	it("prende o passo a 0..3 — valor fora da faixa não explode o índice", () => {
		expect(passoDa({ step: 0 })).toBe(0);
		expect(passoDa({ step: 2 })).toBe(2);
		expect(passoDa({ step: 9 })).toBe(3);
		expect(passoDa({ step: -4 })).toBe(0);
	});
});

describe("funil por passo", () => {
	it("'chegaram' é cumulativo e as contas fecham", () => {
		const linhas = [
			linha({ conversationId: "a", step: 0 }),
			linha({ conversationId: "b", step: 1 }),
			linha({ conversationId: "c", step: 2 }),
			linha({ conversationId: "d", step: 3, status: "ESGOTADO" }),
		];
		const { funil } = insightsDaRegua(linhas);

		expect(funil.map((f) => f.chegaram)).toEqual([4, 3, 2, 1]);
		// Em cada passo: saíram + aguardando + avançaram == chegaram.
		for (const f of funil) {
			expect(f.sairam + f.aguardando + f.avancaram).toBe(f.chegaram);
		}
	});

	it("quem respondeu no passo 1 sai ali e não avança", () => {
		const { funil } = insightsDaRegua([
			linha({ step: 1, status: "RESPONDEU", motivoSaida: "cliente_respondeu" }),
			linha({ conversationId: "b", step: 1 }),
		]);
		const passo1 = funil[1];

		expect(passo1.chegaram).toBe(2);
		expect(passo1.responderam).toBe(1);
		expect(passo1.aguardando).toBe(1);
		expect(passo1.avancaram).toBe(0);
		expect(passo1.quedaPercentual).toBe(100);
	});

	it("a queda mistura quem saiu e quem espera — o número sozinho mentiria", () => {
		const { funil } = insightsDaRegua([
			linha({ step: 1, status: "OPTOUT" }),
			linha({ conversationId: "b", step: 1 }),
			linha({ conversationId: "c", step: 2 }),
			linha({ conversationId: "d", step: 2 }),
		]);
		// Passo 1: 4 chegaram (a, b, c, d), 2 avançaram, 1 saiu (opt-out), 1 aguarda.
		expect(funil[1].chegaram).toBe(4);
		expect(funil[1].sairam).toBe(1);
		expect(funil[1].aguardando).toBe(1);
		expect(funil[1].avancaram).toBe(2);
		expect(funil[1].quedaPercentual).toBe(50);
	});

	it("cada linha cai em UM desfecho só — quem respondeu e fechou conta como fechada", () => {
		const { funil } = insightsDaRegua([
			linha({
				conversationId: "a",
				step: 1,
				status: "RESPONDEU",
				motivoSaida: "cliente_respondeu",
				converteuEm: new Date(TOQUE.getTime() + HORA),
			}),
			linha({ conversationId: "b", step: 1 }),
			linha({ conversationId: "c", step: 2, status: "ESGOTADO" }),
		]);

		for (const f of funil) {
			const desfechos =
				f.responderam + f.segurados + f.converteram + f.optout + f.esgotaram + f.aguardando;
			const noPasso = f.chegaram - f.avancaram;
			expect(desfechos).toBe(noPasso);
			expect(f.sairam + f.aguardando).toBe(noPasso);
		}

		expect(funil[1].converteram).toBe(1);
		expect(funil[1].responderam).toBe(0);
	});
});

describe("atribuição da conversão ao toque", () => {
	it("converteu depois do último toque é creditado ao toque que precedeu", () => {
		const { funil, conversoes } = insightsDaRegua([
			linha({ step: 2, converteuEm: new Date(TOQUE.getTime() + 2 * HORA) }),
		]);

		expect(conversoes).toEqual({ total: 1, semAtribuicao: 0, paga: 2 });
		expect(funil[2].conversoesAtribuidas).toBe(1);
		expect(funil[2].tempoAteConversao.medianaMs).toBe(2 * HORA);
	});

	it("converteu antes de qualquer toque é 'sem toque' (passo 0)", () => {
		const { funil, conversoes } = insightsDaRegua([
			linha({ step: 0, converteuEm: new Date(TOQUE.getTime() + HORA) }),
		]);

		expect(conversoes.paga).toBeNull();
		expect(funil[0].conversoesAtribuidas).toBe(1);
		expect(funil[0].tempoAteConversao.medianaMs).toBeNull();
	});

	// A régua pode continuar tocando depois da venda. Atribuir essa conversão ao
	// último toque seria creditar a quem chegou DEPOIS do fechamento.
	it("converteu antes do último toque fica sem atribuição, e a tela diz isso", () => {
		const { funil, conversoes } = insightsDaRegua([
			linha({ step: 2, converteuEm: new Date(TOQUE.getTime() - HORA) }),
		]);

		expect(conversoes).toEqual({ total: 1, semAtribuicao: 1, paga: null });
		expect(funil[2].conversoesAtribuidas).toBe(0);
	});

	it("o toque que paga é o de MAIOR conversão; empate fica com o mais adiantado", () => {
		const { conversoes } = insightsDaRegua([
			linha({ conversationId: "a", step: 1, converteuEm: new Date(TOQUE.getTime() + HORA) }),
			linha({ conversationId: "b", step: 1, converteuEm: new Date(TOQUE.getTime() + 2 * HORA) }),
			linha({ conversationId: "c", step: 3, converteuEm: new Date(TOQUE.getTime() + 3 * HORA) }),
		]);

		expect(conversoes.paga).toBe(1);
	});

	it("o status CONVERTEU da régua também conta como conversão, sem duplicar pelo evento", () => {
		const { conversoes } = insightsDaRegua([
			linha({ step: 1, status: "CONVERTEU", converteuEm: new Date(TOQUE.getTime() + HORA) }),
		]);
		expect(conversoes.total).toBe(1);
	});
});

describe("tempo até a resposta", () => {
	it("mediana entre o último toque e a resposta de quem respondeu", () => {
		const { funil } = insightsDaRegua([
			linha({
				step: 1,
				status: "RESPONDEU",
				motivoSaida: "cliente_respondeu",
				ultimoInboundEm: new Date(TOQUE.getTime() + 12 * HORA),
			}),
			linha({
				conversationId: "b",
				step: 1,
				status: "RESPONDEU",
				motivoSaida: "cliente_respondeu",
				ultimoInboundEm: new Date(TOQUE.getTime() + 36 * HORA),
			}),
		]);

		expect(funil[1].tempoAteResposta.contagem).toBe(2);
		expect(funil[1].tempoAteResposta.medianaMs).toBe(24 * HORA);
	});

	it("segurado à mão NÃO é resposta — o cliente não escreveu", () => {
		const { funil } = insightsDaRegua([
			linha({
				step: 1,
				status: "RESPONDEU",
				motivoSaida: "segurado_pelo_atendente",
				ultimoInboundEm: new Date(TOQUE.getTime() + 5 * HORA),
			}),
		]);

		expect(funil[1].responderam).toBe(0);
		expect(funil[1].tempoAteResposta.contagem).toBe(0);
	});
});

describe("resumoDeTempos", () => {
	it("mediana par é a média dos dois do meio", () => {
		expect(resumoDeTempos([1, 2, 3, 4]).medianaMs).toBe(3);
		expect(resumoDeTempos([10, 20, 30]).medianaMs).toBe(20);
	});
});

describe("duracaoLegivel", () => {
	it("traduz para minutos, horas e dias", () => {
		expect(duracaoLegivel(45 * 60_000)).toBe("45 min");
		expect(duracaoLegivel(3 * HORA)).toBe("3 h");
		expect(duracaoLegivel(DIA)).toBe("1 dia");
		expect(duracaoLegivel(3 * DIA)).toBe("3 dias");
	});

	it("entrada ausente ou negativa é '—', não '0 min'", () => {
		expect(duracaoLegivel(null)).toBeNull();
		expect(duracaoLegivel(-1)).toBeNull();
	});
});

describe("passoDaConversao", () => {
	it("sem conversão não há passo", () => {
		expect(passoDaConversao(linha())).toBeNull();
	});
});

describe("resumoDaRegua — os contadores fecham com a soma das linhas", () => {
	it("lista vazia é zero honesto, sem NaN", () => {
		const r = resumoDaRegua([]);
		expect(r.toquesEnviados).toBe(0);
		expect(r.responderam).toBe(0);
		expect(r.responderamPercentual).toBeNull();
		expect(r.pediramSair).toBe(0);
		expect(r.esgotaram).toBe(0);
		expect(r.aguardando).toEqual({ n: 0, proximoEm: null });
		expect(r.elegiveisFora).toBe(0);
	});

	it("soma os passos (toques enviados) e agrupa por situação", () => {
		const linhas = [
			// ativo, 1 toque, próximo em 3 dias
			linha({ step: 1, nextTouchAt: new Date("2026-09-13T13:00:00Z") }),
			// ativo, 2 toques, próximo mais cedo (21/09)
			linha({ step: 2, nextTouchAt: new Date("2026-09-12T10:00:00Z") }),
			// respondeu (status RESPONDEU sem motivo de segurado)
			linha({ status: "RESPONDEU", motivoSaida: "cliente_respondeu", step: 1, nextTouchAt: null }),
			// esgotou
			linha({
				status: "ESGOTADO",
				motivoSaida: "tres_toques_sem_resposta",
				step: 3,
				nextTouchAt: null,
			}),
			// opt-out
			linha({ status: "OPTOUT", step: 1, nextTouchAt: null }),
			// segurado à mão NÃO conta como resposta
			linha({
				status: "RESPONDEU",
				motivoSaida: "segurado_pelo_atendente",
				step: 1,
				nextTouchAt: null,
			}),
		];

		const r = resumoDaRegua(linhas, { elegiveisAgora: 7 });

		expect(r.toquesEnviados).toBe(1 + 2 + 1 + 3 + 1 + 1);
		expect(r.responderam).toBe(1);
		expect(r.esgotaram).toBe(1);
		expect(r.pediramSair).toBe(1);
		expect(r.aguardando.n).toBe(2);
		expect(r.aguardando.proximoEm).toBe(new Date("2026-09-12T10:00:00Z").toISOString());
		expect(r.elegiveisFora).toBe(7);
	});

	it("o percentual de resposta é sobre os toques enviados", () => {
		const linhas = [
			linha({ step: 1, status: "RESPONDEU", motivoSaida: "cliente_respondeu", nextTouchAt: null }),
			linha({ step: 1 }),
			linha({ step: 1 }),
			linha({ step: 1 }),
		];
		expect(resumoDaRegua(linhas).responderamPercentual).toBe(25);
	});

	it("linha segurada à mão não infla 'responderam'", () => {
		const r = resumoDaRegua([
			linha({ status: "RESPONDEU", motivoSaida: "segurado_pelo_atendente", step: 0 }),
		]);
		expect(r.responderam).toBe(0);
		expect(r.aguardando.n).toBe(0);
	});
});

// ─── FIX-378: por que o próximo toque não saiu ────────────────────────────────
//
// O motivo é CALCULADO a partir do estado da linha (PRD §AJA-20 T5), não
// persistido: nada de coluna nova nem de backfill mentindo sobre o passado. Os
// quatro motivos de repetição têm rótulo humano; quando não há motivo, a coluna
// não inventa texto.

describe("FIX-378 — o motivo de o próximo toque não ter saído", () => {
	/** 12h de Brasília — dentro da janela de envio (9h–20h). */
	const AGORA = new Date("2026-09-14T15:00:00Z");

	it("data futura é 'aguardando_data', com rótulo legível", () => {
		const l = linha({ nextTouchAt: new Date(AGORA.getTime() + 3 * HORA) });
		expect(motivoDoProximoToque(l, AGORA)).toBe("aguardando_data");

		const tela = linhaDaTela(l, AGORA);
		expect(tela.motivoDoProximoToque).toBe("aguardando_data");
		expect(tela.motivoDoProximoToqueLegivel).toBe("Ainda não é hora do próximo toque");
	});

	it("cota de 30 dias cheia é 'teto_30_dias' — e manda sobre a data", () => {
		const l = linha({
			touches30d: 3,
			nextTouchAt: new Date(AGORA.getTime() + 3 * HORA),
		});
		expect(motivoDoProximoToque(l, AGORA)).toBe("teto_30_dias");
		expect(linhaDaTela(l, AGORA).motivoDoProximoToqueLegivel).toBe("Cota de 30 dias cheia");
	});

	it("vencido e fora do horário é 'fora_da_janela_de_horario'", () => {
		// 23h em Brasília (02h UTC do dia seguinte).
		const tardeDaNoite = new Date("2026-09-15T02:00:00Z");
		const l = linha({ nextTouchAt: new Date(tardeDaNoite.getTime() - HORA) });
		expect(motivoDoProximoToque(l, tardeDaNoite)).toBe("fora_da_janela_de_horario");
		expect(linhaDaTela(l, tardeDaNoite).motivoDoProximoToqueLegivel).toBe(
			"Fora do horário de envio (9h às 20h)",
		);
	});

	it("esgotado é 'esgotado' — e a coluna diz isso mesmo sem próximo toque", () => {
		const l = linha({ status: "ESGOTADO", nextTouchAt: null, step: 3, touches30d: 3 });
		expect(motivoDoProximoToque(l, AGORA)).toBe("esgotado");

		const tela = linhaDaTela(l, AGORA);
		expect(tela.proximoToqueISO).toBeNull();
		expect(tela.motivoDoProximoToqueLegivel).toBe("Esgotou os três toques");
	});

	it("vencido, dentro do horário e com cota: não há motivo — e a tela não inventa", () => {
		const l = linha({ nextTouchAt: new Date(AGORA.getTime() - MINUTO) });
		expect(motivoDoProximoToque(l, AGORA)).toBeNull();

		const tela = linhaDaTela(l, AGORA);
		expect(tela.motivoDoProximoToque).toBeNull();
		expect(tela.motivoDoProximoToqueLegivel).toBeNull();
	});

	it("linha que já saiu (respondeu, opt-out, converteu) não tem motivo de repetição", () => {
		for (const status of ["RESPONDEU", "OPTOUT", "CONVERTEU"] as const) {
			const l = linha({ status, nextTouchAt: null });
			expect(motivoDoProximoToque(l, AGORA), status).toBeNull();
			expect(linhaDaTela(l, AGORA).motivoDoProximoToqueLegivel, status).toBeNull();
		}
	});

	it("o cadastro move o motivo: teto menor faz a linha virar 'teto_30_dias'", () => {
		const l = linha({ touches30d: 1, nextTouchAt: new Date(AGORA.getTime() - MINUTO) });
		expect(motivoDoProximoToque(l, AGORA)).toBeNull();
		expect(motivoDoProximoToque(l, AGORA, normalizarParametros({ tetoToques30Dias: 1 }))).toBe(
			"teto_30_dias",
		);
	});
});

// ─── FIX-441 (D12b): a régua encerrada pela META não pode ler "Esgotou os 3 toques" ─
//
// O B11 encerra a régua quando a Meta recusa a entrega (131050/131026) com
// `status=ESGOTADO` + `motivo_saida=recusado_pela_meta`. Dizer "Esgotou os 3
// toques" seria falso (não saíram três toques — a Meta recusou), e o motivo cru
// não é texto de operador. O rótulo e o motivo legível passam a dizer o FATO.

describe("FIX-441 — esgotado pela recusa da META tem rótulo próprio", () => {
	const AGORA = new Date("2026-09-14T15:00:00Z");

	it("o motivo da recusa da META tem rótulo legível, nunca o identificador cru", () => {
		expect(rotuloDoMotivo(MOTIVO_SAIDA_META)).toBe("A Meta recusou a entrega");
		expect(rotuloDoMotivo("recusado_pela_meta")).toBe("A Meta recusou a entrega");
	});

	it("ESGOTADO + recusado_pela_meta: a situação segue 'esgotado', mas o rótulo é a recusa", () => {
		const l = linha({
			status: "ESGOTADO",
			motivoSaida: MOTIVO_SAIDA_META,
			step: 1,
			nextTouchAt: null,
		});
		const tela = linhaDaTela(l, AGORA);
		expect(tela.situacao).toBe("esgotado");
		expect(tela.rotuloDaSituacao).toBe("A Meta recusou a entrega");
		expect(tela.motivoLegivel).toBe("A Meta recusou a entrega");
		expect(tela.rotuloDaSituacao).not.toBe("Esgotou os 3 toques");
	});

	it("ESGOTADO sem o motivo da META continua 'Esgotou os 3 toques'", () => {
		const l = linha({
			status: "ESGOTADO",
			motivoSaida: "tres_toques_sem_resposta",
			step: 3,
			nextTouchAt: null,
		});
		expect(linhaDaTela(l, AGORA).rotuloDaSituacao).toBe("Esgotou os 3 toques");
	});

	it("um motivo desconhecido continua cru (não inventamos rótulo)", () => {
		expect(rotuloDoMotivo("motivo_do_futuro")).toBe("motivo_do_futuro");
	});
});
