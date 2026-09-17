// O núcleo PURO da action da tela: o que "segurar" e "soltar" gravam, e quando
// NÃO gravam.
//
// A rota (`/api/admin/remarketing/[conversationId]`) fica com três coisas que
// não se testam sem servidor — sessão, leitura do banco e auditoria. A decisão
// inteira mora em `decidirAcao`, e é ela que este arquivo prova: qual status a
// tela escreve, qual motivo de saída fica gravado e — o mais importante — os
// casos em que o botão tem que RECUSAR em vez de silenciar.

import { describe, expect, it } from "vitest";
import { decidirAcao, MOTIVO_SEGURADO, podeSegurar, podeSoltar } from "./remarketing-tela";

/** 10h em Brasília: dentro da janela de horário da régua (9h–20h). */
const AGORA = new Date("2026-09-17T13:00:00Z");

/** Fora da janela: 3h da manhã em Brasília. */
const MADRUGADA = new Date("2026-09-17T06:00:00Z");

const TOQUE = new Date("2026-09-10T13:00:00Z");

/** A linha como a consulta a devolveria — o que os guardas avaliam. */
function linha(parcial: Partial<Parameters<typeof podeSoltar>[0]> = {}) {
	return {
		status: "ATIVO" as const,
		motivoSaida: null as string | null,
		objetivo: "carro",
		step: 1,
		nextTouchAt: new Date("2026-09-13T13:00:00Z"),
		ultimoToqueEm: TOQUE,
		ultimoInboundEm: new Date("2026-09-10T11:00:00Z"),
		optoutDaPessoaEm: null as Date | null,
		...parcial,
	};
}

describe("segurar", () => {
	it("grava RESPONDEU com o motivo da tela — é o que tira a linha do ciclo", () => {
		const decisao = decidirAcao(linha(), "segurar", AGORA);

		expect(decisao).toEqual({
			ok: true,
			acao: "segurar",
			status: "RESPONDEU",
			motivoSaida: MOTIVO_SEGURADO,
		});
	});

	it("recusa segurar linha que já saiu da régua — não há toque para segurar", () => {
		const decisao = decidirAcao(linha({ status: "ESGOTADO" }), "segurar", AGORA);

		expect(decisao.ok).toBe(false);
		if (decisao.ok) throw new Error("esperava recusa");
		expect(decisao.motivo).toBe("regua_ja_parada");
		expect(decisao.mensagem).toContain("já saiu da régua");
	});

	it("recusa segurar quem pediu opt-out — a régua já não dispara para a pessoa", () => {
		const decisao = decidirAcao(linha({ optoutDaPessoaEm: TOQUE }), "segurar", AGORA);

		expect(decisao.ok).toBe(false);
		if (decisao.ok) throw new Error("esperava recusa");
		expect(decisao.motivo).toBe("optout_do_cliente");
	});
});

describe("soltar", () => {
	it("devolve a linha para ATIVO e limpa o motivo de saída", () => {
		const decisao = decidirAcao(
			linha({ status: "RESPONDEU", motivoSaida: MOTIVO_SEGURADO }),
			"soltar",
			AGORA,
		);

		expect(decisao).toEqual({
			ok: true,
			acao: "soltar",
			status: "ATIVO",
			motivoSaida: null,
		});
	});

	it("recusa soltar o que não está segurado — não há o que soltar", () => {
		const veredito = podeSoltar(linha(), AGORA);

		expect(veredito.pode).toBe(false);
		if (veredito.pode) throw new Error("esperava recusa");
		expect(veredito.motivo).toBe("nao_esta_segurada");
	});

	it("recusa soltar quem pediu opt-out: definitivo, nem à mão volta", () => {
		const veredito = podeSoltar(
			linha({ status: "RESPONDEU", motivoSaida: MOTIVO_SEGURADO, optoutDaPessoaEm: TOQUE }),
			AGORA,
		);

		expect(veredito.pode).toBe(false);
		if (veredito.pode) throw new Error("esperava recusa");
		expect(veredito.motivo).toBe("optout_do_cliente");
		expect(veredito.mensagem).toContain("definitivo");
	});

	it("recusa soltar quem já esgotou os três toques", () => {
		const veredito = podeSoltar(
			linha({ status: "RESPONDEU", motivoSaida: MOTIVO_SEGURADO, step: 3 }),
			AGORA,
		);

		expect(veredito.pode).toBe(false);
		if (veredito.pode) throw new Error("esperava recusa");
		expect(veredito.motivo).toBe("esgotado");
		expect(veredito.mensagem).toContain("três toques");
	});

	// O motor deriva RESPONDEU de "o cliente escreveu depois do último toque".
	// Soltar aqui devolveria a conversa à mesa em loop: o ciclo regravaria o
	// estado no primeiro tick, e a tela mentiria que voltou.
	it("recusa soltar quando o cliente respondeu depois do último toque", () => {
		const veredito = podeSoltar(
			linha({
				status: "RESPONDEU",
				motivoSaida: MOTIVO_SEGURADO,
				ultimoInboundEm: new Date("2026-09-12T13:00:00Z"),
			}),
			AGORA,
		);

		expect(veredito.pode).toBe(false);
		if (veredito.pode) throw new Error("esperava recusa");
		expect(veredito.motivo).toBe("ja_respondeu");
	});

	it("permite soltar com o toque já vencido — o ciclo dispara no próximo tick", () => {
		const veredito = podeSoltar(
			linha({
				status: "RESPONDEU",
				motivoSaida: MOTIVO_SEGURADO,
				nextTouchAt: new Date("2026-09-14T13:00:00Z"),
			}),
			AGORA,
		);

		expect(veredito.pode).toBe(true);
	});

	// Bloqueio de HORÁRIO é do disparo, não da decisão do atendente: às 3h da
	// manhã a régua não fala, mas o operador tem que poder liberar a linha.
	it("permite soltar fora da janela de horário da régua", () => {
		const veredito = podeSoltar(
			linha({
				status: "RESPONDEU",
				motivoSaida: MOTIVO_SEGURADO,
				nextTouchAt: new Date("2026-09-14T13:00:00Z"),
			}),
			MADRUGADA,
		);

		expect(veredito.pode).toBe(true);
	});

	it("mantém o próximo toque gravado — é ele que volta a valer na soltura", () => {
		const estado = linha({
			status: "RESPONDEU",
			motivoSaida: MOTIVO_SEGURADO,
			nextTouchAt: new Date("2026-09-20T13:00:00Z"),
		});

		expect(podeSoltar(estado, AGORA).pode).toBe(true);
		expect(estado.nextTouchAt).toEqual(new Date("2026-09-20T13:00:00Z"));
	});
});

describe("podeSegurar", () => {
	it("só a linha ativa e sem opt-out pode ser segurada", () => {
		expect(podeSegurar(linha()).pode).toBe(true);
		expect(podeSegurar(linha({ status: "CONVERTEU" })).pode).toBe(false);
		expect(podeSegurar(linha({ optoutDaPessoaEm: TOQUE })).pode).toBe(false);
	});
});
