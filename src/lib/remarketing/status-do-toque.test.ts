// A CLASSIFICAÇÃO DA FALHA DE ENVIO DA META — pura, sem banco.
//
// FIX-441 (D12). O ciclo carimba o toque ANTES de enviar (a defesa contra
// duplicidade), e quando o envio falha o carimbo precisa ser compensado — mas o
// que fazer depende de QUAL erro a Meta devolveu:
//
//   - 131049 ("not delivered to maintain healthy ecosystem engagement") devolve
//     a cota e a régua volta depois de um backoff de DIAS;
//   - 131050/131026 encerram a régua (a mensagem não vai sair insistindo);
//   - qualquer outra falha compensa a cota e volta com um backoff curto.
//
// A classificação mora aqui, longe do banco, porque é a regra de negócio — o
// ciclo e o webhook só a aplicam.

import { describe, expect, it } from "vitest";
import {
	BACKOFF_DE_DIAS_MS,
	BACKOFF_PADRAO_MS,
	backoffDaFalha,
	classificarDesfechoDoEnvio,
	codigoDaMeta,
	disposicaoDaFalha,
} from "./status-do-toque";

describe("codigoDaMeta — extrai o código da falha de qualquer shape que a Meta manda", () => {
	it("aceita o número cru", () => {
		expect(codigoDaMeta(131049)).toBe(131049);
	});

	it("aceita o objeto do status (`status.errors[0]`)", () => {
		expect(codigoDaMeta({ code: 131050, title: "Re-engagement" })).toBe(131050);
	});

	it("aceita o corpo JSON que o envio devolve como texto", () => {
		expect(
			codigoDaMeta('{"error":{"message":"not delivered","type":"OAuthException","code":131049}}'),
		).toBe(131049);
	});

	it("aceita JSON com `code` no topo", () => {
		expect(codigoDaMeta('{"code":131026,"message":"spam rate"}')).toBe(131026);
	});

	it("cai no texto quando não é JSON (regex do `code`)", () => {
		expect(codigoDaMeta('falhou com "code": 131050 e mais')).toBe(131050);
	});

	it("texto sem código conhecido, vazio, nulo ou shape estranho ⇒ null", () => {
		expect(codigoDaMeta("erro genérico sem número")).toBeNull();
		expect(codigoDaMeta("")).toBeNull();
		expect(codigoDaMeta(null)).toBeNull();
		expect(codigoDaMeta(undefined)).toBeNull();
		expect(codigoDaMeta({ erro: { outro: 1 } })).toBeNull();
		expect(codigoDaMeta([1, 2, 3])).toBeNull();
	});
});

describe("disposicaoDaFalha — o que fazer com a linha", () => {
	it("131049 devolve a cota", () => {
		expect(disposicaoDaFalha(131049)).toBe("devolve_cota");
	});

	it("131050 e 131026 encerram a régua", () => {
		expect(disposicaoDaFalha(131050)).toBe("encerra_regua");
		expect(disposicaoDaFalha(131026)).toBe("encerra_regua");
	});

	it("código desconhecido ou ausente devolve a cota (o lado de menos toque)", () => {
		expect(disposicaoDaFalha(null)).toBe("devolve_cota");
		expect(disposicaoDaFalha(500)).toBe("devolve_cota");
	});
});

describe("backoffDaFalha — quanto esperar para tentar de novo", () => {
	it("131049 espera dias", () => {
		expect(backoffDaFalha(131049)).toBe(BACKOFF_DE_DIAS_MS);
	});

	it("as demais falhas esperam o backoff curto", () => {
		expect(backoffDaFalha(null)).toBe(BACKOFF_PADRAO_MS);
		expect(backoffDaFalha(500)).toBe(BACKOFF_PADRAO_MS);
	});
});

describe("classificarDesfechoDoEnvio — o que aconteceu com o envio", () => {
	// A doutrina da régua é errar pelo lado de MENOS toque: só o AMBÍGUO (timeout
	// depois de a requisição sair) deixa de compensar. Tudo o que com certeza não
	// saiu devolve a cota.

	it("com `wamid` ⇒ saiu", () => {
		expect(classificarDesfechoDoEnvio({ messageId: "wamid.abc" })).toBe("saiu");
	});

	it("exceção ANTES da rede (config, banco, import) ⇒ nao_saiu", () => {
		expect(classificarDesfechoDoEnvio({ error: "env faltando", antesDaRede: true })).toBe(
			"nao_saiu",
		);
	});

	it("erro com código explícito da Meta ⇒ recusado", () => {
		expect(
			classificarDesfechoDoEnvio({
				error: '{"error":{"message":"not delivered","code":131049}}',
			}),
		).toBe("recusado");
	});

	it("timeout/abort DEPOIS de a requisição sair ⇒ ambiguo", () => {
		expect(classificarDesfechoDoEnvio({ timeout: true })).toBe("ambiguo");
	});

	it("conexão que não chegou (`fetch failed`) ⇒ nao_saiu", () => {
		expect(classificarDesfechoDoEnvio({ error: "TypeError: fetch failed" })).toBe("nao_saiu");
	});

	it("HTTP de erro sem `wamid` (502 em HTML) ⇒ nao_saiu", () => {
		expect(classificarDesfechoDoEnvio({ error: "<html>502 Bad Gateway</html>" })).toBe("nao_saiu");
	});

	it("2xx sem `wamid` ⇒ nao_saiu", () => {
		expect(classificarDesfechoDoEnvio({})).toBe("nao_saiu");
		expect(classificarDesfechoDoEnvio({ error: "" })).toBe("nao_saiu");
	});
});
