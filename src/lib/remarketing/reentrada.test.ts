// A REENTRADA do bolo parado — a decisão pura, provada caso a caso.
//
// Cada teste aqui é uma das decisões do dono (28/09/2026) ou uma guarda que NÃO
// se afrouxa. O `agora` entra por parâmetro, como na régua: nenhum teste olha o
// relógio de verdade, e nenhum toca banco nem rede.
//
// Fuso: as datas estão em UTC e viram Brasília (UTC−3) ao lado.

import { describe, expect, it } from "vitest";
import type { OpcoesDaElegibilidade } from "./motivo-de-exclusao";
import { avaliarElegibilidade } from "./motivo-de-exclusao";
import {
	agregarReentrada,
	autorizacaoDaReentrada,
	avaliarReentrada,
	type ConversaParaReentrada,
	linhaReaberta,
	MOTIVOS_DE_NAO_REENTRADA,
	type ResultadoDaReentrada,
} from "./reentrada";
import { estadoInicial, MAX_TOQUES } from "./regua";

const DIA = 24 * 60 * 60 * 1000;
const MINUTO = 60 * 1000;

/** "Agora" é 30/09/2026, 15h UTC (12h em Brasília). */
const AGORA = new Date("2026-09-30T15:00:00Z");

const OPCOES: OpcoesDaElegibilidade = {
	reguaLigada: true,
	entradaWeb: false,
	telefoneDaEquipe: false,
};

/**
 * Uma conversa parada há 10 dias — FORA da janela de 7 dias, que é justamente o
 * caso que a reentrada existe para atender.
 */
function parada(over: Partial<ConversaParaReentrada> = {}): ConversaParaReentrada {
	return {
		channel: "whatsapp",
		status: "active",
		isSimulated: false,
		contactId: "contato-1",
		lastInboundAt: new Date(AGORA.getTime() - 10 * DIA),
		waId: "5562999998888",
		phone: "62999998888",
		jaNaRegua: false,
		optoutDaPessoaEm: null,
		regua: null,
		...over,
	};
}

describe("a janela de 7 dias é a ÚNICA guarda que a reentrada afrouxa", () => {
	it("a conversa parada há 10 dias fica FORA da entrada normal, mas REENTRA", () => {
		const conversa = parada();

		// A entrada do ciclo recusa, com nome e motivo.
		expect(avaliarElegibilidade(conversa, AGORA, OPCOES)).toEqual({
			elegivel: false,
			motivo: "parada_ha_mais_de_7_dias",
		});

		// A ação deliberada do operador traz a mesma conversa de volta.
		expect(avaliarReentrada(conversa, AGORA, OPCOES)).toEqual({ reentra: true });
	});

	it("mas o PISO de silêncio continua: ninguém reentra em quem acabou de escrever", () => {
		const conversa = parada({ lastInboundAt: new Date(AGORA.getTime() - 5 * MINUTO) });
		expect(avaliarReentrada(conversa, AGORA, OPCOES)).toEqual({
			reentra: false,
			motivo: "ainda_em_silencio",
		});
	});

	it("sem data de inbound (a corrida do FIX-86) também não reentra", () => {
		expect(avaliarReentrada(parada({ lastInboundAt: null }), AGORA, OPCOES)).toEqual({
			reentra: false,
			motivo: "ainda_em_silencio",
		});
	});
});

describe("as guardas que NÃO se afrouxam", () => {
	it("opt-out nunca reentra (terminal por pessoa)", () => {
		expect(
			avaliarReentrada(
				parada({ optoutDaPessoaEm: new Date(AGORA.getTime() - DIA) }),
				AGORA,
				OPCOES,
			),
		).toEqual({ reentra: false, motivo: "optout" });
		// O opt-out também pode estar refletido no status da linha.
		expect(
			avaliarReentrada(
				parada({ regua: { status: "OPTOUT", motivoSaida: "optout_do_cliente" } }),
				AGORA,
				OPCOES,
			),
		).toEqual({ reentra: false, motivo: "optout" });
	});

	it("telefone da equipe nunca reentra", () => {
		expect(avaliarReentrada(parada(), AGORA, { ...OPCOES, telefoneDaEquipe: true })).toEqual({
			reentra: false,
			motivo: "telefone_da_equipe",
		});
	});

	it("is_simulated nunca reentra", () => {
		expect(avaliarReentrada(parada({ isSimulated: true }), AGORA, OPCOES)).toEqual({
			reentra: false,
			motivo: "teste",
		});
	});

	it("quem ficou terminal POR TER RESPONDIDO não é reativado", () => {
		expect(
			avaliarReentrada(
				parada({ regua: { status: "RESPONDEU", motivoSaida: "cliente_respondeu" } }),
				AGORA,
				OPCOES,
			),
		).toEqual({ reentra: false, motivo: "respondeu" });
	});

	it("quem fechou contrato não reentra", () => {
		expect(
			avaliarReentrada(
				parada({ regua: { status: "CONVERTEU", motivoSaida: null } }),
				AGORA,
				OPCOES,
			),
		).toEqual({ reentra: false, motivo: "converteu" });
	});

	it("a conversa encerrada ou com atendente não reentra", () => {
		expect(avaliarReentrada(parada({ status: "closed" }), AGORA, OPCOES)).toEqual({
			reentra: false,
			motivo: "encerrada",
		});
		expect(avaliarReentrada(parada({ status: "handed_off" }), AGORA, OPCOES)).toEqual({
			reentra: false,
			motivo: "com_atendente",
		});
	});

	it("a régua desligada não recebe o bolo", () => {
		expect(avaliarReentrada(parada(), AGORA, { ...OPCOES, reguaLigada: false })).toEqual({
			reentra: false,
			motivo: "regua_desligada",
		});
	});

	it("conversa da web só reentra com a flag ligada", () => {
		const conversa = parada({ channel: "web" });
		expect(avaliarReentrada(conversa, AGORA, OPCOES)).toEqual({
			reentra: false,
			motivo: "conversa_web",
		});
		expect(avaliarReentrada(conversa, AGORA, { ...OPCOES, entradaWeb: true })).toEqual({
			reentra: true,
		});
	});
});

