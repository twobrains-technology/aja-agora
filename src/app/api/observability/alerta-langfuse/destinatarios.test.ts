// FIX-431 (P2 #17) — o alerta não tem destinatário padrão no código.
//
// A regra de isolamento da casa é "default vazio + parâmetro explícito":
// e-mail cravado em código é como o alerta de um domínio acaba na caixa de
// outro numa cópia de arquivo. Sem `ALERTA_OBSERVABILIDADE_TO`, a rota registra
// erro de configuração e NÃO envia — silêncio declarado é melhor que entrega no
// lugar errado.
import { describe, expect, it } from "vitest";
import { destinatarios } from "./route";

describe("destinatários do alerta", () => {
	it("sem a env, ninguém recebe (e a rota loga o motivo)", () => {
		expect(destinatarios({})).toEqual([]);
	});

	it("env vazia ou só espaços também não vira destinatário", () => {
		expect(destinatarios({ ALERTA_OBSERVABILIDADE_TO: "  " })).toEqual([]);
	});

	it("um endereço", () => {
		expect(destinatarios({ ALERTA_OBSERVABILIDADE_TO: "contato@twobrains.test" })).toEqual([
			"contato@twobrains.test",
		]);
	});

	it("vários, separados por vírgula, com espaço sobrando", () => {
		expect(
			destinatarios({
				ALERTA_OBSERVABILIDADE_TO: "a@x.test , b@x.test,,c@x.test",
			}),
		).toEqual(["a@x.test", "b@x.test", "c@x.test"]);
	});
});