describe("o estado inicial da linha reaberta", () => {
	it("linha ESGOTADA reabre com step 0, ATIVO, nextTouchAt = agora, lista vazia e sem motivo", () => {
		const esgotada = estadoInicial({
			objetivo: "carro",
			status: "ESGOTADO",
			step: MAX_TOQUES,
			motivoSaida: "tres_toques_sem_resposta",
			nextTouchAt: null,
			ultimoToqueEm: new Date(AGORA.getTime() - 40 * DIA),
		});
		const autorizacao = autorizacaoDaReentrada("Kairo", "user-1", AGORA);

		const { estado, autorizacao: rastro } = linhaReaberta({
			estadoAnterior: esgotada,
			objetivo: "carro",
			agora: AGORA,
			autorizacao,
		});

		expect(estado.step).toBe(0);
		expect(estado.status).toBe("ATIVO");
		expect(estado.nextTouchAt?.toISOString()).toBe(AGORA.toISOString());
		expect(estado.toquesNaJanela).toEqual([]);
		expect(estado.motivoSaida).toBeNull();
		// O histórico NÃO é apagado: a cota de 30 dias continua contando.
		expect(estado.ultimoToqueEm?.toISOString()).toBe(
			new Date(AGORA.getTime() - 40 * DIA).toISOString(),
		);
		// E o registro de quem autorizou e quando nasce junto.
		expect(rastro).toEqual({
			tipo: "reentrada",
			por: "Kairo",
			porId: "user-1",
			em: AGORA.toISOString(),
		});
	});

	it("linha NOVA (nunca entrou) nasce no mesmo estado inicial", () => {
		const { estado } = linhaReaberta({
			estadoAnterior: null,
			objetivo: "moto",
			agora: AGORA,
			autorizacao: autorizacaoDaReentrada("Kairo", "user-1", AGORA),
		});

		expect(estado.objetivo).toBe("moto");
		expect(estado.step).toBe(0);
		expect(estado.status).toBe("ATIVO");
		expect(estado.nextTouchAt?.toISOString()).toBe(AGORA.toISOString());
		expect(estado.toquesNaJanela).toEqual([]);
		expect(estado.motivoSaida).toBeNull();
	});
});

describe("idempotência: rodar duas vezes não duplica nem reativa quem respondeu", () => {
	it("depois da reentrada a linha está ATIVO — a segunda rodada recusa por `ja_ativo`", () => {
		const antes = parada({
			regua: { status: "ESGOTADO", motivoSaida: "tres_toques_sem_resposta" },
		});
		expect(avaliarReentrada(antes, AGORA, OPCOES)).toEqual({ reentra: true });

		// A linha como ela fica gravada: ATIVO.
		const depois = parada({ regua: { status: "ATIVO", motivoSaida: null } });
		expect(avaliarReentrada(depois, AGORA, OPCOES)).toEqual({
			reentra: false,
			motivo: "ja_ativo",
		});
	});

	it("quem respondeu entre a primeira e a segunda rodada continua fora", () => {
		const respondeu = parada({ regua: { status: "RESPONDEU", motivoSaida: "cliente_respondeu" } });
		expect(avaliarReentrada(respondeu, AGORA, OPCOES)).toEqual({
			reentra: false,
			motivo: "respondeu",
		});
	});
});

describe("o lote: entram só os elegíveis e o resto vem com o motivo", () => {
	it("1 opt-out + 1 da equipe + 1 teste + 2 elegíveis ⇒ entram 2", () => {
		const conversas = [
			parada({ contactId: "optout", optoutDaPessoaEm: new Date(AGORA.getTime() - DIA) }),
			parada({ contactId: "equipe" }),
			parada({ contactId: "teste", isSimulated: true }),
			parada({ contactId: "ok-1" }),
			parada({ contactId: "ok-2" }),
		];

		const vereditos: ResultadoDaReentrada[] = conversas.map((c, i) =>
			avaliarReentrada(c, AGORA, {
				...OPCOES,
				// O 2º da lista (índice 1) é o telefone da equipe.
				telefoneDaEquipe: i === 1,
			}),
		);

		const agregado = agregarReentrada(vereditos);
		expect(agregado.avaliadas).toBe(5);
		expect(agregado.entram).toBe(2);
		expect(agregado.motivos).toEqual({ optout: 1, telefone_da_equipe: 1, teste: 1 });
	});
});

describe("o vocabulário de motivos é fechado e tem rótulo", () => {
	it("todo motivo de não-reentrada tem rótulo em português", async () => {
		const { ROTULO_DO_MOTIVO_DE_NAO_REENTRADA } = await import("./reentrada");
		for (const motivo of MOTIVOS_DE_NAO_REENTRADA) {
			expect(ROTULO_DO_MOTIVO_DE_NAO_REENTRADA[motivo]).toBeTruthy();
		}
		// `perdido` não é motivo de nada: esgotar só para (FIX-386).
		expect(MOTIVOS_DE_NAO_REENTRADA).not.toContain("perdido");
	});
});
